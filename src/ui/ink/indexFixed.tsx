#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import CanvasAppFixed from './CanvasAppFixed.js';

interface InkUIOptions {
  model?: string;
  onCommand?: (command: string) => Promise<string>;
}

export function startInkUIFixed(options: InkUIOptions = {}) {
  // Check if we're in a TTY environment
  const isInteractive = process.stdin.isTTY && process.stdout.isTTY;
  
  if (!isInteractive) {
    console.error('Error: Ink UI requires an interactive terminal (TTY).');
    console.error('Please run this command directly in your terminal, not through a pipe or script.');
    process.exit(1);
  }

  // Set up stdin for raw mode if supported
  if (process.stdin.setRawMode) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
  
  const app = render(<CanvasAppFixed {...options} />, {
    // Disable experimental warnings
    patchConsole: false,
    // Exit on Ctrl+C
    exitOnCtrlC: true
  });
  
  // Handle cleanup
  app.waitUntilExit().then(() => {
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(false);
    }
    process.stdin.pause();
  });
  
  return app;
}

// Allow running directly
if (process.argv[1]?.endsWith('indexFixed.tsx') || process.argv[1]?.endsWith('indexFixed.js')) {
  startInkUIFixed();
}