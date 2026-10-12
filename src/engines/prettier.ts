import path from 'node:path';
import * as prettier from 'prettier';
import type { Engine } from './types.ts';

/**
 * Prettier is used as a normaliser, not as a style checker: formatting both versions with the
 * same options removes every formatting-only difference, and what is left is a real change.
 * The project's own Prettier config is honoured (including .editorconfig), because normalising
 * with different options than the author used would invent differences.
 *
 * One option is overridden because by default Prettier *preserves* the author's layout of object
 * literals, which would make a pure reformatting look like a change:
 * `objectWrap: 'collapse'` makes `{ a: 1 }` and the same object written over several lines equal.
 *
 * Known limit: in HTML and Vue, Prettier keeps the author's line breaks between tags, so adding
 * or removing them is reported as a change. Whitespace sensitivity is left at its default on
 * purpose; ignoring it would hide real rendering changes between inline elements.
 *
 * `.prettierignore` is deliberately not consulted: a file the project does not format still has
 * to be normalised to be compared fairly.
 */
const NORMALIZING_OPTIONS = { objectWrap: 'collapse' } as const;

export const prettierEngine: Engine = {
  name: 'prettier',

  async prepare(file, cwd) {
    const absolute = path.resolve(cwd, file);
    const resolved = (await prettier.resolveConfig(absolute, { editorconfig: true })) ?? {};
    const options = { ...resolved, ...NORMALIZING_OPTIONS, filepath: absolute };
    return {
      fingerprint: `prettier@${prettier.version}:norm1:${JSON.stringify(resolved, Object.keys(resolved).sort())}`,
      normalize: code => prettier.format(code, options),
    };
  },
};
