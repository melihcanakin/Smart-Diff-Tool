import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import type { ChangeStatus } from './types.ts';

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 256 * 1024 * 1024;
const ZERO_SHA = /^0+$/;
const SUBMODULE_MODE = '160000';

export interface Change {
  status: ChangeStatus;
  path: string;
  oldPath: string;
  /** Blob hash of the old version, or null when the file did not exist. */
  oldBlob: string | null;
  newBlob: string | null;
}

/**
 * Every git call goes through execFile with an argument array: no shell is involved, so branch
 * and file names can never be interpreted as commands. Returns null when git exits non-zero.
 */
function run(cwd: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: MAX_BUFFER,
    });
  } catch {
    return null;
  }
}

export function isRepo(cwd: string): boolean {
  return run(cwd, ['rev-parse', '--is-inside-work-tree'])?.trim() === 'true';
}

/**
 * Resolves a user-supplied ref to a full commit SHA, or null if it does not exist.
 * `--end-of-options` stops a ref such as "--output=x" from being read as a flag, and every later
 * call uses the SHA instead of the raw user input.
 */
export function resolveRef(cwd: string, name: string): string | null {
  const out = run(cwd, [
    'rev-parse',
    '--verify',
    '--quiet',
    '--end-of-options',
    `${name}^{commit}`,
  ]);
  return out === null ? null : out.trim();
}

const RAW_HEADER = /^:(\d+) (\d+) ([0-9a-f]+) ([0-9a-f]+) ([A-Z])\d*$/;

/**
 * Files changed on `feature` since it diverged from `base` (merge-base diff), with blob hashes
 * and rename detection. Submodule pointers are skipped.
 */
export function listChanges(cwd: string, base: string, feature: string): Change[] {
  const out = run(cwd, [
    '-c',
    'core.quotepath=off',
    'diff',
    '--raw',
    '-z',
    '--no-abbrev',
    '-M',
    '--no-color',
    '--no-ext-diff',
    `${base}...${feature}`,
    '--',
  ]);
  if (out === null) throw new Error(`git diff failed for ${base}...${feature}`);

  const parts = out.split('\0');
  const changes: Change[] = [];

  for (let i = 0; i < parts.length; ) {
    const header = RAW_HEADER.exec(parts[i++] ?? '');
    if (!header) continue;

    const [, oldMode, newMode, oldSha, newSha, letter] = header as unknown as [
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    const first = parts[i++] ?? '';
    const second = letter === 'R' || letter === 'C' ? (parts[i++] ?? '') : first;

    if (oldMode === SUBMODULE_MODE || newMode === SUBMODULE_MODE) continue;

    const status: ChangeStatus =
      letter === 'A' || letter === 'C'
        ? 'added'
        : letter === 'D'
          ? 'deleted'
          : letter === 'R'
            ? 'renamed'
            : 'modified';

    changes.push({
      status,
      path: second,
      oldPath: letter === 'C' ? second : first,
      oldBlob: ZERO_SHA.test(oldSha) || letter === 'C' ? null : oldSha,
      newBlob: ZERO_SHA.test(newSha) ? null : newSha,
    });
  }

  return changes;
}

/** Content of a blob, or '' for a missing side of an added/deleted file. */
export async function readBlob(cwd: string, blob: string | null): Promise<string> {
  if (blob === null) return '';
  const { stdout } = await execFileAsync('git', ['cat-file', 'blob', blob], {
    cwd,
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER,
  });
  return stdout;
}
