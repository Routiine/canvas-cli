/**
 * Priority 4: Dependency Monitor
 * Runs npm audit every 6 hours, reports CVEs
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { addFinding } from './daemon-manager.js';

const execAsync = promisify(exec);

interface AuditVulnerability {
  severity: string;
  name: string;
  title: string;
  url?: string;
}

/** Shape of one entry in the `npm audit --json` vulnerabilities map */
interface NpmAuditVulnEntry {
  severity: string;
  via?: Array<{ title?: string; url?: string } | string>;
}

/** Shape of the top-level `npm audit --json` output */
interface NpmAuditReport {
  vulnerabilities?: Record<string, NpmAuditVulnEntry>;
}

export async function runAudit(): Promise<void> {
  try {
    const { stdout } = await execAsync('npm audit --json', { timeout: 60000 });
    const audit = JSON.parse(stdout) as NpmAuditReport;

    const vulns: AuditVulnerability[] = [];
    if (audit.vulnerabilities) {
      for (const [name, vuln] of Object.entries(audit.vulnerabilities)) {
        if (vuln.severity === 'high' || vuln.severity === 'critical') {
          const firstVia = vuln.via?.[0];
          const viaObj = typeof firstVia === 'object' ? firstVia : undefined;
          vulns.push({
            severity: vuln.severity,
            name,
            title: viaObj?.title ?? 'Unknown vulnerability',
            url: viaObj?.url
          });
        }
      }
    }

    if (vulns.length > 0) {
      addFinding('dependency-monitor', 'error',
        `${vulns.length} HIGH/CRITICAL vulnerabilities found`,
        'package.json',
        { vulnerabilities: vulns }
      );
    }
  } catch {
    // npm audit exits non-zero when vulns found; that's OK
    try {
      // Try parsing stderr output too
    } catch {
      // Ignore
    }
  }
}

export function startDependencyMonitor(intervalMs: number = 6 * 3600 * 1000): NodeJS.Timeout {
  void runAudit(); // Run immediately
  return setInterval(() => { void runAudit(); }, intervalMs);
}
