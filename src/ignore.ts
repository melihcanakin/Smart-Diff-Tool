import { UsageError } from './errors.ts';

/**
 * Turns a gitignore-style glob into a RegExp over a repository-relative path.
 * `*` and `?` stay inside one path segment, `**` crosses segments. A pattern without a
 * slash matches at any depth, like `.gitignore`.
 */
export function globToRegExp(pattern: string): RegExp {
  if (pattern.trim() === '') throw new UsageError('Empty ignore pattern');

  let source = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i] as string;
    if (c === '*' && pattern[i + 1] === '*') {
      const slash = pattern[i + 2] === '/';
      source += slash ? '(?:.*/)?' : '.*';
      i += slash ? 2 : 1;
    } else if (c === '*') {
      source += '[^/]*';
    } else if (c === '?') {
      source += '[^/]';
    } else {
      source += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }

  const anchored = pattern.includes('/') ? '^' : '(?:^|/)';
  return new RegExp(`${anchored}${source}(?:/.*)?$`);
}
