import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
export const CLI = path.join(ROOT, 'src', 'cli.ts');
export const MCP = path.join(ROOT, 'src', 'mcp.ts');

export function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

type Files = Record<string, string | Buffer | null>;

export function write(dir: string, files: Files): void {
  for (const [name, content] of Object.entries(files)) {
    const full = path.join(dir, name);
    if (content === null) {
      fs.rmSync(full, { force: true });
      continue;
    }
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
}

/** Creates a temp git repo whose `main` branch holds `files`. Remove it with `cleanup`. */
export function createRepo(files: Files = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdt-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  git(dir, 'config', 'commit.gpgsign', 'false');
  git(dir, 'config', 'core.autocrlf', 'false');
  write(dir, files);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '--allow-empty', '-m', 'base');
  return dir;
}

/** Branches off the current HEAD, applies `files` (null deletes) and commits. */
export function commitOnBranch(dir: string, name: string, files: Files): void {
  git(dir, 'checkout', '-q', '-b', name);
  write(dir, files);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', name);
}

export function cleanup(...dirs: string[]): void {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
}

/** A fresh cache directory so tests never read or pollute the real one. */
export function tempCacheDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sdt-cache-'));
}

export interface CliResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export function runCli(cwd: string, args: string[], env: Record<string, string> = {}): CliResult {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1', SEMANTIC_DIFF_CACHE_DIR: tempCacheDir(), ...env },
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** Talks to the MCP server: sends each message as a line and resolves with all responses. */
export function runMcp(
  cwd: string,
  messages: (object | string)[]
): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [MCP], {
      cwd,
      env: { ...process.env, SEMANTIC_DIFF_CACHE_DIR: tempCacheDir() },
    });
    let out = '';
    child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()));
    child.on('error', reject);
    child.on('close', () => {
      resolve(
        out
          .split('\n')
          .filter(Boolean)
          .map(line => JSON.parse(line) as Record<string, unknown>)
      );
    });
    for (const m of messages)
      child.stdin.write(`${typeof m === 'string' ? m : JSON.stringify(m)}\n`);
    child.stdin.end();
  });
}
