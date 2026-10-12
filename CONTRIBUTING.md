# Contributing

Thanks for helping. The project is small on purpose; this page is all you need.

## Setup

Node.js 22.13 or newer and git.

```bash
git clone https://github.com/melihcanakin/Smart-Diff-Tool.git
cd Smart-Diff-Tool
npm ci
npm start -- main HEAD        # runs src/cli.ts directly, no build step
```

## Before you open a pull request

```bash
npm run typecheck
npm run lint                  # ESLint (strict, type-aware) and Prettier
npm test
npm run test:coverage         # must stay above 85% lines
```

- A bug fix comes with a test that fails without it.
- A new behaviour comes with a test and a line in `CHANGELOG.md`.
- Tests build real throw-away git repositories (`test/helpers.ts`). Prefer that over mocking git.
- The metric has one invariant: `logic + comment + moved + format === total`. Do not break it.

## Report a wrong classification

Open a bug with the smallest pair of file versions that gets it wrong. That is the most valuable report this project can get.

## Adding a language

See "Adding a language" in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
