import os from 'node:os';
import path from 'node:path';
import { ResultCache, cacheKey } from './cache.ts';
import { buildBreakdown, classifyNormalizedDiff, countChangedLines, ratioOf } from './classify.ts';
import { prettierEngine } from './engines/prettier.ts';
import { treeSitterEngine } from './engines/tree-sitter.ts';
import type { Engine } from './engines/types.ts';
import { GitError } from './errors.ts';
import * as git from './git.ts';
import { globToRegExp } from './ignore.ts';
import { classifyFile } from './languages.ts';
import { mapPool } from './pool.ts';
import type { AnalyzeOptions, FileFailure, FileResult, Report } from './types.ts';

const ENGINES: Record<'prettier' | 'tree-sitter', Engine> = {
  prettier: prettierEngine,
  'tree-sitter': treeSitterEngine,
};

type Outcome =
  | { type: 'result'; result: FileResult; cacheHit: boolean }
  | { type: 'failed'; failure: FileFailure }
  | { type: 'skipped'; file: string };

interface Context {
  cwd: string;
  cache: ResultCache;
}

async function analyzeChange(change: git.Change, ctx: Context): Promise<Outcome> {
  const file = change.path;
  const kind = classifyFile(file);
  if (kind.kind !== 'analyzable') return { type: 'skipped', file };

  try {
    const engine = ENGINES[kind.engine];
    const prepared = await engine.prepare(file, ctx.cwd, kind.grammar);

    const key = cacheKey(
      prepared.fingerprint,
      path.extname(file),
      change.oldBlob ?? '-',
      change.newBlob ?? '-'
    );
    const cached = await ctx.cache.get(key);

    const make = (
      total: number,
      breakdown: FileResult['breakdown'],
      cacheHit: boolean
    ): Outcome => {
      const semantic = breakdown.logic + breakdown.comment;
      return {
        type: 'result',
        cacheHit,
        result: {
          file,
          oldFile: change.oldPath,
          status: change.status,
          engine: kind.engine,
          total,
          semantic,
          noise: breakdown.moved + breakdown.format,
          ratio: ratioOf(semantic, total),
          breakdown,
        },
      };
    };

    if (cached) return make(cached.total, cached.breakdown, true);

    const [baseRaw, featureRaw] = await Promise.all([
      git.readBlob(ctx.cwd, change.oldBlob),
      git.readBlob(ctx.cwd, change.newBlob),
    ]);

    if (baseRaw.includes('\0') || featureRaw.includes('\0')) {
      return { type: 'failed', failure: { file, error: 'binary content' } };
    }

    const total = countChangedLines(baseRaw, featureRaw);
    const [baseNorm, featureNorm] = await Promise.all([
      prepared.normalize(baseRaw),
      prepared.normalize(featureRaw),
    ]);
    const breakdown = buildBreakdown(total, classifyNormalizedDiff(baseNorm, featureNorm, file));

    await ctx.cache.set(key, { total, breakdown });
    return make(total, breakdown, false);
  } catch (err) {
    const message =
      (err instanceof Error ? err.message : String(err)).split('\n')[0] ?? 'unknown error';
    return { type: 'failed', failure: { file, error: `unparseable: ${message}` } };
  }
}

/** Compares two refs and classifies every changed line. */
export async function analyze(options: AnalyzeOptions): Promise<Report> {
  const cwd = path.resolve(options.cwd ?? process.cwd());

  if (!git.isRepo(cwd)) throw new GitError('Not a git repository');
  const base = git.resolveRef(cwd, options.base);
  if (!base) throw new GitError(`Ref not found: ${options.base}`);
  const feature = git.resolveRef(cwd, options.feature);
  if (!feature) throw new GitError(`Ref not found: ${options.feature}`);

  const extraIgnore = (options.ignore ?? []).map(globToRegExp);
  const changes = git
    .listChanges(cwd, base, feature)
    .filter(c => !extraIgnore.some(re => re.test(c.path)));

  const ctx: Context = { cwd, cache: new ResultCache(options.cache ?? true) };
  const concurrency = options.concurrency ?? Math.min(8, os.availableParallelism());

  let done = 0;
  const outcomes = await mapPool(changes, concurrency, async change => {
    const outcome = await analyzeChange(change, ctx);
    options.onProgress?.(++done, changes.length, change.path);
    return outcome;
  });

  const files: FileResult[] = [];
  const failed: FileFailure[] = [];
  const skipped: string[] = [];
  let cacheHits = 0;

  for (const outcome of outcomes) {
    if (outcome.type === 'result') {
      files.push(outcome.result);
      if (outcome.cacheHit) cacheHits++;
    } else if (outcome.type === 'failed') {
      failed.push(outcome.failure);
    } else if (classifyFile(outcome.file).kind === 'unsupported') {
      skipped.push(outcome.file);
    }
  }

  const breakdown = { logic: 0, comment: 0, moved: 0, format: 0 };
  let total = 0;
  for (const f of files) {
    total += f.total;
    breakdown.logic += f.breakdown.logic;
    breakdown.comment += f.breakdown.comment;
    breakdown.moved += f.breakdown.moved;
    breakdown.format += f.breakdown.format;
  }
  const semantic = breakdown.logic + breakdown.comment;

  return {
    target: `${options.base}...${options.feature}`,
    base,
    feature,
    total,
    semantic,
    noise: breakdown.moved + breakdown.format,
    ratio: ratioOf(semantic, total),
    breakdown,
    files,
    skipped,
    failed,
    stats: { analyzed: files.length, cacheHits },
  };
}
