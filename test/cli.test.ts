import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { cleanup, commitOnBranch, createRepo, git, runCli } from './helpers.ts';
import { validate } from './schema.ts';

const BASE_A = 'function a(){return 1}\nconst x = 1\n';
const REFORMATTED_A = 'function a() {\n  return 1;\n}\nconst x = 1;\n';
const CHANGED_A = 'function a() {\n  return 2;\n}\nconst x = 1;\n';

function repo(
  t: TestContext,
  base: Record<string, string | null>,
  feature: Record<string, string | null>
): string {
  const dir = createRepo(base);
  commitOnBranch(dir, 'feat', feature);
  t.after(() => cleanup(dir));
  return dir;
}

test('--help and --version print and succeed', t => {
  const dir = repo(t, { 'a.js': BASE_A }, { 'a.js': CHANGED_A });
  const help = runCli(dir, ['--help']);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /USAGE/);
  assert.match(runCli(dir, ['-v']).stdout, /^\d+\.\d+\.\d+/);
});

test('pure formatting change falls below any threshold', t => {
  const dir = repo(t, { 'a.js': BASE_A }, { 'a.js': REFORMATTED_A });
  const r = runCli(dir, ['main', 'feat', '-q', '--threshold', '1']);
  assert.equal(r.code, 1, r.stderr);
  assert.match(r.stderr, /below threshold/);
  assert.equal(r.stdout, '', '--quiet prints nothing');
});

test('a real change passes the threshold', t => {
  const dir = repo(t, { 'a.js': BASE_A }, { 'a.js': CHANGED_A });
  assert.equal(runCli(dir, ['main', 'feat', '--threshold', '10']).code, 0);
});

test('--threshold 0 is honoured; invalid values are usage errors', t => {
  const dir = repo(t, { 'a.js': BASE_A }, { 'a.js': REFORMATTED_A });
  assert.equal(runCli(dir, ['main', 'feat', '-q', '--threshold', '0']).code, 0);
  assert.equal(runCli(dir, ['main', 'feat', '-q', '--threshold', 'abc']).code, 2);
  assert.equal(runCli(dir, ['main', 'feat', '-q', '--threshold', '101']).code, 2);
  assert.equal(runCli(dir, ['main', 'feat', '-q', '--threshold', '-1']).code, 2);
});

test('unknown flags, missing values and wrong arity are usage errors (exit 2)', t => {
  const dir = repo(t, { 'a.js': BASE_A }, { 'a.js': CHANGED_A });
  assert.equal(runCli(dir, ['main', 'feat', '--bogus']).code, 2);
  assert.equal(runCli(dir, ['main', 'feat', '--output']).code, 2);
  assert.equal(runCli(dir, ['main']).code, 2);
  assert.equal(runCli(dir, ['main', 'feat', 'extra']).code, 2);
  assert.equal(runCli(dir, ['main', 'feat', '--format', 'xml']).code, 2);
});

test('unknown ref and non-repository exit with 3', t => {
  const dir = repo(t, { 'a.js': BASE_A }, { 'a.js': CHANGED_A });
  const r = runCli(dir, ['main', 'nope']);
  assert.equal(r.code, 3);
  assert.match(r.stderr, /Ref not found: nope/);
  assert.equal(runCli('/', ['main', 'feat']).code, 3);
});

test('--format json is machine-readable and matches the published schema', t => {
  const dir = repo(
    t,
    { 'a.js': BASE_A, 'b.py': 'x = 1\n', 'Main.kt': 'fun f() {}\n' },
    { 'a.js': CHANGED_A, 'b.py': 'x = 2\n', 'Main.kt': 'fun f() { g() }\n' }
  );
  const r = runCli(dir, ['main', 'feat', '--format', 'json']);
  assert.equal(r.code, 0, r.stderr);
  const report: unknown = JSON.parse(r.stdout); // throws if anything but JSON was printed
  assert.deepEqual(validate(report), []);
});

test('--format markdown emits the comment marker; --format html is a full document', t => {
  const dir = repo(t, { 'a.js': BASE_A }, { 'a.js': CHANGED_A });
  assert.match(runCli(dir, ['main', 'feat', '-f', 'markdown']).stdout, /^<!-- semantic-diff -->/);
  assert.match(runCli(dir, ['main', 'feat', '-f', 'html']).stdout, /^<!doctype html>/);
});

test('--output picks the format from the extension and creates directories', t => {
  const dir = repo(t, { 'a.js': BASE_A }, { 'a.js': CHANGED_A });
  const json = path.join(dir, 'out', 'r.json');
  const md = path.join(dir, 'r.md');
  const html = path.join(dir, 'r.html');
  assert.equal(runCli(dir, ['main', 'feat', '-q', '-o', json]).code, 0);
  runCli(dir, ['main', 'feat', '-q', '-o', md]);
  runCli(dir, ['main', 'feat', '-q', '-o', html]);
  assert.deepEqual(validate(JSON.parse(fs.readFileSync(json, 'utf8'))), []);
  assert.match(fs.readFileSync(md, 'utf8'), /semantic-diff/);
  assert.match(fs.readFileSync(html, 'utf8'), /<!doctype html>/);
});

test('--detailed lists every file with its engine', t => {
  const dir = repo(
    t,
    { 'a.js': BASE_A, 'b.py': 'x = 1\n' },
    { 'a.js': CHANGED_A, 'b.py': 'x = 2\n' }
  );
  const r = runCli(dir, ['main', 'feat', '--detailed']);
  assert.match(r.stdout, /a\.js.*prettier/);
  assert.match(r.stdout, /b\.py.*tree-sitter/);
});

test('--ignore and the config file both drop files', t => {
  const dir = repo(
    t,
    { 'a.js': BASE_A, 'skip.js': 'a();\n' },
    { 'a.js': CHANGED_A, 'skip.js': 'b();\n' }
  );
  const viaFlag = JSON.parse(
    runCli(dir, ['main', 'feat', '-f', 'json', '--ignore', 'skip.js']).stdout
  ) as { files: unknown[] };
  assert.equal(viaFlag.files.length, 1);

  fs.writeFileSync(path.join(dir, '.semanticdiffrc.json'), JSON.stringify({ ignore: ['skip.js'] }));
  const viaConfig = JSON.parse(runCli(dir, ['main', 'feat', '-f', 'json']).stdout) as {
    files: unknown[];
  };
  assert.equal(viaConfig.files.length, 1);
});

test('a threshold in the config applies unless the flag overrides it', t => {
  const dir = repo(t, { 'a.js': BASE_A }, { 'a.js': REFORMATTED_A });
  fs.writeFileSync(path.join(dir, '.semanticdiffrc.json'), JSON.stringify({ threshold: 50 }));
  assert.equal(runCli(dir, ['main', 'feat', '-q']).code, 1);
  assert.equal(runCli(dir, ['main', 'feat', '-q', '-t', '0']).code, 0);
});

test('an invalid config is a usage error that names the problem', t => {
  const dir = repo(t, { 'a.js': BASE_A }, { 'a.js': CHANGED_A });
  fs.writeFileSync(path.join(dir, '.semanticdiffrc.json'), JSON.stringify({ treshold: 5 }));
  const r = runCli(dir, ['main', 'feat']);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /Unknown option "treshold"/);
});

test('only non-analyzable files changed: exit 0, nothing to review', t => {
  const dir = repo(t, { 'a.js': BASE_A, 'logo.png': 'x' }, { 'logo.png': 'y' });
  const r = runCli(dir, ['main', 'feat', '--threshold', '90']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /No analyzable changes/);
});

test('branch names cannot inject shell commands', t => {
  const dir = repo(t, { 'a.js': BASE_A }, { 'a.js': CHANGED_A });
  const marker = path.join(dir, 'PWNED');
  const r = runCli(dir, [`main; touch ${marker}`, 'feat']);
  assert.notEqual(r.code, 0);
  assert.equal(fs.existsSync(marker), false, 'a shell command was executed');
});

test(
  'file names cannot inject shell commands',
  { skip: process.platform === 'win32' && 'file name is invalid on Windows' },
  t => {
    const dir = repo(t, { 'a.js': BASE_A }, { '$(touch PWNED2).js': 'const a = 1;\n' });
    runCli(dir, ['main', 'feat']);
    assert.equal(fs.existsSync(path.join(dir, 'PWNED2')), false, 'a shell command was executed');
  }
);

test('a ref that looks like a flag is never passed to git as one', t => {
  const dir = repo(t, { 'a.js': BASE_A }, { 'a.js': CHANGED_A });
  const r = runCli(dir, ['--', '--output=evil', 'feat']);
  assert.equal(r.code, 3);
  assert.equal(fs.existsSync(path.join(dir, 'evil')), false);
});

test(
  'HTML output escapes hostile file names',
  { skip: process.platform === 'win32' && 'file name is invalid on Windows' },
  t => {
    const dir = repo(t, { 'a.js': BASE_A }, { '<script>alert(1)</script>.js': 'const a = 1;\n' });
    const out = path.join(dir, 'report.html');
    assert.equal(runCli(dir, ['main', 'feat', '-q', '-o', out]).code, 0);
    const html = fs.readFileSync(out, 'utf8');
    assert.doesNotMatch(html, /<script>alert/);
    assert.match(html, /&lt;script&gt;/);
  }
);

test('the result follows the branch tip', t => {
  const dir = repo(t, { 'a.js': 'const a = 1;\n' }, { 'a.js': 'const a = 2;\n' });
  const first = runCli(dir, ['main', 'feat', '-f', 'json']).stdout;
  fs.writeFileSync(path.join(dir, 'a.js'), 'const a = 2;\nconst b = 3;\nconst c = 4;\n');
  git(dir, 'commit', '-qam', 'more');
  assert.notEqual(runCli(dir, ['main', 'feat', '-f', 'json']).stdout, first);
});
