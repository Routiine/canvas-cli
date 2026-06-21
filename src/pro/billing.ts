/**
 * Canvas CLI Pro — Stripe billing integration
 *
 * Creates checkout sessions, verifies subscriptions, and issues/validates local
 * license keys for the $15/month Pro plan.
 *
 * Requires STRIPE_SECRET_KEY, STRIPE_PRICE_ID_PRO, and APP_URL env vars.
 * When STRIPE_SECRET_KEY is absent, functions degrade gracefully and return
 * informative errors rather than crashing.
 */

import { createRequire } from 'module';
import chalk from 'chalk';
import { loadConfig, saveConfig } from '../config.js';

const _require = createRequire(import.meta.url);
const crypto = _require('crypto');

const STRIPE_API = 'https://api.stripe.com/v1';
const PRO_PRICE_USD = 15;

/**
 * Read the Stripe secret key from the environment.
 */
function getStripeKey(): string | undefined {
  return process.env.STRIPE_SECRET_KEY;
}

/**
 * Create a Stripe Checkout Session for the $15/mo Pro plan.
 *
 * @param email - the customer's email address
 * @returns the checkout session URL the user should be redirected to
 */
export async function createCheckoutSession(email: string): Promise<{
  url: string;
  sessionId: string;
}> {
  const secretKey = getStripeKey();
  const priceId = process.env.STRIPE_PRICE_ID_PRO;
  const appUrl = process.env.APP_URL || 'http://localhost:3000';

  if (!secretKey) {
    throw new Error(
      'Stripe is not configured. Set STRIPE_SECRET_KEY, STRIPE_PRICE_ID_PRO, and APP_URL in your environment.\n' +
      'See PRO.md for setup instructions.'
    );
  }

  if (!priceId) {
    throw new Error(
      'STRIPE_PRICE_ID_PRO is not set. Create a $15/mo recurring product in Stripe and set its price ID.'
    );
  }

  const params = new URLSearchParams({
    mode: 'subscription',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    success_url: `${appUrl}/pro/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/pro/cancel`,
    'customer_email': email,
    'metadata[product]': 'canvas-cli-pro',
    'metadata[price]': `${PRO_PRICE_USD}/month`,
  });

  const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Stripe checkout session creation failed: ${res.status} ${text}`);
  }

  const session = await res.json() as {
    id: string;
    url: string;
  };

  return { url: session.url, sessionId: session.id };
}

/**
 * Verify whether a user has an active Pro subscription via the Stripe API.
 *
 * @param userId - the Stripe customer ID or locally-generated user ID
 * @returns subscription details if active, otherwise null
 */
export async function verifySubscription(userId: string): Promise<{
  active: boolean;
  subscriptionId?: string;
  currentPeriodEnd?: number;
  cancelAtPeriodEnd?: boolean;
} | null> {
  const secretKey = getStripeKey();

  if (!secretKey) {
    // Offline fallback: trust the local config
    const config = loadConfig();
    if (config.pro_status === 'active') {
      return { active: true };
    }
    return null;
  }

  try {
    // List subscriptions for the customer
    const params = new URLSearchParams({
      customer: userId,
      status: 'active',
      limit: '1',
    });

    const res = await fetch(`${STRIPE_API}/subscriptions?${params.toString()}`, {
      headers: { 'Authorization': `Bearer ${secretKey}` },
    });

    if (!res.ok) {
      return null;
    }

    const data = await res.json() as {
      data: Array<{
        id: string;
        status: string;
        current_period_end: number;
        cancel_at_period_end: boolean;
      }>;
    };

    const sub = data.data?.[0];
    if (!sub || sub.status !== 'active') {
      return { active: false };
    }

    return {
      active: true,
      subscriptionId: sub.id,
      currentPeriodEnd: sub.current_period_end,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    };
  } catch {
    return null;
  }
}

/**
 * Cancel a Pro subscription via the Stripe API.
 *
 * @param subscriptionId - the Stripe subscription ID to cancel
 * @returns true if cancellation succeeded
 */
export async function cancelSubscription(subscriptionId: string): Promise<boolean> {
  const secretKey = getStripeKey();

  if (!secretKey) {
    // Offline: just clear local status
    const config = loadConfig();
    saveConfig({ ...config, pro_status: 'canceled' });
    return true;
  }

  try {
    const res = await fetch(`${STRIPE_API}/subscriptions/${subscriptionId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${secretKey}` },
    });

    if (!res.ok) {
      return false;
    }

    // Update local config
    const config = loadConfig();
    saveConfig({ ...config, pro_status: 'canceled' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate a local license key for a user after successful subscription.
 *
 * The key format is `CVPRO-<userIdHash>-<checksum>` and can be validated
 * offline by {@link validateLicenseKey}.
 *
 * @param userId - a stable user identifier (Stripe customer ID or email hash)
 * @param subscriptionId - the Stripe subscription ID
 * @returns the license key string
 */
export function generateLicenseKey(userId: string, subscriptionId: string): string {
  // Create a stable hash from the userId
  const payload = crypto
    .createHash('sha256')
    .update(userId + ':' + subscriptionId)
    .digest('hex')
    .substring(0, 16);

  const checksum = crypto
    .createHash('sha256')
    .update(payload + ':canvas-pro')
    .digest('hex')
    .substring(0, 8);

  return `CVPRO-${payload}-${checksum}`;
}

/**
 * Validate a license key.
 *
 * Performs an offline checksum check first. If STRIPE_SECRET_KEY is set and
 * `online` is true, also verifies the subscription is still active.
 *
 * @param key - the license key to validate
 * @param online - whether to also verify online with Stripe (default: false)
 * @returns validation result
 */
export async function validateLicenseKey(
  key: string,
  online: boolean = false
): Promise<{
  valid: boolean;
  reason?: string;
}> {
  if (!key || typeof key !== 'string') {
    return { valid: false, reason: 'Empty key' };
  }

  // Offline checksum validation
  const parts = key.split('-');
  if (parts.length !== 3 || parts[0] !== 'CVPRO') {
    return { valid: false, reason: 'Invalid key format' };
  }

  const [, payload, checksum] = parts;
  if (!payload || !checksum) {
    return { valid: false, reason: 'Malformed key' };
  }

  const expected = crypto
    .createHash('sha256')
    .update(payload + ':canvas-pro')
    .digest('hex')
    .substring(0, 8);

  if (checksum !== expected) {
    return { valid: false, reason: 'Checksum mismatch — key is invalid or forged' };
  }

  // Optional online verification
  if (online) {
    const config = loadConfig();
    if (config.pro_email) {
      const sub = await verifySubscription(config.pro_email);
      if (sub && !sub.active) {
        return { valid: false, reason: 'Associated subscription is no longer active' };
      }
    }
  }

  return { valid: true };
}

/**
 * Get a human-readable billing status summary for display.
 */
export function getBillingSummary(): string {
  const config = loadConfig();
  const status = config.pro_status || 'free';

  const statusLabel = status === 'active'
    ? chalk.green('Active')
    : status === 'canceled'
    ? chalk.yellow('Canceled')
    : status === 'inactive'
    ? chalk.gray('Inactive')
    : chalk.gray('Free tier');

  const lines = [
    chalk.cyan.bold('\n  💳 Canvas Pro Billing\n'),
    `  Status:    ${statusLabel}`,
    `  Plan:      Pro ($${PRO_PRICE_USD}/month)`,
  ];

  if (config.pro_email) {
    lines.push(`  Email:     ${chalk.gray(config.pro_email)}`);
  }

  if (config.pro_license_key) {
    const masked = config.pro_license_key.substring(0, 12) + '••••';
    lines.push(`  License:   ${chalk.gray(masked)}`);
  }

  lines.push('');
  return lines.join('\n');
}