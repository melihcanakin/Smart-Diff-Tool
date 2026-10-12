import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ResultCache, cacheKey } from '../src/cache.ts';
import { loadConfig } from '../src/config.ts';
import { listChanges, readBlob, resolveRef } from '../src/git.ts';
import { mapPool } from '../src/pool.ts';
import { cleanup, commitOnBranch, createRepo, tempCacheDir, write } from './helpers.ts';

const ENTRY = { total: 4, breakdown: { logic: 1, comment: 1, moved: 1, format: 1 } };

test('cache: round-trips, misses unknown keys, and keys depend on every part', async t => {
  const dir = tempCacheDir();
  t.after(() => cleanup(dir));
  const cache = new ResultCache(true, dir);
  const key = cacheKey('engine', '.js', 'old', 'new');

  assert.equal(await cache.get(key), null);
  await cache.set(key, ENTRY);
  assert.deepEqual(await cache.get(key), ENTRY);

  assert.notEqual(key, cacheKey('engine2', '.js', 'old', 'new'));
  assert.notEqual(key, cacheKey('engine', '.js', 'old', 'newer'));
  assert.notEqual(cacheKey('a', 'bc'), cacheKey('ab', 'c'), 'parts must not run together');
});

test('cache: a corrupted or wrong-shaped entry is a miss, not a crash', async t => {
  const dir = tempCacheDir();
  t.after(() => cleanup(dir));
  const cache = new ResultCache(true, dir);
  const key = cacheKey('x');
  await cache.set(key, ENTRY);
  const file = path.join(dir, key.slice(0, 2), `${key}.json`);

  fs.writeFileSync(file, '{not json');
  assert.equal(await cache.get(key), null);
  fs.writeFileSync(file, JSON.stringify({ total: 'x', breakdown: {} }));
  assert.equal(await cache.get(key), null);
});

test('cache: disabled means no reads and no writes; an unwritable dir degrades silently', async t => {
  const dir = tempCacheDir();
  t.after(() => cleanup(dir));
  const off = new ResultCache(false, dir);
  await off.set('k', ENTRY);
  assert.equal(fs.readdirSync(dir).length, 0);
  assert.equal(await off.get('k'), null);

  const blocked = path.join(dir, 'file');
  fs.writeFileSync(blocked, '');
  const broken = new ResultCache(true, path.join(blocked, 'sub'));
  await assert.doesNotReject(broken.set('k', ENTRY));
  assert.equal(await broken.get('k'), null);
});

test('config: .semanticdiffrc.json wins over package.json; both are validated', t => {
  const dir = tempCacheDir();
  t.after(() => cleanup(dir));
  assert.deepEqual(loadConfig(dir), {});

  write(dir, { 'package.json': JSON.stringify({ semanticDiff: { threshold: 15, cache: false } }) });
  assert.deepEqual(loadConfig(dir), { threshold: 15, cache: false });

  write(dir, { '.semanticdiffrc.json': JSON.stringify({ threshold: 40, ignore: ['a/**'] }) });
  assert.deepEqual(loadConfig(dir), { threshold: 40, ignore: ['a/**'] });

  const bad = (config: unknown, message: RegExp): void => {
    write(dir, { '.semanticdiffrc.json': JSON.stringify(config) });
    assert.throws(() => loadConfig(dir), message);
  };
  bad([], /JSON object/);
  bad({ threshold: 'high' }, /threshold/);
  bad({ threshold: 101 }, /threshold/);
  bad({ ignore: 'a' }, /ignore/);
  bad({ ignore: [''] }, /ignore/);
  bad({ cache: 'yes' }, /cache/);
  bad({ nope: 1 }, /Unknown option "nope"/);

  write(dir, { '.semanticdiffrc.json': '{oops' });
  assert.throws(() => loadConfig(dir), /Cannot read \.semanticdiffrc\.json/);
});

test('pool: preserves order and never exceeds the concurrency limit', async () => {
  let running = 0;
  let peak = 0;
  const out = await mapPool([30, 5, 20, 1, 10, 2], 3, async (ms, i) => {
    peak = Math.max(peak, ++running);
    await new Promise(r => setTimeout(r, ms));
    running--;
    return i;
  });
  assert.deepEqual(out, [0, 1, 2, 3, 4, 5]);
  assert.ok(peak <= 3, `peak concurrency was ${peak}`);
  assert.deepEqual(await mapPool([], 4, () => Promise.resolve(1)), []);
});

test('pool: a failing task rejects the whole run', async () => {
  await assert.rejects(
    mapPool([1, 2, 3], 2, n => (n === 2 ? Promise.reject(new Error('boom')) : Promise.resolve(n))),
    /boom/
  );
});

test('git: resolveRef resolves refs and refuses flag-like names', t => {
  const dir = createRepo({ 'a.js': 'a();\n' });
  t.after(() => cleanup(dir));
  assert.match(resolveRef(dir, 'main') ?? '', /^[0-9a-f]{40,64}$/);
  assert.equal(resolveRef(dir, 'nope'), null);
  assert.equal(resolveRef(dir, '--all'), null);
  assert.equal(resolveRef(dir, 'main; echo hi'), null);
});

test('git: listChanges reports statuses, blobs and renames; readBlob reads them', async t => {
  const body = Array.from({ length: 12 }, (_, i) => `const v${i} = ${i};`).join('\n') + '\n';
  const dir = createRepo({ 'keep.js': 'a();\n', 'gone.js': 'b();\n', 'old.js': body });
  commitOnBranch(dir, 'feat', {
    'keep.js': 'c();\n',
    'gone.js': null,
    'old.js': null,
    'new.js': body,
    'fresh.js': 'd();\n',
  });
  t.after(() => cleanup(dir));

  const changes = listChanges(dir, resolveRef(dir, 'main')!, resolveRef(dir, 'feat')!);
  const by = Object.fromEntries(changes.map(c => [c.path, c]));

  assert.equal(by['fresh.js']?.status, 'added');
  assert.equal(by['fresh.js']?.oldBlob, null);
  assert.equal(by['gone.js']?.status, 'deleted');
  assert.equal(by['gone.js']?.newBlob, null);
  assert.equal(by['keep.js']?.status, 'modified');
  assert.equal(by['new.js']?.status, 'renamed');
  assert.equal(by['new.js']?.oldPath, 'old.js');

  assert.equal(await readBlob(dir, by['keep.js'].newBlob), 'c();\n');
  assert.equal(await readBlob(dir, null), '');
});

test('git: unusual file names survive the round trip', t => {
  const dir = createRepo({ 'a.js': 'a();\n' });
  commitOnBranch(dir, 'feat', { 'dir with space/ünï cödé.js': 'b();\n' });
  t.after(() => cleanup(dir));
  const changes = listChanges(dir, resolveRef(dir, 'main')!, resolveRef(dir, 'feat')!);
  assert.deepEqual(
    changes.map(c => c.path),
    ['dir with space/ünï cödé.js']
  );
});
