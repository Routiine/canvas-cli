/**
 * Terminal Image Display
 * Renders images in terminal using kitty graphics protocol or sixel encoding.
 * Falls back to ASCII placeholder when neither protocol is supported.
 */

import * as fs from 'fs';
import * as path from 'path';

export type ImageProtocol = 'kitty' | 'sixel' | 'iterm' | 'none';

/**
 * Detect which image protocol the terminal supports
 */
export function detectProtocol(): ImageProtocol {
  const term = process.env.TERM || '';
  const termProgram = process.env.TERM_PROGRAM || '';
  const kittyPid = process.env.KITTY_PID;
  const konsole = process.env.KONSOLE_VERSION;

  // Kitty terminal
  if (kittyPid || term === 'xterm-kitty') return 'kitty';

  // iTerm2
  if (termProgram === 'iTerm.app') return 'iterm';

  // Terminals with sixel support
  if (term.includes('xterm') || konsole || termProgram === 'WezTerm') return 'sixel';

  return 'none';
}

/**
 * Display an image in the terminal
 */
export async function displayImage(
  imagePath: string,
  options: {
    maxWidth?: number;
    maxHeight?: number;
    protocol?: ImageProtocol;
  } = {}
): Promise<string> {
  const protocol = options.protocol || detectProtocol();

  if (!fs.existsSync(imagePath)) {
    return `[Image not found: ${imagePath}]`;
  }

  const data = fs.readFileSync(imagePath);
  const base64 = data.toString('base64');
  const ext = path.extname(imagePath).toLowerCase();
  const mimeType = getMimeType(ext);

  switch (protocol) {
    case 'kitty':
      return renderKitty(base64, options.maxWidth, options.maxHeight);
    case 'iterm':
      return renderITerm(base64, imagePath, options.maxWidth, options.maxHeight);
    case 'sixel':
      return renderSixelPlaceholder(imagePath, data.length);
    default:
      return renderAsciiPlaceholder(imagePath, mimeType, data.length);
  }
}

/**
 * Render using Kitty Graphics Protocol
 * https://sw.kovidgoyal.net/kitty/graphics-protocol/
 */
function renderKitty(base64: string, maxWidth?: number, maxHeight?: number): string {
  const chunks: string[] = [];
  const chunkSize = 4096;

  for (let i = 0; i < base64.length; i += chunkSize) {
    const chunk = base64.slice(i, i + chunkSize);
    const isLast = i + chunkSize >= base64.length;

    if (i === 0) {
      // First chunk: include metadata
      const params = [
        'a=T',      // action: transmit and display
        'f=100',    // format: PNG
        'm=1',      // more chunks follow (unless last)
        ...(maxWidth ? [`c=${maxWidth}`] : []),
        ...(maxHeight ? [`r=${maxHeight}`] : []),
      ];
      if (isLast) params[2] = 'm=0';
      chunks.push(`\x1b_G${params.join(',')};${chunk}\x1b\\`);
    } else {
      chunks.push(`\x1b_Gm=${isLast ? '0' : '1'};${chunk}\x1b\\`);
    }
  }

  return chunks.join('');
}

/**
 * Render using iTerm2 Inline Images Protocol
 * https://iterm2.com/documentation-images.html
 */
function renderITerm(
  base64: string,
  filePath: string,
  maxWidth?: number,
  maxHeight?: number
): string {
  const name = Buffer.from(path.basename(filePath)).toString('base64');
  const params = [
    `name=${name}`,
    'inline=1',
    ...(maxWidth ? [`width=${maxWidth}`] : []),
    ...(maxHeight ? [`height=${maxHeight}`] : []),
  ];
  return `\x1b]1337;File=${params.join(';')}:${base64}\x07`;
}

/**
 * Sixel encoding requires image conversion — show placeholder with instructions
 */
function renderSixelPlaceholder(imagePath: string, size: number): string {
  const sizeStr = size > 1024 ? `${(size / 1024).toFixed(1)}KB` : `${size}B`;
  return [
    `┌─ Image: ${path.basename(imagePath)} (${sizeStr})`,
    '│  [Sixel display requires img2sixel]',
    `│  Run: img2sixel "${imagePath}"`,
    '└─',
  ].join('\n');
}

/**
 * ASCII fallback for unsupported terminals
 */
function renderAsciiPlaceholder(filePath: string, mimeType: string, size: number): string {
  const sizeStr = size > 1024 * 1024
    ? `${(size / (1024 * 1024)).toFixed(1)}MB`
    : size > 1024
      ? `${(size / 1024).toFixed(1)}KB`
      : `${size}B`;

  return [
    `┌─────────────────────────────────┐`,
    `│  [Image]                        │`,
    `│  ${path.basename(filePath).padEnd(30)}  │`,
    `│  ${mimeType.padEnd(30)}  │`,
    `│  ${sizeStr.padEnd(30)}  │`,
    `└─────────────────────────────────┘`,
  ].join('\n');
}

/**
 * Display a base64 image inline (for multimodal responses)
 */
export function displayBase64Image(
  base64Data: string,
  mimeType: string,
  options: { maxWidth?: number; maxHeight?: number; protocol?: ImageProtocol } = {}
): string {
  const protocol = options.protocol || detectProtocol();

  switch (protocol) {
    case 'kitty':
      return renderKitty(base64Data, options.maxWidth, options.maxHeight);
    case 'iterm':
      return renderITerm(base64Data, 'image', options.maxWidth, options.maxHeight);
    default: {
      const sizeStr = `~${Math.round(base64Data.length * 0.75 / 1024)}KB`;
      return `[${mimeType} image, ${sizeStr}]`;
    }
  }
}

function getMimeType(ext: string): string {
  const types: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.bmp': 'image/bmp',
    '.ico': 'image/x-icon',
  };
  return types[ext] || 'image/unknown';
}
