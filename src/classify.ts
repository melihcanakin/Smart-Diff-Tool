import { diffLines } from 'diff';
import { commentPattern } from './languages.ts';
import type { Breakdown } from './types.ts';

/** A line worth matching as "moved": it must carry an identifier, not just punctuation like `}`. */
const MEANINGFUL = /[\p{L}\p{N}_$]/u;

/** Lines of a diff part without the trailing empty element a final newline produces. */
function splitLines(value: string): string[] {
  const lines = value.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

function ensureTrailingNewline(text: string): string {
  return text === '' || text.endsWith('\n') ? text : `${text}\n`;
}

/** Counts the added and removed lines of a diff. */
export function countChangedLines(a: string, b: string): number {
  let count = 0;
  for (const part of diffLines(ensureTrailingNewline(a), ensureTrailingNewline(b))) {
    if (part.added || part.removed) count += splitLines(part.value).length;
  }
  return count;
}

/**
 * Splits the lines that differ between two *normalised* versions into logic / comment / moved.
 *
 * - moved:   the same line was removed in one place and added in another (reordered imports,
 *            functions moved inside a file). Matched as a multiset, so order does not matter.
 * - comment: what remains and is only a comment.
 * - logic:   everything else.
 *
 * Blank lines are ignored: whether a blank line exists is formatting.
 */
export function classifyNormalizedDiff(
  baseNormalized: string,
  featureNormalized: string,
  file: string
): Pick<Breakdown, 'logic' | 'comment' | 'moved'> {
  const removed: string[] = [];
  const added: string[] = [];

  for (const part of diffLines(
    ensureTrailingNewline(baseNormalized),
    ensureTrailingNewline(featureNormalized)
  )) {
    if (!part.added && !part.removed) continue;
    (part.added ? added : removed).push(...splitLines(part.value).filter(l => l.trim() !== ''));
  }

  // Matched on the exact line, indentation included: the same statement at a different nesting
  // level is a behaviour change, not a move.
  const pool = new Map<string, number>();
  for (const line of removed) {
    const key = line.trimEnd();
    if (MEANINGFUL.test(key)) pool.set(key, (pool.get(key) ?? 0) + 1);
  }

  let pairs = 0;
  const unmatchedAdded: string[] = [];
  for (const line of added) {
    const key = line.trimEnd();
    const left = pool.get(key) ?? 0;
    if (left > 0) {
      pool.set(key, left - 1);
      pairs++;
    } else {
      unmatchedAdded.push(line);
    }
  }

  // Whatever is left in the pool was removed without a matching addition.
  const unmatchedRemoved: string[] = [];
  const stillPooled = new Map(pool);
  for (const line of removed) {
    const key = line.trimEnd();
    if (!MEANINGFUL.test(key)) {
      unmatchedRemoved.push(line);
      continue;
    }
    const left = stillPooled.get(key) ?? 0;
    if (left > 0) {
      stillPooled.set(key, left - 1);
      unmatchedRemoved.push(line);
    }
  }

  const isComment = commentPattern(file);
  const rest = [...unmatchedRemoved, ...unmatchedAdded];
  const comment = rest.filter(l => isComment.test(l)).length;

  return { moved: pairs * 2, comment, logic: rest.length - comment };
}

/**
 * Combines raw and normalised counts into the final breakdown. Normalised line counts and raw
 * line counts are measured on different text, so the signal part is clamped to the raw total;
 * the remainder is, by definition, formatting.
 */
export function buildBreakdown(
  total: number,
  parts: Pick<Breakdown, 'logic' | 'comment' | 'moved'>
): Breakdown {
  let { logic, comment, moved } = parts;
  let excess = logic + comment + moved - total;

  for (const key of ['logic', 'comment', 'moved'] as const) {
    if (excess <= 0) break;
    const cut = Math.min(excess, key === 'logic' ? logic : key === 'comment' ? comment : moved);
    if (key === 'logic') logic -= cut;
    else if (key === 'comment') comment -= cut;
    else moved -= cut;
    excess -= cut;
  }

  return { logic, comment, moved, format: total - logic - comment - moved };
}

export function ratioOf(semantic: number, total: number): number {
  return total > 0 ? Math.min(100, (semantic / total) * 100) : 0;
}
