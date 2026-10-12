import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COMMENT_MARKER,
  renderHtml,
  renderJson,
  renderMarkdown,
  renderTerminal,
  toJson,
} from '../src/index.ts';
import type { Report } from '../src/index.ts';
import { validate } from './schema.ts';

function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    target: 'main...feat',
    base: 'a'.repeat(40),
    feature: 'b'.repeat(40),
    total: 20,
    semantic: 6,
    noise: 14,
    ratio: 30,
    breakdown: { logic: 4, comment: 2, moved: 4, format: 10 },
    files: [
      {
        file: 'src/a.ts',
        oldFile: 'src/a.ts',
        status: 'modified',
        engine: 'prettier',
        total: 20,
        semantic: 6,
        noise: 14,
        ratio: 30,
        breakdown: { logic: 4, comment: 2, moved: 4, format: 10 },
      },
    ],
    skipped: [],
    failed: [],
    stats: { analyzed: 1, cacheHits: 0 },
    ...overrides,
  };
}

test('the JSON report validates against the schema, and the validator rejects bad data', () => {
  assert.deepEqual(validate(toJson(makeReport())), []);
  assert.notDeepEqual(validate({}), []);
  assert.notDeepEqual(validate({ ...toJson(makeReport()), schema_version: 2 }), []);
  assert.notDeepEqual(validate({ ...toJson(makeReport()), extra: true }), []);
  const bad = toJson(makeReport()) as { totals: { ratio: number } };
  bad.totals.ratio = 120;
  assert.notDeepEqual(validate(bad), []);
});

test('renderJson is stable, pretty and newline-terminated', () => {
  const text = renderJson(makeReport());
  assert.ok(text.endsWith('}\n'));
  assert.equal(renderJson(makeReport()), text);
});

test('HTML escapes every interpolated value and contains no script', () => {
  const evil = '"><img src=x onerror=alert(1)>';
  const html = renderHtml(
    makeReport({
      target: evil,
      files: [{ ...makeReport().files[0]!, file: evil, oldFile: evil }],
      failed: [{ file: evil, error: evil }],
      skipped: [evil],
    })
  );
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /<script/i);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('Markdown starts with the marker and escapes table-breaking characters', () => {
  const md = renderMarkdown(
    makeReport({ files: [{ ...makeReport().files[0]!, file: 'a|b`c.ts' }] })
  );
  assert.ok(md.startsWith(COMMENT_MARKER));
  assert.match(md, /a\\\|b\\`c\.ts/);
});

test('Markdown truncates long file lists', () => {
  const file = makeReport().files[0]!;
  const files = Array.from({ length: 60 }, (_, i) => ({ ...file, file: `f${i}.ts` }));
  assert.match(renderMarkdown(makeReport({ files })), /and 10 more/);
});

test('reports handle an empty diff without dividing by zero', () => {
  const empty = makeReport({
    total: 0,
    semantic: 0,
    noise: 0,
    ratio: 0,
    files: [],
    breakdown: { logic: 0, comment: 0, moved: 0, format: 0 },
  });
  assert.match(renderTerminal(empty), /No analyzable changes/);
  assert.match(renderMarkdown(empty), /No analyzable changes/);
  assert.doesNotMatch(renderHtml(empty), /NaN/);
  assert.deepEqual(validate(toJson(empty)), []);
});

test('terminal output lists skipped and failed files', () => {
  const text = renderTerminal(
    makeReport({ skipped: ['Main.kt'], failed: [{ file: 'b.js', error: 'unparseable: x' }] }),
    { detailed: true }
  );
  assert.match(text, /Skipped.*Main\.kt/);
  assert.match(text, /b\.js could not be analyzed/);
  assert.match(text, /src\/a\.ts/);
});

test('the verdict follows the ratio', () => {
  assert.match(renderTerminal(makeReport({ ratio: 5 })), /Mostly noise/);
  assert.match(renderTerminal(makeReport({ ratio: 20 })), /Mixed/);
  assert.match(renderTerminal(makeReport({ ratio: 80 })), /Mostly real changes/);
});
