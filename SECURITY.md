# Security policy

## Reporting a vulnerability

Please do **not** open a public issue. Use GitHub's
["Report a vulnerability"](https://github.com/melihcanakin/Smart-Diff-Tool/security/advisories/new)
form on the Security tab. You will get a first answer within a few days.

## Threat model

`semantic-diff` is meant to run in CI on pull requests, so the repository content, branch names and file names are **untrusted input**.

- Git is always invoked through `execFile` with an argument array, never through a shell. User-supplied refs are resolved with `--end-of-options` and only the resulting commit SHA is used afterwards.
- Generated reports escape every interpolated value (HTML, Markdown). The HTML report has no scripts and makes no network requests.
- The tool only reads from the repository. The cache is written to `$XDG_CACHE_HOME/semantic-diff` (or `~/.cache/semantic-diff`) and contains line counts keyed by content hash, never source code.
- Prettier is run with the project's config. Prettier configs and plugins are code: do not run `semantic-diff` with elevated privileges on a repository you do not trust.
- The MCP server exposes one read-only tool and can read any git repository the user running it can read.
- The GitHub Action passes inputs to its script through environment variables, not by interpolating them into shell code.

## Supported versions

Only the latest major version receives fixes.
