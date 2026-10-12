import type { ChangeStatus, Report } from '../types.ts';

export const pct = (n: number): string => `${n.toFixed(1)}%`;

export const STATUS_LETTER: Record<ChangeStatus, string> = {
  added: 'A',
  deleted: 'D',
  modified: 'M',
  renamed: 'R',
};

export type Verdict = 'empty' | 'noise' | 'mixed' | 'signal';

export function verdict(report: Report): { kind: Verdict; text: string } {
  if (report.total === 0) return { kind: 'empty', text: 'No analyzable changes' };
  if (report.ratio < 10) return { kind: 'noise', text: 'Mostly noise: safe to skim' };
  if (report.ratio < 30) return { kind: 'mixed', text: 'Mixed: some real changes among the noise' };
  return { kind: 'signal', text: 'Mostly real changes: review closely' };
}

/** Largest-remainder rounding, so the two halves of a bar always add up to `width`. */
export function barSplit(ratio: number, width: number): [number, number] {
  const filled = Math.round((ratio / 100) * width);
  return [filled, width - filled];
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
