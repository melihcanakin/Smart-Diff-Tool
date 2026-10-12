/**
 * Builds a synthetic repository (default 500 files across JS, TS, Python and Go, a mix of
 * reformatting and real edits) and times a cold run, then a warm run served from the cache.
 *
 *   npm run bench            # 500 files
 *   npm run bench -- 2000    # 2000 files
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { analyze } from '../src/analyze.ts';

const count = Number(process.argv[2] ?? 500);
if (!Number.isInteger(count) || count < 1) throw new Error('usage: npm run bench -- [file-count]');

const git = (cwd: string, ...args: string[]): void => {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
};

const bodies = {
  js: (i: number, v: number): string =>
    `export function f${i}(a,b){const t=a+b*${v}\nif(t>${i}){return t}\nreturn [a,b,t]}\n`,
  ts: (i: number, v: number): string =>
    `export const g${i}=(x:number,y:string):string=>{const n=x*${v}\nreturn y+n}\n`,
  py: (i: number, v: number): string =>
    `def h${i}(x, y):\n    total = x + y * ${v}\n    if total > ${i}:\n        return total\n    return [x, y]\n`,
  go: (i: number, v: number): string =>
    `package p\n\nfunc F${i}(a int, b int) int {\n\tt := a + b*${v}\n\treturn t\n}\n`,
};

/** Same program, different layout. */
const reformat = (kind: keyof typeof bodies, text: string): string =>
  kind === 'py' ? text.replace(/ {4}/g, '  ') : text.replace(/\n/g, '\n\n').replace(/\*/g, ' * ');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdt-bench-'));
const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'sdt-bench-cache-'));
process.env['SEMANTIC_DIFF_CACHE_DIR'] = cache;

try {
  const kinds = Object.keys(bodies) as (keyof typeof bodies)[];
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'bench@example.com');
  git(dir, 'config', 'user.name', 'bench');

  const file = (i: number): { name: string; kind: keyof typeof bodies } => {
    const kind = kinds[i % kinds.length] as keyof typeof bodies;
    return { name: `src/m${Math.floor(i / 50)}/file${i}.${kind}`, kind };
  };

  for (let i = 0; i < count; i++) {
    const { name, kind } = file(i);
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), bodies[kind](i, 1));
  }
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'base');
  git(dir, 'checkout', '-q', '-b', 'feat');

  // Every 3rd file gets a real edit, the rest are only reformatted.
  for (let i = 0; i < count; i++) {
    const { name, kind } = file(i);
    const text = i % 3 === 0 ? bodies[kind](i, 2) : bodies[kind](i, 1);
    fs.writeFileSync(path.join(dir, name), reformat(kind, text));
  }
  git(dir, 'commit', '-qam', 'feat');

  const time = async (label: string): Promise<void> => {
    const start = performance.now();
    const report = await analyze({ cwd: dir, base: 'main', feature: 'feat' });
    const seconds = ((performance.now() - start) / 1000).toFixed(2);
    console.log(
      `${label.padEnd(5)} ${seconds.padStart(6)} s   ${report.stats.analyzed} files, ` +
        `${report.stats.cacheHits} from cache, ${report.ratio.toFixed(1)}% signal, ${report.failed.length} failed`
    );
  };

  console.log(`node ${process.version} · ${os.cpus().length} CPUs · ${count} files\n`);
  await time('cold');
  await time('warm');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(cache, { recursive: true, force: true });
}
