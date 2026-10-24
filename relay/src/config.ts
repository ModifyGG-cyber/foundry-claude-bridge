function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export interface Config {
  publicUrl: URL;
  port: number;
  foundrySecret: string;
  password: string;
  apiKey?: string;
  dataDir: string;
  callTimeoutMs: number;
}

export function loadConfig(): Config {
  const foundrySecret = required('FOUNDRY_SECRET');
  if (foundrySecret.length < 24) throw new Error('FOUNDRY_SECRET must be at least 24 characters');
  const password = required('RELAY_PASSWORD');
  if (password.length < 12) throw new Error('RELAY_PASSWORD must be at least 12 characters');
  const apiKey = process.env.API_KEY || undefined;
  if (apiKey && apiKey.length < 32) throw new Error('API_KEY must be at least 32 characters');
  return {
    publicUrl: new URL(required('PUBLIC_URL')),
    port: Number(process.env.PORT ?? 8787),
    foundrySecret,
    password,
    apiKey,
    dataDir: process.env.DATA_DIR ?? './data',
    callTimeoutMs: Number(process.env.CALL_TIMEOUT_MS ?? 30000),
  };
}
