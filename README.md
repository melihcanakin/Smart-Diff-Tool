# semantic-diff

> Separate signal from noise in code reviews.

[![CI](https://github.com/Smart-Yazilim/semantic-diff/actions/workflows/ci.yml/badge.svg)](https://github.com/Smart-Yazilim/semantic-diff/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.13-brightgreen.svg)](https://nodejs.org)

A pull request that runs a formatter, sorts the imports and fixes one bug shows up as hundreds of changed lines. `semantic-diff` reads the diff for you and says how much of it you actually have to read.

```text
$ git diff --stat main feat
 src/cart.js   | 26 +++++++++++++++-----------
 src/report.py | 13 ++++++++-----
 src/server.go |  2 +-
 src/user.ts   | 14 ++++++++++----
 4 files changed, 34 insertions(+), 21 deletions(-)

$ semantic-diff main feat --detailed

semantic-diff v3.0.0  main...feat

  ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
  Signal  10.9%  6 lines   Noise  89.1%  49 lines

  signal  logic 6 · comment 0
  noise   moved 4 · format 45

  Mixed: some real changes among the noise

  Files
  M src/cart.js      26 changed     4 signal   15.4%  prettier
  M src/report.py    13 changed     2 signal   15.4%  tree-sitter
  M src/server.go     2 changed     0 signal    0.0%  tree-sitter
  M src/user.ts      14 changed     0 signal    0.0%  prettier
```

55 changed lines, 6 of them real: a changed discount rate and a new guard in `average()`. Everything else is formatting and reordered imports.

## How it classifies a change

Every changed line lands in exactly one bucket, and the buckets always add up to the raw diff:

| Bucket      | Counts as | What it is                                                                                  |
| ----------- | --------- | ------------------------------------------------------------------------------------------- |
| **logic**   | signal    | New, removed or modified code, including a statement moved to another nesting level         |
| **comment** | signal    | Lines that only change a comment                                                            |
| **moved**   | noise     | The same line removed in one place and added in another: reordered imports, moved functions |
| **format**  | noise     | Whitespace, wrapping, quotes, trailing commas, blank lines, line endings                    |

`signal ratio = (logic + comment) / total`.

## How it works

1. `git diff --raw -M` lists the changed files with blob hashes and detects renames.
2. Both versions of each file are **normalised** into a layout-independent form:
   - JavaScript, TypeScript, JSON, CSS, SCSS, Less, HTML, Vue, Markdown, YAML and GraphQL go through **Prettier**, using your project's own config. Whatever Prettier would change is, by definition, not a real change.
   - Python, Go, Rust, Java, C, C++, C#, Ruby and PHP are parsed with **tree-sitter** and printed as one statement per line, indented by nesting depth. Indentation width and wrapping disappear, but nesting stays, so moving `return` into an `if` is still a change, and re-indenting is not.
3. The normalised texts are diffed. Lines that appear on both sides are _moved_, comment-only lines are _comments_, the rest is _logic_. Whatever the raw diff has beyond that is _format_.

Results are cached by blob hash, so a repeat run on a PR only analyses what changed.

## Install

```bash
npm install -g semantic-diff     # needs Node >= 22.13 and git
```

From source:

```bash
git clone https://github.com/Smart-Yazilim/semantic-diff.git
cd semantic-diff && npm ci && npm run build && npm link
```

## Usage

```bash
semantic-diff main my-branch              # summary
semantic-diff main HEAD --detailed        # every file
semantic-diff main HEAD --format json     # machine-readable, see schema/report.schema.json
semantic-diff main HEAD --threshold 20    # exit 1 when under 20% of the diff is real
semantic-diff main HEAD -o report.html    # also write a standalone HTML report (.md and .json work too)
```

`base...feature` is a merge-base diff, like a pull request: commits on `base` that `feature` does not have are ignored.

| Option                | Meaning                                                    |
| --------------------- | ---------------------------------------------------------- |
| `-f, --format <name>` | `terminal` (default), `json`, `markdown`, `html`           |
| `-o, --output <file>` | Also write a report; the format follows the file extension |
| `-t, --threshold <n>` | Minimum signal ratio, 0 to 100                             |
| `-d, --detailed`      | List every file                                            |
| `--ignore <glob>`     | Leave matching files out (repeatable)                      |
| `--no-cache`          | Do not read or write the result cache                      |
| `-q, --quiet`         | Print nothing; use the exit code and `--output`            |

**Exit codes:** `0` ok · `1` below threshold · `2` usage error · `3` git error · `4` internal error.

Lock files, minified bundles and `node_modules/`, `dist/`, `build/`, `coverage/` are skipped automatically. Files in a language that has no engine yet (for example Kotlin) are listed as _skipped_, and files that fail to parse are listed as _could not be analyzed_. Neither is ever counted as signal.

### Configuration

`.semanticdiffrc.json`, or a `"semanticDiff"` field in `package.json`:

```json
{
  "threshold": 20,
  "ignore": ["**/*.generated.ts", "docs/**"],
  "cache": true
}
```

Command-line flags override the file. Unknown keys are an error, so typos do not pass silently.

## GitHub Action

Comments on every pull request with the report (one comment, updated in place), writes the job summary, and can fail the check below a threshold.

```yaml
name: Semantic diff
on: pull_request

permissions:
  contents: read
  pull-requests: write

jobs:
  report:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: Smart-Yazilim/semantic-diff@v3
        with:
          threshold: 10 # optional
```

Outputs: `ratio`, `total`, `semantic`, `noise`, `report` (path to the JSON). On pull requests from forks the token is read-only, so the comment is skipped with a warning while the summary and the threshold check still work.

## Use it from an AI agent (MCP)

`semantic-diff-mcp` is a [Model Context Protocol](https://modelcontextprotocol.io) server over stdio with one read-only tool, `semantic_diff(base, feature, repo?)`. It lets an agent find out which part of a branch is worth reading before it opens a 3,000-line diff.

```bash
# Claude Code
claude mcp add semantic-diff -- npx -y -p semantic-diff semantic-diff-mcp
```

```jsonc
// any MCP client
{
  "mcpServers": {
    "semantic-diff": {
      "command": "npx",
      "args": ["-y", "-p", "semantic-diff", "semantic-diff-mcp"],
    },
  },
}
```

## Library

```ts
import { analyze, renderMarkdown } from 'semantic-diff';

const report = await analyze({ base: 'main', feature: 'HEAD' });
console.log(report.ratio, report.breakdown);
console.log(renderMarkdown(report));
```

## Performance

Measured with `npm run bench` on Node 24, 16 CPU threads, a synthetic repository of JS, TS, Python and Go files:

| Files | Cold cache | Warm cache |
| ----: | ---------: | ---------: |
|   500 |      3.2 s |     0.04 s |
|  2000 |     12.0 s |     0.09 s |

Cold time is dominated by Prettier and the tree-sitter parser. The cache is keyed by blob hash and engine version, so it can never be stale.

## Limitations

- **It measures lines, not meaning.** Renaming a variable is a logic change. Two different programs with the same behaviour are still different programs.
- **Moves are detected within one file.** Code moved to another file shows up as removed in one and added in the other.
- **HTML and Vue**: Prettier keeps the author's line breaks between tags, so adding or removing them is reported as a change.
- **Prettier uses the working tree's config**, not the config at the two refs being compared.
- **Normalised line counts differ from raw line counts** (Prettier may wrap a line into three). The signal is clamped to the raw total so the buckets always sum up, but per-file percentages are approximate.
- **tree-sitter normalisation is conservative.** It ignores layout, Python quote style and trailing commas; anything else a formatter rewrites (for example reordering Go imports) is reported as logic or moved.
- Linux and macOS are tested in CI. Windows is run as an experimental, non-blocking job.

More detail in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Development

```bash
npm ci
npm test                 # node:test, runs the TypeScript sources directly
npm run test:coverage    # fails under 85% line coverage
npm run typecheck && npm run lint
npm run bench
```

See [CONTRIBUTING.md](CONTRIBUTING.md). Security issues: [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © Melihcan Akın
