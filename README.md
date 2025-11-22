# semantic-diff

> Separate signal from noise in your code reviews

[![npm](https://img.shields.io/badge/npm-v2.0.0-blue)](https://www.npmjs.com/package/semantic-diff)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D14-brightgreen)](https://nodejs.org)

---

## Why?

Ever reviewed a PR with 1,000 changed lines, only to find that 950 were just formatting?

You're not alone. When a developer runs a linter or formatter on their branch, the diff explodes with whitespace changes, moved imports, and trailing commas. The actual logic changes—the ones that matter—get buried in the noise.

**semantic-diff** solves this by analyzing git diffs and separating them into two categories:

- **Semantic**: Real logic changes (new functions, modified conditions, etc.)
- **Noise**: Formatting, whitespace, style fixes

This lets you focus your review time on what actually matters.

## How it works

The tool compares two branches by:

1. Fetching file contents from both branches
2. Formatting both versions with Prettier (using your project's config)
3. Calculating three diffs:
   - **Total diff**: Raw changes between branches
   - **Semantic diff**: Changes after formatting (real logic)
   - **Noise diff**: What the formatter changed

The semantic ratio tells you what percentage of your PR is actual code changes vs. formatting.

## Installation

```bash
npm install -g semantic-diff
```

Or use directly:

```bash
npx semantic-diff main feature-branch
```

## Usage

### Basic

```bash
semantic-diff main feature-branch
```

### With options

```bash
# Show file-by-file breakdown
semantic-diff main feature-branch --detailed

# Generate HTML report
semantic-diff main feature-branch --output report.html

# Set minimum semantic ratio (CI/CD)
semantic-diff main feature-branch --threshold 20

# Quiet mode (JSON only)
semantic-diff main feature-branch --quiet
```

### Example output

```
═══════════════════════════════════════════════════════════════════
  📊 Semantic Diff Analysis
═══════════════════════════════════════════════════════════════════

  Target:  main...feature-branch
  Files:   12

  Statistics:
  ├─ Total:     847
  ├─ Semantic:  203
  ├─ Noise:     644
  └─ Ratio:     23.96%

  Breakdown:
  ████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
  ■ Semantic  ■ Noise

  ℹ️  Moderate semantic ratio

═══════════════════════════════════════════════════════════════════
```

The JSON output:

```json
{
  "analysis_target": "main...feature-branch",
  "total_lines_changed": 847,
  "semantic_lines_changed": 203,
  "noise_lines_changed": 644,
  "semantic_to_total_ratio": "23.96%"
}
```

## Features

- 📊 **Semantic vs Noise separation** - Know what's real and what's formatting
- 🎨 **Beautiful terminal output** - Color-coded, easy to read
- 📄 **HTML reports** - Shareable, visual reports
- 🚀 **Fast caching** - Repeated analyses are instant
- ⚙️ **Auto-config** - Uses your project's `.prettierrc`
- 🔍 **File-by-file breakdown** - See which files have real changes
- 🎯 **CI/CD ready** - Threshold checks for automated workflows
- 🌐 **Multi-language** - JS, TS, Python, Go, CSS, HTML, Vue, and more

## Use Cases

### Before a code review
```bash
semantic-diff main feature-branch --detailed
```
Quickly see which files have real changes vs. just formatting.

### In CI/CD
```bash
semantic-diff main $CI_BRANCH --threshold 15 --quiet
```
Fail the build if semantic ratio is too low (mostly formatting).

### For documentation
```bash
semantic-diff main release-v2 --output report.html
```
Generate a shareable HTML report for release notes.

## How it helps

**Scenario 1: The Linting PR**
```bash
$ semantic-diff main lint-fixes
Semantic ratio: 8%
```
You know immediately: this is 92% formatting. Quick approve.

**Scenario 2: The Feature Branch**
```bash
$ semantic-diff main new-auth
Semantic ratio: 76%
```
Real changes. Time for a thorough review.

**Scenario 3: The Mixed PR**
```bash
$ semantic-diff main refactor --detailed
```
See exactly which files have logic changes and which are just reformatted.

## Supported Languages

JavaScript • TypeScript • Python • Go • Rust • Java • CSS • HTML • Vue • JSON

## Requirements

- Node.js 14+
- Git repository
- Prettier (included)

## Roadmap

- [ ] GitHub Action
- [ ] GitLab CI integration
- [ ] Custom formatters (ESLint, Black, gofmt)
- [ ] Ignore patterns config
- [ ] Diff visualization
- [ ] VS Code extension

## Contributing

Found a bug? Have an idea? PRs welcome!

## License

MIT © Melihcan Akın

---

**Built with ❤️ for better code reviews**
