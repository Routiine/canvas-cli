import { describe, it, expect } from '@jest/globals';

// Test env filtering logic
const FILTERED_ENV_VARS = [
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AWS_ACCESS_KEY_ID',
  'GITHUB_TOKEN',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GROQ_API_KEY',
  'GOOGLE_API_KEY',
  'NPM_TOKEN',
  'DATABASE_URL',
  'DB_PASSWORD',
  'API_KEY',
  'SECRET_KEY',
  'PRIVATE_KEY',
  'CANVAS_ENCRYPTION_KEY',
  'JWT_SECRET',
  'HUGGINGFACE_TOKEN',
  'STRIPE_SECRET_KEY',
  'STRIPE_API_KEY',
];

function getFilteredEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const filtered = { ...env };
  for (const varName of FILTERED_ENV_VARS) {
    if (filtered[varName]) {
      filtered[varName] = '[FILTERED]';
    }
  }
  for (const key of Object.keys(filtered)) {
    if (/secret|password|token|key|credential/i.test(key)) {
      filtered[key] = '[FILTERED]';
    }
  }
  return filtered;
}

describe('Shell environment variable filtering', () => {
  it('should filter AWS secret access key', () => {
    const env = { AWS_SECRET_ACCESS_KEY: 'real-secret' };
    const filtered = getFilteredEnv(env);
    expect(filtered.AWS_SECRET_ACCESS_KEY).toBe('[FILTERED]');
  });

  it('should filter ANTHROPIC_API_KEY', () => {
    const env = { ANTHROPIC_API_KEY: 'sk-ant-real-key' };
    const filtered = getFilteredEnv(env);
    expect(filtered.ANTHROPIC_API_KEY).toBe('[FILTERED]');
  });

  it('should filter OPENAI_API_KEY', () => {
    const env = { OPENAI_API_KEY: 'sk-real-key' };
    const filtered = getFilteredEnv(env);
    expect(filtered.OPENAI_API_KEY).toBe('[FILTERED]');
  });

  it('should filter JWT_SECRET', () => {
    const env = { JWT_SECRET: 'my-jwt-secret' };
    const filtered = getFilteredEnv(env);
    expect(filtered.JWT_SECRET).toBe('[FILTERED]');
  });

  it('should filter variables matching secret|password|token|key|credential pattern', () => {
    const env = { MY_CUSTOM_PASSWORD: 'secret123', SOME_BEARER_TOKEN: 'abc' };
    const filtered = getFilteredEnv(env);
    expect(filtered.MY_CUSTOM_PASSWORD).toBe('[FILTERED]');
    expect(filtered.SOME_BEARER_TOKEN).toBe('[FILTERED]');
  });

  it('should NOT filter safe env vars', () => {
    const env = { PATH: '/usr/bin', HOME: '/root', NODE_ENV: 'test', USER: 'norm' };
    const filtered = getFilteredEnv(env);
    expect(filtered.PATH).toBe('/usr/bin');
    expect(filtered.HOME).toBe('/root');
    expect(filtered.NODE_ENV).toBe('test');
  });

  it('should filter STRIPE_SECRET_KEY', () => {
    const env = { STRIPE_SECRET_KEY: 'sk_live_xxx' };
    const filtered = getFilteredEnv(env);
    expect(filtered.STRIPE_SECRET_KEY).toBe('[FILTERED]');
  });

  it('should filter CANVAS_ENCRYPTION_KEY', () => {
    const env = { CANVAS_ENCRYPTION_KEY: 'my-encryption-key' };
    const filtered = getFilteredEnv(env);
    expect(filtered.CANVAS_ENCRYPTION_KEY).toBe('[FILTERED]');
  });
});
