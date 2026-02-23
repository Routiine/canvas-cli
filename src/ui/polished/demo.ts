#!/usr/bin/env node
/**
 * Demo of the Polished UI System - All Themes
 * Run with: npx tsx src/ui/polished/demo.ts
 * Or for a specific theme: npx tsx src/ui/polished/demo.ts slate
 */

import {
  PolishedTheme,
  polishedThemes,
  Spinner,
  ProgressBar,
  OutputFormatter,
  StatusLine,
  Welcome
} from './index.js';

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function demoTheme(themeName: string, theme: PolishedTheme, fmt: OutputFormatter): Promise<void> {
  // Theme header
  const headerLine = '═'.repeat(50);
  console.log('');
  console.log(`  ${theme.border(headerLine)}`);
  console.log(`  ${theme.highlight(`  ${themeName.toUpperCase()}  `)}`);
  console.log(`  ${theme.border(headerLine)}`);
  console.log('');

  // Color palette
  console.log(`  ${theme.dim('Color Palette')}`);
  console.log('');
  console.log(`    ${theme.accent('████')} accent        ${theme.accentDim('████')} accentDim`);
  console.log(`    ${theme.text('████')} text          ${theme.dim('████')} dim           ${theme.muted('████')} muted`);
  console.log(`    ${theme.success('████')} success       ${theme.error('████')} error         ${theme.warning('████')} warning`);
  console.log(`    ${theme.info('████')} info          ${theme.code('████')} code          ${theme.highlight('████')} highlight`);
  console.log(`    ${theme.border('████')} border        ${theme.borderDim('████')} borderDim`);
  console.log('');

  // Sample UI elements
  console.log(`  ${theme.dim('UI Elements')}`);
  console.log('');

  // Messages
  console.log(fmt.success('Operation completed successfully'));
  console.log(fmt.error('Connection failed', 'timeout after 30s'));
  console.log(fmt.warning('Deprecated function usage'));
  console.log(fmt.info('Cache hit - using stored response'));
  console.log('');

  // Code block
  console.log(fmt.code(`const theme = new PolishedTheme('${themeName}');
console.log(theme.accent('Hello, World!'));`, 'typescript'));
  console.log('');

  // Key-value
  console.log(`  ${theme.dim('Stats')}`);
  console.log(fmt.keyValue({
    'Theme': themeName,
    'Model': 'llama3.2:1b',
    'Status': 'Ready'
  }));
  console.log('');

  // List
  console.log(`  ${theme.dim('Commands')}`);
  console.log(fmt.list([
    '/help - Show help',
    '/theme - Switch theme',
    '/exit - Quit'
  ]));
  console.log('');

  // Status line
  const status = new StatusLine(theme);
  console.log(`  ${status.render({ mode: 'dev', model: 'llama3.2', tokens: { used: 1234, limit: 4096 } })}`);
  console.log('');

  // Separator
  console.log(`  ${theme.borderDim('─'.repeat(50))}`);
}

async function demoSpinnerForTheme(themeName: string, theme: PolishedTheme): Promise<void> {
  console.log('');
  console.log(`  ${theme.dim('Spinner Animation')}`);

  const s = new Spinner(`Loading ${themeName} theme`, { showDots: true });
  (s as any).theme = theme; // Inject theme
  s.start();
  await sleep(1500);
  s.succeed(`${themeName} theme loaded`);
  console.log('');
}

async function demoProgressForTheme(themeName: string, theme: PolishedTheme): Promise<void> {
  console.log(`  ${theme.dim('Progress Bar')}`);

  const bar = new ProgressBar(10, `Installing ${themeName}`);
  (bar as any).theme = theme;
  for (let i = 0; i <= 10; i++) {
    bar.update(i);
    await sleep(80);
  }
  bar.finish();
  console.log('');
}

async function runSingleThemeDemo(themeName: string): Promise<void> {
  console.clear();

  const theme = new PolishedTheme(themeName);
  const fmt = new OutputFormatter(theme);
  const welcome = new Welcome(theme);

  // Welcome
  welcome.minimal('2.0.0');

  // Full demo for this theme
  await demoTheme(themeName, theme, fmt);
  await demoSpinnerForTheme(themeName, theme);
  await demoProgressForTheme(themeName, theme);

  console.log('');
  console.log(fmt.success(`${themeName} theme demo complete!`));
  console.log('');
}

async function runAllThemesDemo(): Promise<void> {
  console.clear();

  const themeNames = Object.keys(polishedThemes);

  // Header
  console.log('');
  console.log('  ┌─────────────────────────────────────────────────┐');
  console.log('  │         CANVAS CLI - MUTED THEME GALLERY        │');
  console.log('  │                                                 │');
  console.log('  │    sage  •  mauve  •  slate  •  bronze          │');
  console.log('  └─────────────────────────────────────────────────┘');
  console.log('');

  await sleep(1000);

  // Demo each theme
  for (const themeName of themeNames) {
    const theme = new PolishedTheme(themeName);
    const fmt = new OutputFormatter(theme);

    await demoTheme(themeName, theme, fmt);
    await sleep(800);
  }

  // Interactive elements (using default slate)
  const theme = new PolishedTheme('slate');
  const fmt = new OutputFormatter(theme);

  console.log('');
  console.log(`  ${theme.highlight('Interactive Elements')}`);
  console.log('');

  // Spinner demo
  for (const themeName of themeNames) {
    const t = new PolishedTheme(themeName);
    const s = new Spinner(`Testing ${themeName}`);
    (s as any).theme = t;
    s.start();
    await sleep(600);
    s.succeed();
  }

  console.log('');

  // Progress bar demo
  console.log(`  ${theme.dim('Progress')}`);
  const bar = new ProgressBar(themeNames.length * 5, 'Loading all themes');
  for (let i = 0; i <= themeNames.length * 5; i++) {
    bar.update(i);
    await sleep(50);
  }
  bar.finish('All themes loaded');

  console.log('');
  console.log(`  ${theme.borderDim('═'.repeat(50))}`);
  console.log('');
  console.log(fmt.success('Theme gallery complete!'));
  console.log('');
  console.log(`  ${theme.dim('Usage:')} new PolishedTheme('sage' | 'mauve' | 'slate' | 'bronze')`);
  console.log('');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const requestedTheme = args[0]?.toLowerCase();

  if (requestedTheme && polishedThemes[requestedTheme]) {
    await runSingleThemeDemo(requestedTheme);
  } else if (requestedTheme) {
    console.error(`Unknown theme: ${requestedTheme}`);
    console.error(`Available themes: ${Object.keys(polishedThemes).join(', ')}`);
    process.exit(1);
  } else {
    await runAllThemesDemo();
  }
}

main().catch(console.error);