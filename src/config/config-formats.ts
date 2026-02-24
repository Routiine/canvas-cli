/**
 * Config Format Support
 * Loads configuration from JSON, TOML, or YAML files.
 * Auto-detects format from file extension.
 */

import * as fs from 'fs';
import * as path from 'path';

export type ConfigFormat = 'json' | 'toml' | 'yaml';

/**
 * Detect config format from file extension
 */
export function detectFormat(filePath: string): ConfigFormat {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.toml': return 'toml';
    case '.yaml':
    case '.yml': return 'yaml';
    default: return 'json';
  }
}

/**
 * Parse config content based on format
 */
export function parseConfig(content: string, format: ConfigFormat): Record<string, unknown> {
  switch (format) {
    case 'json':
      return JSON.parse(content);
    case 'toml':
      return parseTOML(content);
    case 'yaml':
      return parseYAML(content);
    default:
      return JSON.parse(content);
  }
}

/**
 * Serialize config to a specific format
 */
export function serializeConfig(data: Record<string, unknown>, format: ConfigFormat): string {
  switch (format) {
    case 'json':
      return JSON.stringify(data, null, 2);
    case 'toml':
      return serializeTOML(data);
    case 'yaml':
      return serializeYAML(data);
    default:
      return JSON.stringify(data, null, 2);
  }
}

/**
 * Find the first existing config file from a list of candidates
 */
export function findConfigFile(dir: string, baseName: string): { path: string; format: ConfigFormat } | null {
  const candidates = [
    { file: `${baseName}.json`, format: 'json' as ConfigFormat },
    { file: `${baseName}.toml`, format: 'toml' as ConfigFormat },
    { file: `${baseName}.yaml`, format: 'yaml' as ConfigFormat },
    { file: `${baseName}.yml`, format: 'yaml' as ConfigFormat },
  ];

  for (const { file, format } of candidates) {
    const fullPath = path.join(dir, file);
    if (fs.existsSync(fullPath)) {
      return { path: fullPath, format };
    }
  }
  return null;
}

/**
 * Load config from any supported format
 */
export function loadConfigFile(filePath: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf-8');
    const format = detectFormat(filePath);
    return parseConfig(content, format);
  } catch {
    return null;
  }
}

/**
 * Save config to a file in the appropriate format
 */
export function saveConfigFile(filePath: string, data: Record<string, unknown>): void {
  const format = detectFormat(filePath);
  const content = serializeConfig(data, format);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content, 'utf-8');
}

// ── Lightweight TOML parser (handles common subset) ──

function parseTOML(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let currentSection = result;
  let currentPath: string[] = [];

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    // Section header [section] or [section.sub]
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentPath = sectionMatch[1].split('.');
      currentSection = result;
      for (const key of currentPath) {
        if (!(key in currentSection) || typeof currentSection[key] !== 'object') {
          (currentSection as Record<string, unknown>)[key] = {};
        }
        currentSection = (currentSection as Record<string, unknown>)[key] as Record<string, unknown>;
      }
      continue;
    }

    // Key = value
    const kvMatch = line.match(/^([^=]+?)\s*=\s*(.+)$/);
    if (kvMatch) {
      const key = kvMatch[1].trim();
      const rawValue = kvMatch[2].trim();
      (currentSection as Record<string, unknown>)[key] = parseTOMLValue(rawValue);
    }
  }

  return result;
}

function parseTOMLValue(value: string): unknown {
  // String (quoted)
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  // Boolean
  if (value === 'true') return true;
  if (value === 'false') return false;
  // Integer
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  // Float
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
  // Array
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map(v => parseTOMLValue(v.trim()));
  }
  return value;
}

function serializeTOML(data: Record<string, unknown>, prefix = ''): string {
  const lines: string[] = [];
  const sections: Array<[string, Record<string, unknown>]> = [];

  for (const [key, value] of Object.entries(data)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      sections.push([prefix ? `${prefix}.${key}` : key, value as Record<string, unknown>]);
    } else {
      lines.push(`${key} = ${serializeTOMLValue(value)}`);
    }
  }

  let result = lines.join('\n');
  for (const [sectionKey, sectionData] of sections) {
    result += `\n\n[${sectionKey}]\n`;
    result += serializeTOML(sectionData, sectionKey);
  }

  return result;
}

function serializeTOMLValue(value: unknown): string {
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return `[${value.map(serializeTOMLValue).join(', ')}]`;
  return String(value);
}

// ── Lightweight YAML parser (handles common subset) ──

function parseYAML(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const stack: Array<{ obj: Record<string, unknown>; indent: number }> = [{ obj: result, indent: -1 }];

  for (const rawLine of content.split('\n')) {
    if (!rawLine.trim() || rawLine.trim().startsWith('#')) continue;

    const indent = rawLine.search(/\S/);
    const line = rawLine.trim();

    // Pop stack to find parent at correct indent level
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const kvMatch = line.match(/^([^:]+?):\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1].trim();
      const rawValue = kvMatch[2].trim();
      const parent = stack[stack.length - 1].obj;

      if (rawValue === '' || rawValue === '|' || rawValue === '>') {
        // Nested object
        const newObj: Record<string, unknown> = {};
        parent[key] = newObj;
        stack.push({ obj: newObj, indent });
      } else {
        parent[key] = parseYAMLValue(rawValue);
      }
    }
  }

  return result;
}

function parseYAMLValue(value: string): unknown {
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  if (value === 'true' || value === 'yes') return true;
  if (value === 'false' || value === 'no') return false;
  if (value === 'null' || value === '~') return null;
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map(v => parseYAMLValue(v.trim()));
  }
  return value;
}

function serializeYAML(data: Record<string, unknown>, indent = 0): string {
  const lines: string[] = [];
  const prefix = '  '.repeat(indent);

  for (const [key, value] of Object.entries(data)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      lines.push(`${prefix}${key}:`);
      lines.push(serializeYAML(value as Record<string, unknown>, indent + 1));
    } else {
      lines.push(`${prefix}${key}: ${serializeYAMLValue(value)}`);
    }
  }

  return lines.join('\n');
}

function serializeYAMLValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') {
    if (value.includes(':') || value.includes('#') || value.includes("'") || value.includes('"')) {
      return `"${value.replace(/"/g, '\\"')}"`;
    }
    return value;
  }
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return `[${value.map(serializeYAMLValue).join(', ')}]`;
  return String(value);
}
