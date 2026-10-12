#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, styleText } from 'node:util';
import { analyze } from './analyze.ts';
import { loadConfig, validateThreshold } from './config.ts';
import { EXIT, SemanticDiffError, ThresholdError, UsageError } from './errors.ts';
import { renderHtml } from './report/html.ts';
import { renderJson } from './report/json.ts';
import { renderMarkdown } from './report/markdown.ts';
import { renderTerminal } from './report/terminal.ts';
import type { Report } from './types.ts';
import { VERSION } from './version.ts';

const FORMATS = ['terminal', 'json', 'markdown', 'html'] as const;
type Format = (typeof FORMATS)[number];

const OPTIONS = {
  format: { type: 'string', short: 'f' },
  output: { type: 'string', short: 'o' },
  threshold: { type: 'string', short: 't' },
  ignore: { type: 'string', multiple: true },
  detailed: { type: 'boolean', short: 'd' },
  quiet: { type: 'boolean', short: 'q' },
  'no-cache': { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
} as const;

const HELP = `
${styleText(['bold', 'cyan'], 'semantic-diff')} v${VERSION}
Separate signal from noise in a code review.

${styleText('bold', 'USAGE')}
  semantic-diff <base> <feature> [options]

${styleText('bold', 'ARGUMENTS')}
  base                 Base ref (branch, tag or commit), e.g. main
  feature              Ref to compare against it

${styleText('bold', 'OPTIONS')}
  -f, --format <name>  terminal (default) | json | markdown | html
  -o, --output <file>  Also write a report; format from extension (.json .md .html)
  -t, --threshold <n>  Minimum signal ratio, 0-100 (exit 1 if below)
  -d, --detailed       List every file
      --ignore <glob>  Leave matching files out (repeatable)
      --no-cache       Do not read or write the result cache
  -q, --quiet          Print nothing; rely on the exit code and --output
  -h, --help           Show this help
  -v, --version        Show the version

${styleText('bold', 'CONFIG')}
  .semanticdiffrc.json or the "semanticDiff" field of package.json:
  { "threshold": 20, "ignore": ["**/*.generated.ts"], "cache": true }

${styleText('bold', 'EXIT CODES')}
  0 ok   1 below threshold   2 usage error   3 git error   4 internal error

${styleText('bold', 'EXAMPLES')}
  semantic-diff main feature-branch
  semantic-diff main HEAD --detailed
  semantic-diff main HEAD --format json
  semantic-diff main HEAD --threshold 20 --output report.html
`;

function formatFromExtension(file: string): Format {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.json') return 'json';
  if (ext === '.md' || ext === '.markdown') return 'markdown';
  return 'html';
}

function render(report: Report, format: Format, detailed: boolean): string {
  switch (format) {
    case 'json':
      return renderJson(report);
    case 'markdown':
      return renderMarkdown(report);
    case 'html':
      return renderHtml(report);
    case 'terminal':
      return renderTerminal(report, { detailed });
  }
}

function parseCli(
  argv: string[]
): ReturnType<typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: true }>> {
  try {
    return parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
  } catch (err) {
    throw new UsageError((err as Error).message);
  }
}

async function run(argv: string[]): Promise<void> {
  const { values, positionals } = parseCli(argv);

  if (values.help) return void process.stdout.write(HELP);
  if (values.version) return void process.stdout.write(`${VERSION}\n`);

  if (positionals.length !== 2) {
    process.stderr.write(HELP);
    throw new UsageError('Expected exactly two arguments: <base> <feature>');
  }
  const [base, feature] = positionals as [string, string];

  const format = values.format ?? 'terminal';
  if (!(FORMATS as readonly string[]).includes(format)) {
    throw new UsageError(`Invalid --format "${format}": expected ${FORMATS.join(', ')}`);
  }

  const config = loadConfig(process.cwd());
  const threshold =
    values.threshold !== undefined
      ? validateThreshold(values.threshold, '--threshold')
      : config.threshold;
  const ignore = [...(config.ignore ?? []), ...(values.ignore ?? [])];

  const interactive = process.stderr.isTTY && format === 'terminal' && !values.quiet;
  const report = await analyze({
    base,
    feature,
    ignore,
    cache: !values['no-cache'] && config.cache !== false,
    onProgress: interactive
      ? (done, total) =>
          process.stderr.write(`\r${styleText('gray', `Analyzing ${done}/${total}`)}`)
      : undefined,
  });
  if (interactive) process.stderr.write('\r\x1b[K');

  if (!values.quiet)
    process.stdout.write(render(report, format as Format, Boolean(values.detailed)));

  if (values.output) {
    const target = path.resolve(values.output);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, render(report, formatFromExtension(target), true));
    if (!values.quiet && format === 'terminal') {
      process.stdout.write(`${styleText('green', '✓')} Report saved: ${values.output}\n\n`);
    }
  }

  if (threshold !== undefined && report.total > 0 && report.ratio < threshold) {
    throw new ThresholdError(report.ratio, threshold);
  }
}

try {
  await run(process.argv.slice(2));
} catch (err) {
  if (err instanceof SemanticDiffError) {
    process.stderr.write(`\n${styleText('red', `✗ ${err.message}`)}\n\n`);
    process.exitCode = err.exitCode;
  } else {
    process.stderr.write(
      `\n${styleText('red', '✗ Internal error:')} ${(err as Error).stack ?? String(err)}\n\n`
    );
    process.exitCode = EXIT.INTERNAL;
  }
}
