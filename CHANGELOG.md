# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [3.0.0]

A rewrite. 2.0.0 could not analyse a single file with its own dependencies (see _Fixed_), so
this release is a correction as much as a feature release.

### Breaking

- ESM, written in TypeScript. Requires Node.js 22.13 or newer.
- The JSON output has a new, versioned shape (`schema_version: 1`, `schema/report.schema.json`) and goes to stdout only with `--format json`; it is no longer mixed into the human output.
- `semantic` now means `logic + comment`, and `noise` means `moved + format`. The four parts are reported in `breakdown`.
- `--output` picks the format from the file extension (`.html`, `.md`, `.json`).
- A diff with no analyzable files exits 0 instead of 1. `--threshold` is not evaluated when nothing changed.
- Exit codes are now stable: 0 ok, 1 below threshold, 2 usage, 3 git, 4 internal.
- The package no longer depends on `chalk`.

### Added

- Classification into logic, comment, moved and format.
- tree-sitter engine for Python, Go, Rust, Java, C, C++, C#, Ruby and PHP.
- Markdown, YAML, Less and GraphQL through Prettier.
- Rename detection; added and deleted files are analysed.
- `--format`, `--ignore`, `--no-cache`, `.semanticdiffrc.json`.
- Content-addressed result cache and parallel analysis.
- GitHub Action with a single, updated pull request comment.
- `semantic-diff-mcp`, a Model Context Protocol server.
- A programmatic API.

### Fixed

- Prettier 3's `format()` is asynchronous; 2.0.0 treated its `Promise` as text and crashed with `value.split is not a function` on the first file.
- Command injection: branch and file names were interpolated into a shell command.
- The "noise" figure measured how unformatted the feature branch was, not what the pull request reformatted, and the ratio could exceed 100%.
- The cache keyed on branch names with a one-hour TTL and returned stale content after a branch moved.
- Added, deleted and empty files were skipped silently.
- Python, Java, Go and Rust files were listed as supported but fell back to the raw text, reporting 100% signal.
- File and branch names were not escaped in the HTML report.
- `--threshold 0` was ignored, unknown flags were accepted, and `build` or `dist` anywhere in a path excluded the file.
- The Prettier config was read from a single hard-coded `.prettierrc`.
