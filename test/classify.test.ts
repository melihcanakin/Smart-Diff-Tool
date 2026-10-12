import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildBreakdown,
  classifyNormalizedDiff,
  countChangedLines,
  ratioOf,
} from '../src/classify.ts';
import { globToRegExp } from '../src/ignore.ts';
import { classifyFile } from '../src/languages.ts';

test('countChangedLines counts added and removed lines', () => {
  assert.equal(countChangedLines('a\nb\n', 'a\nc\n'), 2);
  assert.equal(countChangedLines('a\n', 'a\n'), 0);
  assert.equal(countChangedLines('', 'a\nb\nc\n'), 3);
  assert.equal(countChangedLines('a\nb\n', ''), 2);
});

test('a missing final newline alone is not a change', () => {
  assert.equal(countChangedLines('a\nb', 'a\nb\n'), 0);
});

test('reordered lines are classified as moved', () => {
  const r = classifyNormalizedDiff(
    "import b from 'b';\nimport a from 'a';\n",
    "import a from 'a';\nimport b from 'b';\n",
    'x.js'
  );
  assert.deepEqual(r, { logic: 0, comment: 0, moved: 2 });
});

test('a modified line is logic, not moved', () => {
  const r = classifyNormalizedDiff('return 1;\n', 'return 2;\n', 'x.js');
  assert.deepEqual(r, { logic: 2, comment: 0, moved: 0 });
});

test('comment-only changes are comments, per language', () => {
  assert.deepEqual(classifyNormalizedDiff('// a\n', '// b\n', 'x.ts'), {
    logic: 0,
    comment: 2,
    moved: 0,
  });
  assert.deepEqual(classifyNormalizedDiff('# a\n', '# b\n', 'x.py'), {
    logic: 0,
    comment: 2,
    moved: 0,
  });
  // `#id` is a CSS selector, not a comment.
  assert.deepEqual(classifyNormalizedDiff('#a {}\n', '#b {}\n', 'x.css'), {
    logic: 2,
    comment: 0,
    moved: 0,
  });
});

test('blank lines never count', () => {
  assert.deepEqual(classifyNormalizedDiff('a();\n', 'a();\n\n\n', 'x.js'), {
    logic: 0,
    comment: 0,
    moved: 0,
  });
});

test('the same statement at another nesting level is logic, not a move', () => {
  const r = classifyNormalizedDiff('if x:\n  a()\nb()\n', 'if x:\n  a()\n  b()\n', 'x.py');
  assert.equal(r.moved, 0);
  assert.equal(r.logic, 2);
});

test('lines that are only punctuation are never matched as moves', () => {
  const r = classifyNormalizedDiff('}\n', 'x();\n}\n', 'x.js');
  assert.equal(r.moved, 0);
});

test('buildBreakdown makes the parts add up to the raw total', () => {
  const b = buildBreakdown(10, { logic: 3, comment: 1, moved: 2 });
  assert.deepEqual(b, { logic: 3, comment: 1, moved: 2, format: 4 });
  assert.equal(b.logic + b.comment + b.moved + b.format, 10);
});

test('buildBreakdown clamps when normalised counts exceed the raw total', () => {
  const b = buildBreakdown(4, { logic: 9, comment: 2, moved: 2 });
  assert.equal(b.logic + b.comment + b.moved + b.format, 4);
  assert.ok(b.format >= 0);
  assert.ok(b.logic >= 0 && b.comment >= 0 && b.moved >= 0);
});

test('ratioOf stays within 0..100 and survives an empty diff', () => {
  assert.equal(ratioOf(0, 0), 0);
  assert.equal(ratioOf(5, 10), 50);
  assert.equal(ratioOf(15, 10), 100);
});

test('classifyFile ignores by path segment, not substring', () => {
  assert.equal(classifyFile('rebuild.js').kind, 'analyzable');
  assert.equal(classifyFile('src/distance.ts').kind, 'analyzable');
  assert.equal(classifyFile('dist/out.js').kind, 'ignored');
  assert.equal(classifyFile('a/node_modules/b.js').kind, 'ignored');
});

test('classifyFile: generated files, unsupported and binary-ish extensions', () => {
  assert.equal(classifyFile('package-lock.json').kind, 'ignored');
  assert.equal(classifyFile('app.min.js').kind, 'ignored');
  assert.equal(classifyFile('Main.kt').kind, 'unsupported');
  assert.equal(classifyFile('logo.png').kind, 'ignored');
  assert.deepEqual(classifyFile('a.py'), {
    kind: 'analyzable',
    engine: 'tree-sitter',
    grammar: 'python',
  });
  assert.deepEqual(classifyFile('a.ts'), { kind: 'analyzable', engine: 'prettier' });
});

test('globToRegExp follows gitignore-style rules', () => {
  const m = (glob: string, file: string): boolean => globToRegExp(glob).test(file);
  assert.ok(m('*.generated.ts', 'src/deep/a.generated.ts'));
  assert.ok(m('**/*.snap', 'a/b/c.snap'));
  assert.ok(m('docs/**', 'docs/a/b.md'));
  assert.ok(m('src/*.ts', 'src/a.ts'));
  assert.ok(!m('src/*.ts', 'src/deep/a.ts'));
  assert.ok(!m('a.ts', 'ba.ts'));
  assert.ok(m('vendor', 'vendor/lib/x.js'));
  assert.throws(() => globToRegExp(' '), /Empty ignore pattern/);
});
