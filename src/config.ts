import fs from 'node:fs';
import path from 'node:path';
import { UsageError } from './errors.ts';

export interface Config {
  threshold?: number;
  ignore?: string[];
  cache?: boolean;
}

const KNOWN_KEYS = new Set(['threshold', 'ignore', 'cache']);

export function validateThreshold(value: unknown, source: string): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 100) {
    throw new UsageError(`Invalid threshold in ${source}: expected a number from 0 to 100`);
  }
  return n;
}

function validate(raw: unknown, source: string): Config {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new UsageError(`${source} must contain a JSON object`);
  }
  const obj = raw as Record<string, unknown>;

  for (const key of Object.keys(obj)) {
    if (!KNOWN_KEYS.has(key)) throw new UsageError(`Unknown option "${key}" in ${source}`);
  }

  const config: Config = {};
  if (obj['threshold'] !== undefined)
    config.threshold = validateThreshold(obj['threshold'], source);
  if (obj['cache'] !== undefined) {
    if (typeof obj['cache'] !== 'boolean')
      throw new UsageError(`"cache" in ${source} must be a boolean`);
    config.cache = obj['cache'];
  }
  if (obj['ignore'] !== undefined) {
    const ignore = obj['ignore'];
    if (!Array.isArray(ignore) || !ignore.every(p => typeof p === 'string' && p.trim() !== '')) {
      throw new UsageError(`"ignore" in ${source} must be an array of non-empty glob strings`);
    }
    config.ignore = ignore as string[];
  }
  return config;
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new UsageError(`Cannot read ${path.basename(file)}: ${(err as Error).message}`);
  }
}

/** `.semanticdiffrc.json`, or the `"semanticDiff"` field of package.json. */
export function loadConfig(cwd: string): Config {
  const rc = path.join(cwd, '.semanticdiffrc.json');
  const fromRc = readJson(rc);
  if (fromRc !== undefined) return validate(fromRc, '.semanticdiffrc.json');

  const pkg = readJson(path.join(cwd, 'package.json')) as Record<string, unknown> | undefined;
  if (pkg && pkg['semanticDiff'] !== undefined)
    return validate(pkg['semanticDiff'], 'package.json "semanticDiff"');

  return {};
}
