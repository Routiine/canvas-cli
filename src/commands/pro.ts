/**
 * canvas pro — Pro tier management commands
 *
 * Subcommands:
 *   canvas pro subscribe     — open Stripe checkout in browser
 *   canvas pro status        — show current subscription status
 *   canvas pro activate <key>— activate a license key
 *   canvas pro cancel        — cancel subscription
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';

import {
  isProUser,
  getProStatus,
  setProActive,
  setProInactive,
  promptUpgrade,
  PRO_FEATURES,
  FREE_FEATURES,
  PRO_PRICE_USD,
} from '../pro/index.js';
import {
  createCheckoutSession,
  verifySubscription,
  generateLicenseKey,
  validateLicenseKey,
  cancelSubscription,
  getBillingSummary,
} from '../pro/billing.js';
import { loadConfig, saveConfig } from '../config.js';

export function createProCommand(): Command {
  const pro = new Command('pro')
    .description('Manage Canvas Pro subscription ($15/month)');

  // canvas pro subscribe
  pro
    .command('subscribe')
    .description('Subscribe to Canvas Pro — opens Stripe checkout in your browser')
    .option('-e, --email <email>', 'Email address for the subscription')
    .action(async (opts: { email?: string }) => {
      let email = opts.email;

      if (!email) {
        const config = loadConfig();
        email = config.pro_email;
      }

      if (!email) {
        // Prompt for email interactively
        const inquirer = await import('inquirer');
        const { enteredEmail } = await inquirer.default.prompt([{
          type: 'input',
          name: 'enteredEmail',
          message: 'Enter your email for the Pro subscription:',
          validate: (input: string) => {
            const trimmed = input.trim();
            if (!trimmed) return 'Email is required';
            if (!/.+@.+\..+/.test(trimmed)) return 'Please enter a valid email';
            return true;
          },
        }]);
        email = enteredEmail.trim();
      }

      const spinner = ora('Creating Stripe checkout session...').start();

      try {
        const { url, sessionId } = await createCheckoutSession(email!);

        // Save email + session id to config for later verification
        const config = loadConfig();
        saveConfig({
          ...config,
          pro_email: email,
          pro_status: 'pending',
        });

        spinner.succeed('Checkout session created!');

        console.log(chalk.cyan('\n  Opening your browser to Stripe checkout...'));
        console.log(chalk.gray(`  Session ID: ${sessionId}`));
        console.log(chalk.gray(`  If your browser doesn't open, visit:\n  ${url}\n`));

        // Try to open the browser (platform-specific, no external dep required)
        try {
          const { exec } = await import('child_process');
          const { promisify } = await import('util');
          const execAsync = promisify(exec);
          const platform = process.platform;
          const openCmd =
            platform === 'win32' ? `start "" "${url}"` :
            platform === 'darwin' ? `open "${url}"` :
            `xdg-open "${url}"`;
          await execAsync(openCmd);
        } catch {
          // Browser auto-open is best-effort — URL is printed above
        }

        console.log(chalk.gray('  After completing checkout, run:'));
        console.log(chalk.gray('    canvas pro status'));
        console.log(chalk.gray('  to verify your subscription is active.\n'));
      } catch (err) {
        spinner.fail('Failed to create checkout session.');
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`  ${msg}`));

        // Helpful fallback when Stripe isn't configured
        if (msg.includes('not configured')) {
          console.log(chalk.gray('\n  To enable Pro billing:'));
          console.log(chalk.gray('    1. Set STRIPE_SECRET_KEY in your environment'));
          console.log(chalk.gray('    2. Set STRIPE_PRICE_ID_PRO to your $15/mo price ID'));
          console.log(chalk.gray('    3. Set APP_URL to your app URL'));
          console.log(chalk.gray('  See PRO.md for detailed setup instructions.\n'));
        }
      }
    });

  // canvas pro status
  pro
    .command('status')
    .description('Show current Pro subscription status')
    .action(async () => {
      console.log(getBillingSummary());

      const status = getProStatus();

      if (status.isPro) {
        console.log(chalk.green.bold('  ✨ You have Canvas Pro!'));
        console.log(chalk.gray('  Pro features available:'));
        for (const f of PRO_FEATURES) {
          console.log(chalk.green(`    ✓ ${prettify(f)}`));
        }
      } else {
        console.log(chalk.gray('  Free features available:'));
        for (const f of FREE_FEATURES) {
          console.log(chalk.gray(`    • ${prettify(f)}`));
        }
        console.log('');
        console.log(chalk.gray('  Pro features (locked):'));
        for (const f of PRO_FEATURES) {
          console.log(chalk.gray(`    ✗ ${prettify(f)}`));
        }
        console.log('');
        console.log(chalk.cyan(`  Upgrade for $${PRO_PRICE_USD}/month: canvas pro subscribe`));
      }

      // Optionally verify online
      if (status.email && process.env.STRIPE_SECRET_KEY) {
        const spinner = ora('Verifying with Stripe...').start();
        try {
          const sub = await verifySubscription(status.email);
          spinner.stop();
          if (sub?.active) {
            console.log(chalk.green('\n  ✓ Stripe confirms: subscription is active'));
            if (sub.currentPeriodEnd) {
              const date = new Date(sub.currentPeriodEnd * 1000).toLocaleDateString();
              console.log(chalk.gray(`    Renews on: ${date}`));
            }
            if (sub.cancelAtPeriodEnd) {
              console.log(chalk.yellow('    ⚠ Will cancel at end of current period'));
            }
          } else if (sub && !sub.active) {
            console.log(chalk.yellow('\n  ⚠ Stripe reports: no active subscription'));
          }
        } catch {
          spinner.stop();
          // Non-fatal — offline status is still shown
        }
      }

      console.log('');
    });

  // canvas pro activate <key>
  pro
    .command('activate <key>')
    .description('Activate a Pro license key')
    .action(async (key: string) => {
      const spinner = ora('Validating license key...').start();

      try {
        const result = await validateLicenseKey(key, false);

        if (!result.valid) {
          spinner.fail('License key is invalid.');
          console.error(chalk.red(`  ${result.reason}`));
          process.exitCode = 1;
          return;
        }

        // Activate: persist to config
        const config = loadConfig();
        setProActive(config.pro_email, key);

        spinner.succeed('Canvas Pro activated! 🎉');
        console.log(chalk.green('\n  ✨ All Pro features are now unlocked:'));
        for (const f of PRO_FEATURES) {
          console.log(chalk.green(`    ✓ ${prettify(f)}`));
        }
        console.log('');
      } catch (err) {
        spinner.fail('Activation failed.');
        console.error(chalk.red(`  ${err instanceof Error ? err.message : String(err)}`));
        process.exitCode = 1;
      }
    });

  // canvas pro cancel
  pro
    .command('cancel')
    .description('Cancel your Pro subscription')
    .option('--confirm', 'Skip confirmation prompt')
    .action(async (opts: { confirm?: boolean }) => {
      const status = getProStatus();

      if (!status.isPro && status.status === 'free') {
        console.log(chalk.gray('  You are on the free tier — nothing to cancel.'));
        return;
      }

      if (!opts.confirm) {
        const inquirer = await import('inquirer');
        const { sure } = await inquirer.default.prompt([{
          type: 'confirm',
          name: 'sure',
          message: 'Cancel your Canvas Pro subscription?',
          default: false,
        }]);
        if (!sure) {
          console.log(chalk.gray('  Canceled — your subscription remains active.'));
          return;
        }
      }

      const spinner = ora('Canceling subscription...').start();

      try {
        // If we have a license key only (offline), just clear local status
        const config = loadConfig();
        if (config.pro_license_key && !process.env.STRIPE_SECRET_KEY) {
          setProInactive();
          spinner.succeed('Pro license deactivated locally.');
        } else {
          // Try to cancel via Stripe — we need a subscription ID.
          // In a real deployment, the subscription ID would be stored in config
          // or looked up via the customer email.
          const sub = status.email ? await verifySubscription(status.email) : null;
          if (sub?.subscriptionId) {
            const ok = await cancelSubscription(sub.subscriptionId);
            if (ok) {
              spinner.succeed('Subscription canceled.');
            } else {
              spinner.fail('Failed to cancel via Stripe.');
              setProInactive();
            }
          } else {
            // No Stripe subscription found — clear local status
            setProInactive();
            spinner.succeed('Pro status cleared.');
          }
        }

        console.log(chalk.gray('\n  You are now on the free tier.'));
        console.log(chalk.gray('  Your Pro features will stop working immediately.'));
        console.log(chalk.gray('  Resubscribe anytime: canvas pro subscribe\n'));
      } catch (err) {
        spinner.fail('Cancellation failed.');
        console.error(chalk.red(`  ${err instanceof Error ? err.message : String(err)}`));
        process.exitCode = 1;
      }
    });

  // canvas pro features — list all features and their availability
  pro
    .command('features')
    .description('List all features and their availability for your tier')
    .action(() => {
      const isPro = isProUser();
      console.log(chalk.cyan.bold('\n  🎨 Canvas CLI Features\n'));

      console.log(chalk.green.bold('  Free features (always available):'));
      for (const f of FREE_FEATURES) {
        console.log(chalk.green(`    ✓ ${prettify(f)}`));
      }

      console.log('');
      console.log(chalk.magenta.bold(`  Pro features ($${PRO_PRICE_USD}/month):`));
      for (const f of PRO_FEATURES) {
        const available = isPro;
        const icon = available ? chalk.green('✓') : chalk.gray('✗');
        const label = available ? chalk.white(prettify(f)) : chalk.gray(prettify(f));
        console.log(`    ${icon} ${label}`);
      }

      if (!isPro) {
        console.log('');
        console.log(chalk.cyan(`  Unlock all Pro features: canvas pro subscribe`));
      }
      console.log('');
    });

  return pro;
}

/**
 * Convert snake_case to Title Case for display.
 */
function prettify(feature: string): string {
  return feature
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}