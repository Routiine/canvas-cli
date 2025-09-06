#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import CanvasApp from './CanvasApp.js';

interface InkUIOptions {
  model?: string;
  onCommand?: (command: string) => Promise<string>;
}

export function startInkUI(options: InkUIOptions = {}) {
  const app = render(<CanvasApp {...options} />);
  return app;
}

// Allow running directly
if (process.argv[1]?.endsWith('index.tsx') || process.argv[1]?.endsWith('index.js')) {
  startInkUI();
}