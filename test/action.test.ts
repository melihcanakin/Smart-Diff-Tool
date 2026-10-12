import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { cleanup, commitOnBranch, createRepo, tempCacheDir } from './helpers.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'action.sh');
const hasBash =
  spawnSync('bash', ['--version']).status === 0 && spawnSync('jq', ['--version']).status === 0;
const skip = (process.platform === 'win32' || !hasBash) && 'needs bash and jq';

/** Runs scripts/action.sh against a repo with a stub `gh` that records every call. */
function runAction(
  env: Record<string, string>,
  ghExisting = ''
): { code: number | null; dir: string; gh: string[]; out: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdt-action-'));
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  const log = path.join(dir, 'gh.log');
  fs.writeFileSync(
    path.join(bin, 'gh'),
    `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> "${log}"\n` +
      (ghExisting ? `case "$*" in *--paginate*) echo ${ghExisting};; esac\n` : ''),
    { mode: 0o755 }
  );
  // The action runs the built CLI; point it at a stub that delegates to the TypeScript sources.
  const dist = path.join(dir, 'action', 'dist');
  fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(
    path.join(dist, 'cli.js'),
    `import(${JSON.stringify(path.join(ROOT, 'src', 'cli.ts'))});\n`
  );

  const result = spawnSync('bash', [SCRIPT], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env['PATH'] ?? ''}`,
      ACTION_PATH: path.join(dir, 'action'),
      RUNNER_TEMP: dir,
      GITHUB_STEP_SUMMARY: path.join(dir, 'summary.md'),
      GITHUB_OUTPUT: path.join(dir, 'output.txt'),
      GITHUB_REPOSITORY: 'owner/repo',
      SEMANTIC_DIFF_CACHE_DIR: tempCacheDir(),
      NO_COLOR: '1',
      ...env,
    },
  });
  const gh = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean) : [];
  return { code: result.status, dir, gh, out: result.stdout + result.stderr };
}

function repo(): string {
  const dir = createRepo({ 'a.js': 'function a(){return 1}\n' });
  commitOnBranch(dir, 'feat', { 'a.js': 'function a() {\n  return 1;\n}\n' });
  return dir;
}

test(
  'action: writes summary and outputs, creates the PR comment, fails below the threshold',
  { skip },
  () => {
    const dir = repo();
    const run = runAction({
      SD_BASE: 'main',
      SD_FEATURE: 'feat',
      SD_THRESHOLD: '50',
      SD_COMMENT: 'true',
      PR_NUMBER: '7',
      GIT_DIR: path.join(dir, '.git'),
    });
    try {
      assert.equal(run.code, 1, run.out);
      assert.match(
        fs.readFileSync(path.join(run.dir, 'summary.md'), 'utf8'),
        /<!-- semantic-diff -->/
      );
      const output = fs.readFileSync(path.join(run.dir, 'output.txt'), 'utf8');
      assert.match(output, /^ratio=0$/m);
      assert.match(output, /^semantic=0$/m);
      assert.ok(
        run.gh.some(
          l => l.includes('--method POST') && l.includes('repos/owner/repo/issues/7/comments')
        ),
        run.gh.join('\n')
      );
    } finally {
      cleanup(dir, run.dir);
    }
  }
);

test('action: updates the existing comment instead of adding another', { skip }, () => {
  const dir = repo();
  const run = runAction(
    {
      SD_BASE: 'main',
      SD_FEATURE: 'feat',
      SD_COMMENT: 'true',
      PR_NUMBER: '7',
      GIT_DIR: path.join(dir, '.git'),
    },
    '4242'
  );
  try {
    assert.equal(run.code, 0, run.out);
    assert.ok(
      run.gh.some(l => l.includes('--method PATCH') && l.includes('issues/comments/4242')),
      run.gh.join('\n')
    );
    assert.ok(!run.gh.some(l => l.includes('--method POST')));
  } finally {
    cleanup(dir, run.dir);
  }
});

test('action: comment=false never calls gh; a hostile ref is not executed', { skip }, () => {
  const dir = repo();
  const marker = path.join(dir, 'PWNED');
  const run = runAction({
    SD_BASE: `main; touch ${marker}`,
    SD_FEATURE: 'feat',
    SD_COMMENT: 'false',
    GIT_DIR: path.join(dir, '.git'),
  });
  try {
    assert.equal(run.code, 3, run.out);
    assert.deepEqual(run.gh, []);
    assert.equal(fs.existsSync(marker), false);
  } finally {
    cleanup(dir, run.dir);
  }
});
