import { styleText } from 'node:util';
import { STATUS_LETTER, barSplit, pct, plural, verdict } from './common.ts';
import type { Report } from '../types.ts';
import { VERSION } from '../version.ts';

const BAR_WIDTH = 40;

const bold = (s: string): string => styleText('bold', s);
const dim = (s: string): string => styleText('gray', s);
const green = (s: string): string => styleText('green', s);
const red = (s: string): string => styleText('red', s);
const yellow = (s: string): string => styleText('yellow', s);
const cyan = (s: string): string => styleText('cyan', s);

export function renderTerminal(report: Report, options: { detailed?: boolean } = {}): string {
  const out: string[] = [];
  const v = verdict(report);

  out.push('', `${bold(cyan('semantic-diff'))} ${dim(`v${VERSION}`)}  ${bold(report.target)}`, '');

  if (report.total > 0) {
    const [signalCells, noiseCells] = barSplit(report.ratio, BAR_WIDTH);
    const bar = green('█'.repeat(signalCells)) + red('░'.repeat(noiseCells));
    out.push(
      `  ${bar}`,
      `  ${green(`Signal ${pct(report.ratio).padStart(6)}`)}  ${dim(plural(report.semantic, 'line'))}   ` +
        `${red(`Noise ${pct(100 - report.ratio).padStart(6)}`)}  ${dim(plural(report.noise, 'line'))}`,
      '',
      `  ${dim('signal')}  logic ${report.breakdown.logic} · comment ${report.breakdown.comment}`,
      `  ${dim('noise ')}  moved ${report.breakdown.moved} · format ${report.breakdown.format}`,
      ''
    );
  }

  const paint = v.kind === 'noise' ? yellow : v.kind === 'signal' ? green : cyan;
  out.push(`  ${paint(v.text)}`, '');

  if (options.detailed && report.files.length > 0) {
    out.push(bold('  Files'));
    const width = Math.max(...report.files.map(f => f.file.length));
    const sorted = [...report.files].sort(
      (a, b) => b.semantic - a.semantic || a.file.localeCompare(b.file)
    );
    for (const f of sorted) {
      const label = f.status === 'renamed' ? `${f.oldFile} → ${f.file}` : f.file;
      out.push(
        `  ${dim(STATUS_LETTER[f.status])} ${(f.status === 'renamed' ? label : f.file).padEnd(width)}  ` +
          `${String(f.total).padStart(4)} changed  ${green(String(f.semantic).padStart(4))} signal  ` +
          `${dim(pct(f.ratio).padStart(6))}  ${dim(f.engine)}`
      );
    }
    out.push('');
  }

  if (report.skipped.length > 0) {
    out.push(
      `  ${yellow('Skipped')} ${report.skipped.join(', ')} ${dim('(language not supported yet)')}`
    );
  }
  for (const failure of report.failed) {
    out.push(`  ${yellow('Warning')} ${failure.file} could not be analyzed (${failure.error})`);
  }
  if (report.skipped.length > 0 || report.failed.length > 0) out.push('');

  return out.join('\n') + '\n';
}
