import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface Config {
  server: string;
  room: string;
  token: string;
  device: string | null;
  listDevices: boolean;
}

/** Minimal dependency-free `.env` loader (KEY=VALUE per line). */
function loadDotEnv(): void {
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

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit?.slice(prefix.length);
}

export function loadConfig(): Config {
  loadDotEnv();

  const server = arg('server') ?? process.env.CLOUD_VOICE_SERVER ?? '';
  const room = arg('room') ?? process.env.CLOUD_VOICE_ROOM ?? '';
  const token = arg('token') ?? process.env.CLOUD_VOICE_TOKEN ?? '';
  const device = arg('device') ?? process.env.CLOUD_VOICE_DEVICE ?? null;
  const listDevices = process.argv.includes('--list-devices');

  return { server, room, token, device, listDevices };
}

export function assertConfig(cfg: Config): void {
  const missing: string[] = [];
  if (!cfg.server) missing.push('CLOUD_VOICE_SERVER (--server)');
  if (!cfg.room) missing.push('CLOUD_VOICE_ROOM (--room)');
  if (missing.length > 0) {
    throw new Error(
      `Missing required configuration: ${missing.join(', ')}\n` +
        'Set them in a .env file or pass --server=... --room=... on the command line.'
    );
  }
}
