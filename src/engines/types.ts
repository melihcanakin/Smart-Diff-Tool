import type { EngineName } from '../types.ts';

export interface PreparedEngine {
  /** Identifies everything that changes the output, so cached results are never stale. */
  fingerprint: string;
  /** Turns source into a format-insensitive, line-oriented text. Throws if it cannot be parsed. */
  normalize: (code: string) => string | Promise<string>;
}

export interface Engine {
  readonly name: EngineName;
  prepare: (file: string, cwd: string, grammar?: string) => Promise<PreparedEngine>;
}
