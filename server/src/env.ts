import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Minimal dependency-free `.env` loader (KEY=VALUE per line).
 * Real environment variables always win over the file, so this is safe to call
 * in production where Cloud Run injects PORT and friends directly.
 */
export function loadDotEnv(): void {
  try {
    const text = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // No .env file is fine; rely on real environment variables.
  }
}
