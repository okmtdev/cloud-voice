import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, assertConfig } from '../src/config.ts';

const ENV_KEYS = [
  'CLOUD_VOICE_SERVER',
  'CLOUD_VOICE_ROOM',
  'CLOUD_VOICE_TOKEN',
  'CLOUD_VOICE_DEVICE',
];

let dir: string;
let cwd: string;
let argv: string[];

beforeEach(() => {
  cwd = process.cwd();
  dir = mkdtempSync(join(tmpdir(), 'cv-cfg-')); // empty dir => no .env
  process.chdir(dir);
  argv = process.argv;
  process.argv = ['node', 'agent'];
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  process.chdir(cwd);
  process.argv = argv;
  for (const k of ENV_KEYS) delete process.env[k];
});

test('command-line flags are parsed', () => {
  process.argv = ['node', 'agent', '--server=ws://localhost:8080', '--room=kitchen', '--list-devices'];
  const cfg = loadConfig();

  assert.equal(cfg.server, 'ws://localhost:8080');
  assert.equal(cfg.room, 'kitchen');
  assert.equal(cfg.listDevices, true);
});

test('environment variables are used when flags are absent', () => {
  process.env.CLOUD_VOICE_SERVER = 'wss://example.run.app';
  process.env.CLOUD_VOICE_ROOM = 'office';
  const cfg = loadConfig();

  assert.equal(cfg.server, 'wss://example.run.app');
  assert.equal(cfg.room, 'office');
  assert.equal(cfg.listDevices, false);
});

test('flags take precedence over environment variables', () => {
  process.env.CLOUD_VOICE_ROOM = 'from-env';
  process.argv = ['node', 'agent', '--room=from-flag'];
  const cfg = loadConfig();

  assert.equal(cfg.room, 'from-flag');
});

test('assertConfig throws when server/room are missing', () => {
  const cfg = loadConfig();
  assert.throws(() => assertConfig(cfg), /Missing required configuration/);
});

test('assertConfig passes when server and room are present', () => {
  process.argv = ['node', 'agent', '--server=ws://x', '--room=y'];
  const cfg = loadConfig();
  assert.doesNotThrow(() => assertConfig(cfg));
});
