import { randomBytes } from 'node:crypto';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

// The module only accepts keys in this shape (module/src/settings/apiKeyFormat.ts).
const KEY_PATTERN = /^pk_[A-Za-z0-9_\-+/=]{17,61}$/;

export const newKey = () => `pk_${randomBytes(30).toString('base64url')}`;

export interface BaseConfig {
  foundryKey: string;
  host: string;
  port: number;
  callTimeoutMs: number;
}

export interface HttpConfig extends BaseConfig {
  publicUrl: URL;
  password: string;
  apiKey?: string;
  dataDir: string;
}

export function loadBaseConfig(defaultHost: string): BaseConfig {
  const foundryKey = required('FOUNDRY_KEY');
  if (!KEY_PATTERN.test(foundryKey)) throw new Error('FOUNDRY_KEY must look like pk_ followed by 17-61 letters/digits. Generate one with --new-key.');
  return {
    foundryKey,
    host: process.env.HOST ?? defaultHost,
    port: Number(process.env.PORT ?? 8787),
    callTimeoutMs: Number(process.env.CALL_TIMEOUT_MS ?? 30000),
  };
}

export function loadHttpConfig(): HttpConfig {
  const password = required('RELAY_PASSWORD');
  if (password.length < 12) throw new Error('RELAY_PASSWORD must be at least 12 characters');
  const apiKey = process.env.API_KEY || undefined;
  if (apiKey && apiKey.length < 32) throw new Error('API_KEY must be at least 32 characters');
  return {
    ...loadBaseConfig('0.0.0.0'),
    publicUrl: new URL(required('PUBLIC_URL')),
    password,
    apiKey,
    dataDir: process.env.DATA_DIR ?? './data',
  };
}
