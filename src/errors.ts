/** Exit codes, stable across releases so CI scripts can rely on them. */
export const EXIT = { OK: 0, THRESHOLD: 1, USAGE: 2, GIT: 3, INTERNAL: 4 } as const;

export class SemanticDiffError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode: number) {
    super(message);
    this.name = new.target.name;
    this.exitCode = exitCode;
  }
}

/** Bad arguments or configuration. */
export class UsageError extends SemanticDiffError {
  constructor(message: string) {
    super(message, EXIT.USAGE);
  }
}

/** Not a repository, unknown ref, or git itself failed. */
export class GitError extends SemanticDiffError {
  constructor(message: string) {
    super(message, EXIT.GIT);
  }
}

export class ThresholdError extends SemanticDiffError {
  constructor(ratio: number, threshold: number) {
    super(`Semantic ratio ${ratio.toFixed(2)}% is below threshold ${threshold}%`, EXIT.THRESHOLD);
  }
}
