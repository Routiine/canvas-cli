/**
 * Priority 2: Data Flow Analyzer
 * Traces variables from input boundaries (function params, HTTP req, process.env)
 * through assignments to output/storage sinks (return, db writes, fs writes, res.send)
 */

import ts from 'typescript';
import path from 'path';
import { getGraphStorage } from './graph-storage.js';

export type SourceKind = 'param' | 'env' | 'http_request' | 'user_input' | 'file_read';
export type SinkKind = 'return' | 'db_write' | 'fs_write' | 'http_response' | 'log' | 'exec';

export interface DataFlowNode {
  name: string;
  kind: 'source' | 'sink' | 'transform';
  sourceKind?: SourceKind;
  sinkKind?: SinkKind;
  filePath: string;
  line: number;
}

export interface DataFlowEdge {
  from: string;  // variable name
  to: string;    // variable name or sink label
  filePath: string;
  line: number;
}

export interface DataFlowResult {
  sources: DataFlowNode[];
  sinks: DataFlowNode[];
  edges: DataFlowEdge[];
  paths: Array<{ source: DataFlowNode; sink: DataFlowNode; hops: number }>;
}

// Patterns that indicate untrusted input sources
const SOURCE_PATTERNS = {
  env: /process\.env\[?['"]?\w+['"]?\]?/,
  http_request: /\breq\.(body|query|params|headers)\b/,
  user_input: /\bprocess\.argv\b|\breadline\b|\bstdin\b/,
  file_read: /\bfs\.readFile\b|\bfs\.readFileSync\b|\breadFile\b/,
};

// Patterns that indicate data reaching a sink
const SINK_PATTERNS = {
  db_write: /\b(?:db|database|stmt|query)\s*\.\s*(?:run|exec|prepare|query)\s*\(/,
  fs_write: /\bfs\.write(?:File|Sync)?\b|\bfs\.append\b/,
  http_response: /\bres\.(?:send|json|write|end)\s*\(/,
  log: /\bconsole\.\w+\s*\(|logger\.\w+\s*\(/,
  exec: /\bexec(?:Sync|Async)?\s*\(|\bspawn\s*\(|\bexecFile\s*\(/,
};

function getLine(node: ts.Node, sf: ts.SourceFile): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

export function analyzeDataFlow(filePath: string, sourceText: string): DataFlowResult {
  const sf = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  const sources: DataFlowNode[] = [];
  const sinks: DataFlowNode[] = [];
  const edges: DataFlowEdge[] = [];

  // Track variable assignments for taint propagation
  const taintedVars = new Set<string>();

  function checkForSources(node: ts.Node, varName?: string): SourceKind | undefined {
    const text = node.getText(sf);
    for (const [kind, pattern] of Object.entries(SOURCE_PATTERNS)) {
      if (pattern.test(text)) return kind as SourceKind;
    }
    return undefined;
  }

  function checkForSinks(node: ts.Node): SinkKind | undefined {
    const text = node.getText(sf);
    for (const [kind, pattern] of Object.entries(SINK_PATTERNS)) {
      if (pattern.test(text)) return kind as SinkKind;
    }
    return undefined;
  }

  function visit(node: ts.Node): void {
    // Check function parameters as sources
    if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      for (const param of node.parameters) {
        const paramName = param.name.getText(sf);
        // HTTP handler pattern: (req, res) or (request, response)
        if (/^req(?:uest)?$/.test(paramName)) {
          sources.push({
            name: paramName,
            kind: 'source',
            sourceKind: 'http_request',
            filePath,
            line: getLine(param, sf)
          });
          taintedVars.add(paramName);
        }
      }
    }

    // Variable declarations: track taint propagation
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const varName = ts.isIdentifier(node.name) ? node.name.getText(sf) : undefined;
      if (varName) {
        const sourceKind = checkForSources(node.initializer, varName);
        if (sourceKind) {
          sources.push({ name: varName, kind: 'source', sourceKind, filePath, line: getLine(node, sf) });
          taintedVars.add(varName);
        } else {
          // Check if RHS references a tainted var
          const initText = node.initializer.getText(sf);
          for (const tv of taintedVars) {
            if (new RegExp(`\\b${tv}\\b`).test(initText)) {
              taintedVars.add(varName);
              edges.push({ from: tv, to: varName, filePath, line: getLine(node, sf) });
              break;
            }
          }
        }
      }
    }

    // Call expressions: detect sinks
    if (ts.isCallExpression(node)) {
      const sinkKind = checkForSinks(node);
      if (sinkKind) {
        const line = getLine(node, sf);
        const nodeText = node.getText(sf).slice(0, 60);
        const sinkLabel = `${sinkKind}:${line}`;

        sinks.push({ name: sinkLabel, kind: 'sink', sinkKind, filePath, line });

        // Check if any argument references a tainted var
        for (const arg of node.arguments) {
          const argText = arg.getText(sf);
          for (const tv of taintedVars) {
            if (new RegExp(`\\b${tv}\\b`).test(argText)) {
              edges.push({ from: tv, to: sinkLabel, filePath, line });
            }
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sf);

  // Build source→sink paths
  const paths: DataFlowResult['paths'] = [];
  for (const source of sources) {
    for (const sink of sinks) {
      // Simple reachability: does any edge chain connect source to sink?
      const reachable = edges.some(e => e.from === source.name) &&
        edges.some(e => e.to === sink.name);
      if (reachable) {
        paths.push({ source, sink, hops: 2 });
      }
    }
  }

  return { sources, sinks, edges, paths };
}

export async function analyzeFileDataFlow(filePath: string): Promise<DataFlowResult> {
  const { readFile } = await import('fs/promises');
  const content = await readFile(filePath, 'utf-8');
  return analyzeDataFlow(filePath, content);
}

export function getDataFlowSummary(result: DataFlowResult): string {
  const lines: string[] = [
    `Sources: ${result.sources.length} | Sinks: ${result.sinks.length} | Flows: ${result.paths.length}`,
  ];

  for (const p of result.paths) {
    lines.push(`  ${p.source.sourceKind || 'input'}:${p.source.name} → ${p.sink.sinkKind || 'output'} (line ${p.sink.line})`);
  }

  return lines.join('\n');
}
