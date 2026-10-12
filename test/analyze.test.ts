import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { analyze } from '../src/analyze.ts';
import { cleanup, commitOnBranch, createRepo, git, tempCacheDir, write } from './helpers.ts';

const JS_BASE = 'function a(){return 1}\nconst x = 1\n';

/** Repo with `main` = base files and `feat` = feature files; the cache is isolated per test. */
function setup(
  t: TestContext,
  base: Record<string, string | Buffer | null>,
  feature: Record<string, string | Buffer | null>
): string {
  const cache = tempCacheDir();
  process.env['SEMANTIC_DIFF_CACHE_DIR'] = cache;
  const dir = createRepo(base);
  commitOnBranch(dir, 'feat', feature);
  t.after(() => cleanup(dir, cache));
  return dir;
}

const run = (dir: string, extra: Partial<Parameters<typeof analyze>[0]> = {}) =>
  analyze({ cwd: dir, base: 'main', feature: 'feat', ...extra });

test('formatting-only change is all noise', async t => {
  const dir = setup(
    t,
    { 'a.js': JS_BASE },
    { 'a.js': 'function a() {\n  return 1;\n}\nconst x = 1;\n' }
  );
  const r = await run(dir);
  assert.equal(r.semantic, 0);
  assert.equal(r.breakdown.format, r.total);
  assert.ok(r.total > 0);
});

test('a logic change is signal', async t => {
  const dir = setup(
    t,
    { 'a.js': JS_BASE },
    { 'a.js': 'function a() {\n  return 2;\n}\nconst x = 1;\n' }
  );
  const r = await run(dir);
  assert.equal(r.breakdown.logic, 2);
  assert.ok(r.ratio > 0);
});

test('reordered imports are moved, a changed comment is a comment', async t => {
  const dir = setup(
    t,
    { 'a.js': "import b from 'b';\nimport a from 'a';\n// old\nuse(a, b);\n" },
    { 'a.js': "import a from 'a';\nimport b from 'b';\n// new\nuse(a, b);\n" }
  );
  const r = await run(dir);
  assert.deepEqual(r.breakdown, { logic: 0, comment: 2, moved: 2, format: 0 });
});

test('the breakdown always adds up to the raw total', async t => {
  const dir = setup(
    t,
    { 'a.js': JS_BASE, 'b.py': 'def f(x):\n    return x\n', 'c.go': 'package a\nfunc F() {}\n' },
    {
      'a.js': 'import z from "z";\nfunction a() {\n  return 5;\n}\nconst x = 1;\n',
      'b.py': 'def f(x):\n  if x:\n    return x\n',
      'c.go': 'package a\n\nfunc F() {\n}\n',
    }
  );
  const r = await run(dir);
  for (const f of r.files) {
    const b = f.breakdown;
    assert.equal(b.logic + b.comment + b.moved + b.format, f.total, f.file);
    assert.ok(f.ratio >= 0 && f.ratio <= 100);
  }
  assert.equal(
    r.breakdown.logic + r.breakdown.comment + r.breakdown.moved + r.breakdown.format,
    r.total
  );
});

test('added and deleted files are counted', async t => {
  const dir = setup(
    t,
    { 'old.js': 'const a = 1;\nconst b = 2;\n' },
    { 'old.js': null, 'new.js': 'const c = 3;\nconst d = 4;\nconst e = 5;\n' }
  );
  const r = await run(dir);
  assert.deepEqual(
    r.files.map(f => [f.file, f.status, f.total]),
    [
      ['new.js', 'added', 3],
      ['old.js', 'deleted', 2],
    ]
  );
});

test('a rename keeps its history and only the edit counts', async t => {
  const body = Array.from({ length: 20 }, (_, i) => `const v${i} = ${i};`).join('\n') + '\n';
  const dir = setup(
    t,
    { 'old-name.js': body },
    { 'old-name.js': null, 'new-name.js': body.replace('v3 = 3', 'v3 = 33') }
  );
  const r = await run(dir);
  assert.equal(r.files.length, 1);
  const [file] = r.files;
  assert.equal(file?.status, 'renamed');
  assert.equal(file?.oldFile, 'old-name.js');
  assert.equal(file?.file, 'new-name.js');
  assert.equal(file?.total, 2);
});

test('a pure rename has nothing to review', async t => {
  const body = 'const a = 1;\nconst b = 2;\nconst c = 3;\n';
  const dir = setup(t, { 'a.js': body }, { 'a.js': null, 'b.js': body });
  const r = await run(dir);
  assert.equal(r.files[0]?.status, 'renamed');
  assert.equal(r.total, 0);
  assert.equal(r.ratio, 0);
});

test('CRLF conversion is formatting, not logic', async t => {
  const lf = 'const a = 1;\nconst b = 2;\nconst c = 3;\n';
  const dir = setup(t, { 'a.js': lf }, { 'a.js': lf.replace(/\n/g, '\r\n') });
  const r = await run(dir);
  assert.equal(r.semantic, 0);
  assert.equal(r.total, 6);
});

test('Python: an indentation change is logic, a re-indentation is not', async t => {
  const dir = setup(
    t,
    {
      'a.py': 'def f(x):\n    if x:\n        return 1\n    return 2\n',
      'b.py': 'def g(x):\n    if x:\n        return 1\n',
    },
    {
      'a.py': 'def f(x):\n    if x:\n        return 1\n        return 2\n',
      'b.py': 'def g(x):\n  if x:\n    return 1\n',
    }
  );
  const r = await run(dir);
  const a = r.files.find(f => f.file === 'a.py');
  const b = r.files.find(f => f.file === 'b.py');
  assert.equal(a?.breakdown.logic, 2, 'moving `return 2` into the if-block changes behaviour');
  assert.equal(b?.semantic, 0, 'indenting with 2 spaces instead of 4 does not');
});

test('unsupported languages are skipped, never counted', async t => {
  const dir = setup(
    t,
    { 'a.js': 'a();\n', 'Main.kt': 'fun main() {}\n' },
    { 'a.js': 'b();\n', 'Main.kt': 'fun main() { x() }\n' }
  );
  const r = await run(dir);
  assert.deepEqual(r.skipped, ['Main.kt']);
  assert.deepEqual(
    r.files.map(f => f.file),
    ['a.js']
  );
});

test('files that cannot be parsed are reported, never counted', async t => {
  const dir = setup(
    t,
    { 'a.js': 'const a = 1;\n', 'b.py': 'x = 1\n' },
    { 'a.js': 'const a = ;;; {{{\n', 'b.py': 'def (:\n' }
  );
  const r = await run(dir);
  assert.deepEqual(r.failed.map(f => f.file).sort(), ['a.js', 'b.py']);
  assert.equal(r.total, 0);
  for (const failure of r.failed) assert.match(failure.error, /^unparseable:/);
});

test('binary content is reported as failed', async t => {
  const dir = setup(t, { 'a.js': 'a();\n' }, { 'a.js': Buffer.from([0x61, 0x00, 0x62, 0x0a]) });
  const r = await run(dir);
  assert.deepEqual(r.failed, [{ file: 'a.js', error: 'binary content' }]);
});

test('ignore globs and built-in ignores remove files from the analysis', async t => {
  const dir = setup(
    t,
    { 'keep.js': 'a();\n' },
    {
      'keep.js': 'b();\n',
      'gen/x.generated.ts': 'const a = 1;\n',
      'dist/o.js': 'a();\n',
      'package-lock.json': '{}\n',
    }
  );
  const r = await run(dir, { ignore: ['*.generated.ts'] });
  assert.deepEqual(
    r.files.map(f => f.file),
    ['keep.js']
  );
});

test('results are cached by blob hash and never stale', async t => {
  const dir = setup(t, { 'a.js': 'const a = 1;\n' }, { 'a.js': 'const a = 2;\n' });
  const first = await run(dir);
  const second = await run(dir);
  assert.equal(first.stats.cacheHits, 0);
  assert.equal(second.stats.cacheHits, 1);
  assert.deepEqual(second.files, first.files);

  // A new commit changes the blob, so the old entry cannot be reused.
  write(dir, { 'a.js': 'const a = 2;\nconst b = 3;\nconst c = 4;\n' });
  git(dir, 'commit', '-qam', 'more');
  const third = await run(dir);
  assert.equal(third.stats.cacheHits, 0);
  assert.notEqual(third.total, first.total);
});

test('caching can be turned off', async t => {
  const dir = setup(t, { 'a.js': 'const a = 1;\n' }, { 'a.js': 'const a = 2;\n' });
  await run(dir);
  assert.equal((await run(dir, { cache: false })).stats.cacheHits, 0);
});

test('output is deterministic regardless of concurrency', async t => {
  const files = Object.fromEntries(
    Array.from({ length: 12 }, (_, i) => [`f${i}.js`, `const a${i} = ${i};\n`])
  );
  const changed = Object.fromEntries(
    Array.from({ length: 12 }, (_, i) => [`f${i}.js`, `const a${i} = ${i + 1};\n`])
  );
  const dir = setup(t, files, changed);
  const serial = await run(dir, { concurrency: 1, cache: false });
  const parallel = await run(dir, { concurrency: 8, cache: false });
  assert.deepEqual(parallel, serial);
});

test('the Prettier config of the project is respected', async t => {
  const quoted = 'const o = { "a": 1 };\n';
  const bare = 'const o = { a: 1 };\n';

  // Default options drop unnecessary quotes, so the two spellings are the same program.
  const plain = setup(t, { 'a.js': quoted }, { 'a.js': bare });
  assert.equal((await run(plain, { cache: false })).semantic, 0);

  // `quoteProps: preserve` keeps them, so the same edit now survives normalisation.
  const config = JSON.stringify({ quoteProps: 'preserve' });
  const preserved = setup(
    t,
    { '.prettierrc': config, 'a.js': quoted },
    { '.prettierrc': config, 'a.js': bare }
  );
  assert.ok((await run(preserved, { cache: false })).semantic > 0);
});

test('progress is reported for every file', async t => {
  const dir = setup(
    t,
    { 'a.js': 'a();\n', 'b.js': 'b();\n' },
    { 'a.js': 'c();\n', 'b.js': 'd();\n' }
  );
  const seen: number[] = [];
  await run(dir, { onProgress: done => seen.push(done) });
  assert.deepEqual(seen.sort(), [1, 2]);
});

test('unknown refs and non-repositories raise GitError', async t => {
  const dir = setup(t, { 'a.js': 'a();\n' }, { 'a.js': 'b();\n' });
  await assert.rejects(analyze({ cwd: dir, base: 'nope', feature: 'feat' }), /Ref not found: nope/);
  await assert.rejects(analyze({ cwd: dir, base: '--output=x', feature: 'feat' }), /Ref not found/);
  await assert.rejects(analyze({ cwd: '/', base: 'a', feature: 'b' }), /Not a git repository/);
});
