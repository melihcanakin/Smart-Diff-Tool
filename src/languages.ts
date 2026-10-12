import path from 'node:path';
import type { EngineName } from './types.ts';

/** Formats with Prettier, which is used as a normaliser: whatever it changes is not a real change. */
const PRETTIER_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.json',
  '.jsonc',
  '.css',
  '.scss',
  '.less',
  '.html',
  '.vue',
  '.md',
  '.yaml',
  '.yml',
  '.graphql',
]);

/** Everything else we can parse is handled by tree-sitter: extension to grammar name. */
const TREE_SITTER_GRAMMARS: Record<string, string> = {
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.hpp': 'cpp',
  '.cs': 'c_sharp',
  '.rb': 'ruby',
  '.php': 'php',
};

/** Source files we recognise but cannot analyse yet; reported as skipped, never as 100% semantic. */
const UNSUPPORTED_SOURCE_EXTENSIONS = new Set([
  '.kt',
  '.kts',
  '.swift',
  '.scala',
  '.sh',
  '.bash',
  '.lua',
  '.dart',
  '.ex',
  '.exs',
  '.zig',
  '.sql',
  '.toml',
]);

const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  'coverage',
  '.next',
  '.nuxt',
]);

/** Generated files: reviewing them as code is noise by definition. */
const GENERATED_FILES = new Set([
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lock',
  'Cargo.lock',
  'go.sum',
]);

export type FileKind =
  | { kind: 'analyzable'; engine: EngineName; grammar?: string }
  | { kind: 'unsupported' }
  | { kind: 'ignored' };

export function classifyFile(file: string, extraIgnore: RegExp[] = []): FileKind {
  const segments = file.split('/');
  const name = segments.at(-1) ?? file;

  if (segments.some(s => IGNORED_DIRECTORIES.has(s))) return { kind: 'ignored' };
  if (GENERATED_FILES.has(name) || /\.min\.(js|css)$/.test(name)) return { kind: 'ignored' };
  if (extraIgnore.some(re => re.test(file))) return { kind: 'ignored' };

  const ext = path.extname(name).toLowerCase();
  if (PRETTIER_EXTENSIONS.has(ext)) return { kind: 'analyzable', engine: 'prettier' };

  const grammar = TREE_SITTER_GRAMMARS[ext];
  if (grammar) return { kind: 'analyzable', engine: 'tree-sitter', grammar };

  if (UNSUPPORTED_SOURCE_EXTENSIONS.has(ext)) return { kind: 'unsupported' };
  return { kind: 'ignored' };
}

/** Which comment syntax a file uses, so comment-only changes can be recognised. */
export function commentPattern(file: string): RegExp {
  const ext = path.extname(file).toLowerCase();
  if (['.py', '.rb', '.yaml', '.yml'].includes(ext)) return /^\s*#/;
  if (['.md', '.json'].includes(ext)) return /^$^/; // never matches
  if (['.css', '.less'].includes(ext)) return /^\s*(\/\*|\*)/;
  if (ext === '.html' || ext === '.vue') return /^\s*(<!--|\/\/|\/\*|\*(\s|\/|$))/;
  if (ext === '.php') return /^\s*(\/\/|#|\/\*|\*(\s|\/|$))/;
  return /^\s*(\/\/|\/\*|\*(\s|\/|$))/;
}
