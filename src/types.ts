/** How a changed line is classified. `logic` and `comment` are signal; `moved` and `format` are noise. */
export interface Breakdown {
  /** Lines whose meaning changed (new, removed or modified code). */
  logic: number;
  /** Lines that only change comments. */
  comment: number;
  /** Lines that were reordered or moved without being modified. */
  moved: number;
  /** Lines that differ only in formatting (whitespace, quotes, trailing commas, wrapping). */
  format: number;
}

export type ChangeStatus = 'added' | 'deleted' | 'modified' | 'renamed';
export type EngineName = 'prettier' | 'tree-sitter';

export interface FileResult {
  file: string;
  /** Previous path; differs from `file` only for renames. */
  oldFile: string;
  status: ChangeStatus;
  engine: EngineName;
  /** Raw changed lines (added + removed) between the two versions. */
  total: number;
  /** `logic + comment`: the part a reviewer has to read. */
  semantic: number;
  /** `moved + format`: the part a reviewer can skip. */
  noise: number;
  /** `semantic / total` as a percentage, 0 when nothing changed. */
  ratio: number;
  breakdown: Breakdown;
}

export interface FileFailure {
  file: string;
  error: string;
}

export interface Report {
  target: string;
  base: string;
  feature: string;
  total: number;
  semantic: number;
  noise: number;
  ratio: number;
  breakdown: Breakdown;
  files: FileResult[];
  /** Recognised source files that no engine can analyse yet. */
  skipped: string[];
  /** Files an engine could not parse. They are excluded from the totals, never counted as signal. */
  failed: FileFailure[];
  stats: { analyzed: number; cacheHits: number };
}

export interface AnalyzeOptions {
  /** Directory inside the git repository. Defaults to the current directory. */
  cwd?: string;
  base: string;
  feature: string;
  /** Extra glob patterns to leave out of the analysis. */
  ignore?: string[];
  /** Persist results by blob hash. Defaults to true. */
  cache?: boolean;
  /** Files analysed in parallel. Defaults to min(8, CPU count). */
  concurrency?: number;
  onProgress?: (done: number, total: number, file: string) => void;
}
