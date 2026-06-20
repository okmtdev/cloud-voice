import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDotEnv } from '../src/env.ts';

let dir: string;
let cwd: string;

beforeEach(() => {
  cwd = process.cwd();
  dir = mkdtempSync(join(tmpdir(), 'cv-env-'));
  process.chdir(dir);
});

afterEach(() => {
  process.chdir(cwd);
  rmSync(dir, { recursive: true, force: true });
});

test('loadDotEnv parses KEY=VALUE and trims quotes', () => {
  writeFileSync(
    '.env',
    ['# a comment', '', 'CV_PLAIN=hello', 'CV_QUOTED="spaced value"', "CV_SINGLE='x'"].join('\n')
  );
  delete process.env.CV_PLAIN;
  delete process.env.CV_QUOTED;
  delete process.env.CV_SINGLE;

  loadDotEnv();

  assert.equal(process.env.CV_PLAIN, 'hello');
  assert.equal(process.env.CV_QUOTED, 'spaced value');
  assert.equal(process.env.CV_SINGLE, 'x');
});

test('real environment variables win over the .env file', () => {
  writeFileSync('.env', 'CV_WIN=from-file');
  process.env.CV_WIN = 'from-env';

  loadDotEnv();

  assert.equal(process.env.CV_WIN, 'from-env');
  delete process.env.CV_WIN;
});

test('a missing .env file is not an error', () => {
  assert.doesNotThrow(() => loadDotEnv());
});
