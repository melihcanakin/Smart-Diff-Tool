# Smart-Diff-Tool

> Separate signal from noise in your code reviews

[![npm](https://img.shields.io/badge/npm-v1.0.0-blue)](https://www.npmjs.com/package/smart-diff-tool)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D14-brightgreen)](https://nodejs.org)

---

## Why?

Ever reviewed a PR with 1,000 changed lines, only to find that 950 were just formatting?

You're not alone. When a developer runs a linter or formatter on their branch, the diff explodes with whitespace changes, moved imports, and trailing commas. The actual logic changes—the ones that matter—get buried in the noise.

**Smart-Diff-Tool** solves this by analyzing git diffs and separating them into two categories:

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
npm install -g smart-diff-tool
