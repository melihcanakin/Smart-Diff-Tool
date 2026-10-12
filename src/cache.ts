import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Breakdown } from './types.ts';

/** Bump when the shape or meaning of a cached value changes. */
const SCHEMA = 2;

export interface CachedAnalysis {
  total: number;
  breakdown: Breakdown;
}

export function cacheDirectory(): string {
  const override = process.env['SEMANTIC_DIFF_CACHE_DIR'];
  if (override) return override;
  const base = process.env['XDG_CACHE_HOME'] ?? path.join(os.homedir(), '.cache');
  return path.join(base, 'semantic-diff');
}

/** The key is derived from content hashes, so an entry can never be stale: no TTL needed. */
export function cacheKey(...parts: string[]): string {
  return createHash('sha256')
    .update([String(SCHEMA), ...parts].join('\0'))
    .digest('hex');
}

function isCachedAnalysis(value: unknown): value is CachedAnalysis {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const b = v['breakdown'] as Record<string, unknown> | undefined;
  return (
    typeof v['total'] === 'number' &&
    typeof b === 'object' &&
    ['logic', 'comment', 'moved', 'format'].every(k => typeof b[k] === 'number')
  );
}

/** Content-addressed result cache. Every failure degrades to "no cache", never to an error. */
export class ResultCache {
  readonly #dir: string;
  readonly #enabled: boolean;

  constructor(enabled: boolean, dir: string = cacheDirectory()) {
    this.#enabled = enabled;
    this.#dir = dir;
  }

  #file(key: string): string {
    return path.join(this.#dir, key.slice(0, 2), `${key}.json`);
  }

  async get(key: string): Promise<CachedAnalysis | null> {
    if (!this.#enabled) return null;
    try {
      const value: unknown = JSON.parse(await fs.readFile(this.#file(key), 'utf8'));
      return isCachedAnalysis(value) ? value : null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: CachedAnalysis): Promise<void> {
    if (!this.#enabled) return;
    const file = this.#file(key);
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await fs.mkdir(path.dirname(file), { recursive: true });
      // Write then rename, so a concurrent reader never sees a half-written file.
      await fs.writeFile(temporary, JSON.stringify(value));
      await fs.rename(temporary, file);
    } catch {
      await fs.rm(temporary, { force: true }).catch(() => undefined);
    }
  }
}
