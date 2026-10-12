import { STATUS_LETTER, pct, verdict } from './common.ts';
import type { Report } from '../types.ts';

/** Hidden marker so a CI job can find and update its own PR comment instead of adding new ones. */
export const COMMENT_MARKER = '<!-- semantic-diff -->';

/** Escapes characters that would break out of a Markdown table cell or inline code. */
function cell(text: string): string {
  return text.replace(/[\\|`<>]/g, c => `\\${c}`).replace(/\r?\n/g, ' ');
}

export function renderMarkdown(report: Report): string {
  const v = verdict(report);
  const lines = [COMMENT_MARKER, `### semantic-diff · \`${cell(report.target)}\``, ''];

  if (report.total === 0) {
    lines.push(`_${v.text}._`);
  } else {
    lines.push(
      `**${pct(report.ratio)} signal** (${report.semantic} of ${report.total} changed lines): ${v.text.toLowerCase()}.`,
      '',
      '| | Lines | |',
      '|---|---:|---|',
      `| Logic | ${report.breakdown.logic} | signal |`,
      `| Comment | ${report.breakdown.comment} | signal |`,
      `| Moved | ${report.breakdown.moved} | noise |`,
      `| Formatting | ${report.breakdown.format} | noise |`
    );
  }

  if (report.files.length > 0) {
    const sorted = [...report.files].sort(
      (a, b) => b.semantic - a.semantic || a.file.localeCompare(b.file)
    );
    lines.push(
      '',
      '<details><summary>Files</summary>',
      '',
      '| | File | Changed | Signal |',
      '|---|---|---:|---:|'
    );
    for (const f of sorted.slice(0, 50)) {
      lines.push(`| ${STATUS_LETTER[f.status]} | ${cell(f.file)} | ${f.total} | ${pct(f.ratio)} |`);
    }
    if (sorted.length > 50) lines.push(`| | _…and ${sorted.length - 50} more_ | | |`);
    lines.push('', '</details>');
  }

  if (report.failed.length > 0) {
    lines.push(
      '',
      `> Could not analyze: ${report.failed.map(f => `\`${cell(f.file)}\``).join(', ')}`
    );
  }
  if (report.skipped.length > 0) {
    lines.push(
      '',
      `> Skipped (language not supported yet): ${report.skipped.map(f => `\`${cell(f)}\``).join(', ')}`
    );
  }

  return `${lines.join('\n')}\n`;
}
