export { analyze } from './analyze.ts';
export { classifyNormalizedDiff, buildBreakdown, countChangedLines, ratioOf } from './classify.ts';
export { EXIT, GitError, SemanticDiffError, ThresholdError, UsageError } from './errors.ts';
export { renderHtml } from './report/html.ts';
export { renderJson, toJson } from './report/json.ts';
export { COMMENT_MARKER, renderMarkdown } from './report/markdown.ts';
export { renderTerminal } from './report/terminal.ts';
export type {
  AnalyzeOptions,
  Breakdown,
  ChangeStatus,
  EngineName,
  FileFailure,
  FileResult,
  Report,
} from './types.ts';
export { VERSION } from './version.ts';
