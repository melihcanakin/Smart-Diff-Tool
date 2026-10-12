import { createRequire } from 'node:module';
import { Language, Parser, type Node } from 'web-tree-sitter';
import type { Engine } from './types.ts';

const require = createRequire(import.meta.url);

/**
 * Nodes whose named children are statements/members that each deserve their own line. The names
 * are shared by most grammars (`block`, `*_body`, `source_file`, ...) so one rule covers them all.
 */
const CONTAINER =
  /^(?:module|program|source_file|translation_unit|compilation_unit|block|compound_statement|declaration_list|body_statement|then|else|ensure|rescue|do_block)$|_body$|_block$|_declaration_list$|_variant_list$/;

let initialised: Promise<void> | undefined;
const languages = new Map<string, Promise<Language>>();
const parsers = new Map<string, Parser>();

function loadLanguage(grammar: string): Promise<Language> {
  initialised ??= Parser.init();
  let language = languages.get(grammar);
  if (!language) {
    language = initialised.then(() =>
      Language.load(require.resolve(`tree-sitter-wasms/out/tree-sitter-${grammar}.wasm`))
    );
    languages.set(grammar, language);
  }
  return language;
}

function parserFor(grammar: string, language: Language): Parser {
  let parser = parsers.get(grammar);
  if (!parser) {
    parser = new Parser();
    parser.setLanguage(language);
    parsers.set(grammar, parser);
  }
  return parser;
}

/** Tuples give a trailing comma meaning: `(1,)` is a tuple, `(1)` is not. */
const TUPLE = /(?:^|_)tuple(?:_|$)/;
const CLOSERS = new Set([')', ']', '}']);

/**
 * Tokens that differ in text but not in meaning, which formatters rewrite freely:
 * - a trailing comma before a closing bracket (except in tuples, where it matters);
 * - Python's choice between ' and " (black normalises it), including triple quotes.
 * Other languages are not touched: in Go, Rust or C a single quote is a character literal.
 */
function canonicalToken(node: Node, grammar: string): string | undefined {
  if (
    node.type === ',' &&
    CLOSERS.has(node.nextSibling?.type ?? '') &&
    !TUPLE.test(node.parent?.type ?? '')
  ) {
    return undefined;
  }
  if (grammar === 'python' && (node.type === 'string_start' || node.type === 'string_end')) {
    return node.text.replace(/'/g, '"');
  }
  return node.text;
}

function oneLine(text: string): string {
  return text.replace(/\r?\n/g, '\\n').trim();
}

/**
 * Prints a syntax tree as canonical text: one statement per line, indented by block depth, with
 * tokens separated by single spaces and comments on their own lines. Layout in the source
 * (indentation width, wrapping, spacing) disappears; structure (nesting, order, tokens) stays,
 * which is what makes Python indentation changes visible while reformatting is not.
 */
function canonicalize(root: Node, grammar: string): string {
  const lines: string[] = [];
  let tokens: string[] = [];
  let lineDepth = 0;

  const endLine = (): void => {
    if (tokens.length > 0) lines.push(`${'  '.repeat(lineDepth)}${tokens.join(' ')}`);
    tokens = [];
  };

  const push = (text: string, depth: number): void => {
    if (tokens.length === 0) lineDepth = depth;
    tokens.push(text);
  };

  const visit = (node: Node, depth: number): void => {
    if (node.type.includes('comment')) {
      endLine();
      for (const line of node.text.split(/\r?\n/))
        lines.push(`${'  '.repeat(depth)}${line.trim()}`);
      return;
    }

    if (node.childCount === 0) {
      // Layout tokens (Go emits a leaf for every newline) carry no meaning of their own.
      if (!node.isNamed && node.text.trim() === '') return;
      const text = oneLine(canonicalToken(node, grammar) ?? '');
      if (text === '') return;
      if (text === '}') endLine();
      push(text, depth);
      if (text === '{' || text === '}' || text === ';') endLine();
      return;
    }

    const container = CONTAINER.test(node.type);
    const childDepth = container && node.parent ? depth + 1 : depth;
    if (container && node.parent) endLine();

    for (const child of node.children) {
      if (!child) continue;
      visit(child, childDepth);
      if (container && child.isNamed) endLine();
    }

    if (container) endLine();
  };

  visit(root, 0);
  endLine();
  return `${lines.join('\n')}\n`;
}

export const treeSitterEngine: Engine = {
  name: 'tree-sitter',

  async prepare(_file, _cwd, grammar) {
    if (!grammar) throw new Error('tree-sitter engine needs a grammar');
    const language = await loadLanguage(grammar);
    const parser = parserFor(grammar, language);
    const version = (require('tree-sitter-wasms/package.json') as { version: string }).version;

    return {
      fingerprint: `tree-sitter-wasms@${version}:${grammar}:canon2`,
      normalize: code => {
        const tree = parser.parse(code);
        if (!tree) throw new Error('syntax error: parser returned no tree');
        try {
          if (tree.rootNode.hasError) throw new Error('syntax error');
          return canonicalize(tree.rootNode, grammar);
        } finally {
          tree.delete();
        }
      },
    };
  },
};
