/**
 * Priority 2: AST Walker
 * Uses TypeScript Compiler API to extract graph nodes/edges
 */

import ts from 'typescript';
import path from 'path';
import type { GraphNode, GraphEdge } from './graph-storage.js';

export interface WalkResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

function makeNodeId(filePath: string, symbolName?: string, line?: number): string {
  if (symbolName) {
    return `${filePath}:${symbolName}${line ? `:${line}` : ''}`;
  }
  return filePath;
}

function getDocComment(node: ts.Node, sourceFile: ts.SourceFile): string | undefined {
  const fullText = sourceFile.getFullText();
  const nodeStart = node.getFullStart();
  const trivia = fullText.slice(nodeStart, node.getStart(sourceFile));
  const match = trivia.match(/\/\*\*([\s\S]*?)\*\//);
  return match ? match[1].replace(/^\s*\*\s?/gm, '').trim() : undefined;
}

function getLineNumber(node: ts.Node, sourceFile: ts.SourceFile): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

export function walkSourceFile(filePath: string, sourceText: string): WalkResult {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const now = Date.now();

  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true
  );

  const fileNodeId = filePath;
  nodes.push({
    id: fileNodeId,
    node_type: 'file',
    file_path: filePath,
    symbol_name: path.basename(filePath),
    updated_at: now
  });

  function visitNode(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
      const name = ts.isFunctionDeclaration(node) && node.name ? node.name.getText(sourceFile) : undefined;
      if (name) {
        const line = getLineNumber(node, sourceFile);
        const endLine = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
        const params = node.parameters.map(p => p.getText(sourceFile)).join(', ');
        const returnType = node.type ? `: ${node.type.getText(sourceFile)}` : '';

        nodes.push({
          id: makeNodeId(filePath, name, line),
          node_type: 'function',
          file_path: filePath,
          symbol_name: name,
          line_start: line,
          line_end: endLine,
          signature: `function ${name}(${params})${returnType}`,
          doc_comment: getDocComment(node, sourceFile),
          updated_at: now
        });
      }
    }

    if (ts.isClassDeclaration(node) && node.name) {
      const name = node.name.getText(sourceFile);
      const line = getLineNumber(node, sourceFile);
      const endLine = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;

      nodes.push({
        id: makeNodeId(filePath, name, line),
        node_type: 'class',
        file_path: filePath,
        symbol_name: name,
        line_start: line,
        line_end: endLine,
        doc_comment: getDocComment(node, sourceFile),
        updated_at: now
      });

      // Inheritance
      if (node.heritageClauses) {
        for (const clause of node.heritageClauses) {
          if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
            for (const type of clause.types) {
              const parentName = type.expression.getText(sourceFile);
              edges.push({
                from_id: makeNodeId(filePath, name, line),
                to_id: parentName,
                edge_type: 'inherits',
                line_number: line
              });
            }
          }
        }
      }
    }

    if (ts.isImportDeclaration(node)) {
      const moduleSpec = node.moduleSpecifier;
      if (ts.isStringLiteral(moduleSpec)) {
        const importPath = moduleSpec.text;
        const line = getLineNumber(node, sourceFile);

        // Resolve relative imports
        if (importPath.startsWith('.')) {
          const resolvedPath = path.resolve(path.dirname(filePath), importPath);
          const targetId = resolvedPath.replace(/\.(js|ts|jsx|tsx)$/, '') + '.ts';
          edges.push({
            from_id: fileNodeId,
            to_id: targetId,
            edge_type: 'imports',
            line_number: line
          });
        }
      }
    }

    if (ts.isCallExpression(node)) {
      const line = getLineNumber(node, sourceFile);
      let calleeName: string | undefined;

      if (ts.isIdentifier(node.expression)) {
        calleeName = node.expression.getText(sourceFile);
      } else if (ts.isPropertyAccessExpression(node.expression)) {
        calleeName = node.expression.name.getText(sourceFile);
      }

      if (calleeName && calleeName.length > 1) {
        edges.push({
          from_id: fileNodeId,
          to_id: calleeName,
          edge_type: 'calls',
          line_number: line
        });
      }
    }

    ts.forEachChild(node, visitNode);
  }

  visitNode(sourceFile);

  return { nodes, edges };
}
