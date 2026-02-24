/**
 * Multimodal Input Pipeline
 * Processes images, PDFs, clipboard content, and screenshots
 * into a format suitable for AI model consumption.
 */

import * as fs from 'fs-extra';
import * as path from 'path';

export type InputType = 'image' | 'pdf' | 'text' | 'clipboard' | 'screenshot' | 'url';

export interface ProcessedInput {
  type: InputType;
  mimeType: string;
  content: string; // base64 for binary, raw for text
  metadata: {
    source: string;
    size: number;
    timestamp: Date;
  };
}

/**
 * Process an input file into a format the AI can consume
 */
export async function processInput(inputPath: string): Promise<ProcessedInput> {
  const absPath = path.resolve(inputPath);

  if (!fs.existsSync(absPath)) {
    throw new Error(`Input file not found: ${absPath}`);
  }

  const ext = path.extname(absPath).toLowerCase();
  const stat = await fs.stat(absPath);

  // Images
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'].includes(ext)) {
    const content = await fs.readFile(absPath);
    return {
      type: 'image',
      mimeType: getMimeType(ext),
      content: content.toString('base64'),
      metadata: { source: absPath, size: stat.size, timestamp: new Date() },
    };
  }

  // PDFs
  if (ext === '.pdf') {
    const content = await fs.readFile(absPath);
    return {
      type: 'pdf',
      mimeType: 'application/pdf',
      content: content.toString('base64'),
      metadata: { source: absPath, size: stat.size, timestamp: new Date() },
    };
  }

  // Text files
  const textContent = await fs.readFile(absPath, 'utf8');
  return {
    type: 'text',
    mimeType: 'text/plain',
    content: textContent,
    metadata: { source: absPath, size: stat.size, timestamp: new Date() },
  };
}

/**
 * Process multiple inputs
 */
export async function processInputs(paths: string[]): Promise<ProcessedInput[]> {
  return Promise.all(paths.map(processInput));
}

/**
 * Detect URLs in a prompt string
 */
export function detectUrls(text: string): string[] {
  const urlPattern = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;
  const matches = text.match(urlPattern);
  return matches ? [...new Set(matches)] : [];
}

/**
 * Check if a file is a supported image type
 */
export function isImageFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'].includes(ext);
}

function getMimeType(ext: string): string {
  const mimeMap: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
  };
  return mimeMap[ext] || 'application/octet-stream';
}
