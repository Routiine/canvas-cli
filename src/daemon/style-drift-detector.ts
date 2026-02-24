/**
 * Priority 4: Style Drift Detector
 * Detects coding style inconsistencies on commits
 */

import fs from 'fs-extra';
import simpleGit from 'simple-git';
import { addFinding } from './daemon-manager.js';

const git = simpleGit();

interface StylePattern {
  name: string;
  pattern: RegExp;
  baseline: number; // expected frequency per 100 lines
}

const STYLE_PATTERNS: StylePattern[] = [
  { name: 'async-await', pattern: /\basync\s+function\b|\basync\s+\(/g, baseline: 5 },
  { name: 'arrow-functions', pattern: /=>\s*[\{(]/g, baseline: 10 },
  { name: 'const-usage', pattern: /\bconst\b/g, baseline: 15 },
  { name: 'type-annotations', pattern: /:\s*\w+[<\[]?\s*[>|\]]?\s*[=;,)]/g, baseline: 8 },
];

export async function detectStyleDrift(): Promise<void> {
  try {
    const diff = await git.diff(['HEAD~1', 'HEAD', '--name-only']);
    const changedFiles = diff.split('\n').filter(f => f.endsWith('.ts'));

    for (const file of changedFiles) {
      try {
        if (!await fs.pathExists(file)) continue;
        const content = await fs.readFile(file, 'utf-8');
        const lineCount = content.split('\n').length;

        for (const pattern of STYLE_PATTERNS) {
          const matches = content.match(pattern.pattern) || [];
          const frequency = (matches.length / lineCount) * 100;

          // Flag significant deviations (>3x or <0.3x baseline)
          if (frequency > pattern.baseline * 3 || (frequency < pattern.baseline * 0.3 && lineCount > 50)) {
            addFinding('style-drift', 'info',
              `Style drift: ${pattern.name} frequency (${frequency.toFixed(1)}/100 lines vs baseline ${pattern.baseline})`,
              file,
              { pattern: pattern.name, frequency, baseline: pattern.baseline }
            );
          }
        }
      } catch {
        // Skip unreadable files
      }
    }
  } catch {
    // Git may not be available
  }
}
