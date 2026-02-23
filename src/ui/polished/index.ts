/**
 * Polished UI Module - Clean, Claude Code inspired design system
 *
 * Usage:
 *   import { theme, spinner, fmt, getPrompt, getWelcome } from './ui/polished';
 *
 *   // Theme
 *   console.log(theme.accent('Hello'));
 *   console.log(theme.success('Done!'));
 *
 *   // Spinner
 *   const s = spinner('Loading');
 *   await someAction();
 *   s.succeed('Loaded');
 *
 *   // Formatting
 *   console.log(fmt.success('File saved'));
 *   console.log(fmt.code('const x = 1;', 'javascript'));
 *
 *   // Prompt
 *   const prompt = getPrompt({ mode: 'dev' });
 *   const input = await prompt.getInput();
 *
 *   // Welcome
 *   getWelcome().standard();
 */

// Theme
export { PolishedTheme, polishedThemes, theme } from './theme.js';
export type { PolishedColors } from './theme.js';

// Status line
export { StatusLine, getStatusLine } from './status-line.js';
export type { StatusLineConfig } from './status-line.js';

// Progress indicators
export {
  Spinner,
  ProgressBar,
  Steps,
  spinner,
  progressBar,
  steps,
  withSpinner
} from './progress.js';
export type { ProgressConfig } from './progress.js';

// Output formatting
export { OutputFormatter, getFormatter, fmt } from './output.js';

// Prompt
export { Prompt, getPrompt } from './prompt.js';
export type { PromptConfig } from './prompt.js';

// Welcome screen
export { Welcome, getWelcome } from './welcome.js';