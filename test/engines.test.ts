import assert from 'node:assert/strict';
import test from 'node:test';
import { prettierEngine } from '../src/engines/prettier.ts';
import { treeSitterEngine } from '../src/engines/tree-sitter.ts';

interface Case {
  grammar: string;
  file: string;
  base: string;
  /** Same program, different layout. */
  reformatted: string;
  /** Different program. */
  changed: string;
}

const CASES: Case[] = [
  {
    grammar: 'python',
    file: 'a.py',
    base: 'def f(x):\n    if x:\n        return 1\n    return 2\n',
    reformatted: 'def f( x ):\n  if x :\n    return 1\n  return 2\n',
    changed: 'def f(x):\n    if x:\n        return 1\n    return 3\n',
  },
  {
    grammar: 'go',
    file: 'a.go',
    base: 'package a\nfunc F(x int) int {\n\treturn x + 1\n}\n',
    reformatted: 'package a\n\nfunc F(x int) int {\n        return x+1\n}\n',
    changed: 'package a\nfunc F(x int) int {\n\treturn x + 2\n}\n',
  },
  {
    grammar: 'rust',
    file: 'a.rs',
    base: 'fn f(x: i32) -> i32 {\n    x + 1\n}\n',
    reformatted: 'fn f(x: i32)\n  -> i32 { x+1 }\n',
    changed: 'fn f(x: i32) -> i32 {\n    x + 2\n}\n',
  },
  {
    grammar: 'java',
    file: 'A.java',
    base: 'class A {\n    int f(int x) {\n        return x + 1;\n    }\n}\n',
    reformatted: 'class A { int f(int x)\n{ return x+1; } }\n',
    changed: 'class A {\n    int f(int x) {\n        return x + 2;\n    }\n}\n',
  },
  {
    grammar: 'c',
    file: 'a.c',
    base: 'int f(int x) {\n    return x + 1;\n}\n',
    reformatted: 'int f(int x)\n{\n\treturn x+1;\n}\n',
    changed: 'int f(int x) {\n    return x + 2;\n}\n',
  },
  {
    grammar: 'cpp',
    file: 'a.cpp',
    base: 'int f(int x) {\n    return x + 1;\n}\n',
    reformatted: 'int f(int x)\n{\n\treturn x+1;\n}\n',
    changed: 'int f(int x) {\n    return x + 2;\n}\n',
  },
  {
    grammar: 'c_sharp',
    file: 'A.cs',
    base: 'class A {\n    int F(int x) {\n        return x + 1;\n    }\n}\n',
    reformatted: 'class A\n{\n    int F(int x) { return x+1; }\n}\n',
    changed: 'class A {\n    int F(int x) {\n        return x + 2;\n    }\n}\n',
  },
  {
    grammar: 'ruby',
    file: 'a.rb',
    base: 'def f(x)\n  x + 1\nend\n',
    reformatted: 'def f( x )\n    x+1\nend\n',
    changed: 'def f(x)\n  x + 2\nend\n',
  },
  {
    grammar: 'php',
    file: 'a.php',
    base: '<?php\nfunction f($x) {\n    return $x + 1;\n}\n',
    reformatted: '<?php\nfunction f($x)\n{\n  return $x+1;\n}\n',
    changed: '<?php\nfunction f($x) {\n    return $x + 2;\n}\n',
  },
];

for (const c of CASES) {
  test(`tree-sitter/${c.grammar}: layout is ignored, logic is not`, async () => {
    const engine = await treeSitterEngine.prepare(c.file, '.', c.grammar);
    const base = await engine.normalize(c.base);
    assert.equal(
      await engine.normalize(c.reformatted),
      base,
      'reformatting must not change the canonical form'
    );
    assert.notEqual(
      await engine.normalize(c.changed),
      base,
      'a logic change must change the canonical form'
    );
  });
}

test('tree-sitter/python: moving a statement into a block is a change', async () => {
  const engine = await treeSitterEngine.prepare('a.py', '.', 'python');
  const outside = await engine.normalize('if x:\n    a()\nb()\n');
  const inside = await engine.normalize('if x:\n    a()\n    b()\n');
  assert.notEqual(outside, inside);
});

test('tree-sitter: comments keep their own lines', async () => {
  const engine = await treeSitterEngine.prepare('a.py', '.', 'python');
  const text = await engine.normalize('x = 1  # note\n');
  assert.match(text, /^# note$/m);
});

test('tree-sitter: syntax errors are reported, not silently analysed', async () => {
  const engine = await treeSitterEngine.prepare('a.py', '.', 'python');
  await assert.rejects(async () => engine.normalize('def (:\n'), /syntax error/);
});

test('tree-sitter/python: quote style and trailing commas are formatting', async () => {
  const engine = await treeSitterEngine.prepare('a.py', '.', 'python');
  const plain = await engine.normalize("d = {'a': 1, 'b': [1, 2]}\nf(x, y)\n");
  const formatted = await engine.normalize(
    'd = {\n    "a": 1,\n    "b": [\n        1,\n        2,\n    ],\n}\nf(\n    x,\n    y,\n)\n'
  );
  assert.equal(formatted, plain);
  assert.equal(
    await engine.normalize("s = '''doc'''\n"),
    await engine.normalize('s = """doc"""\n')
  );
});

test('tree-sitter/python: a different string is still a change; (1,) is not (1)', async () => {
  const engine = await treeSitterEngine.prepare('a.py', '.', 'python');
  assert.notEqual(await engine.normalize("s = 'a'\n"), await engine.normalize("s = 'b'\n"));
  assert.notEqual(await engine.normalize('t = (1,)\n'), await engine.normalize('t = (1)\n'));
});

test('tree-sitter: trailing commas do not matter in Go and Rust, quotes are left alone', async () => {
  const go = await treeSitterEngine.prepare('a.go', '.', 'go');
  assert.equal(
    await go.normalize('package a\nvar x = f(1, 2)\n'),
    await go.normalize('package a\nvar x = f(\n\t1,\n\t2,\n)\n')
  );
  const rust = await treeSitterEngine.prepare('a.rs', '.', 'rust');
  assert.equal(
    await rust.normalize('fn f() { g(1, 2); }\n'),
    await rust.normalize('fn f() {\n    g(\n        1,\n        2,\n    );\n}\n')
  );
  // In Go a single quote is a rune literal, not a string: 'a' and 'b' stay different.
  assert.notEqual(
    await go.normalize("package a\nvar c = 'a'\n"),
    await go.normalize("package a\nvar c = 'b'\n")
  );
});

interface PrettierCase {
  file: string;
  base: string;
  reformatted: string;
  changed: string;
}

// Every extension the README promises goes through Prettier; each must ignore layout and see logic.
const PRETTIER_CASES: PrettierCase[] = [
  {
    file: 'a.js',
    base: 'const a = {b:1}\n',
    reformatted: 'const a = {\n  b: 1,\n};\n',
    changed: 'const a = {b:2}\n',
  },
  {
    file: 'a.jsx',
    base: 'const a = <div id="x">hi</div>\n',
    reformatted: "const a = <div id='x'>hi</div>;\n",
    changed: 'const a = <div id="y">hi</div>\n',
  },
  {
    file: 'a.mjs',
    base: 'export const a = [1,2]\n',
    reformatted: 'export const a = [1, 2];\n',
    changed: 'export const a = [1,3]\n',
  },
  {
    file: 'a.cjs',
    base: 'module.exports = {a:1}\n',
    reformatted: 'module.exports = { a: 1 };\n',
    changed: 'module.exports = {a:2}\n',
  },
  {
    file: 'a.ts',
    base: 'let a:number=1\n',
    reformatted: 'let a: number = 1;\n',
    changed: 'let a:number=2\n',
  },
  {
    file: 'a.tsx',
    base: 'const a = (p:{x:number}) => <b>{p.x}</b>\n',
    reformatted: 'const a = (p: { x: number }) => <b>{p.x}</b>;\n',
    changed: 'const a = (p:{x:number}) => <i>{p.x}</i>\n',
  },
  {
    file: 'a.mts',
    base: 'export const a:string="x"\n',
    reformatted: "export const a: string = 'x';\n",
    changed: 'export const a:string="y"\n',
  },
  {
    file: 'a.json',
    base: '{"a":1,"b":[1,2]}\n',
    reformatted: '{\n  "a": 1,\n  "b": [1, 2]\n}\n',
    changed: '{"a":2,"b":[1,2]}\n',
  },
  {
    file: 'a.css',
    base: 'a{color:red}\n',
    reformatted: 'a {\n  color: red;\n}\n',
    changed: 'a{color:blue}\n',
  },
  {
    file: 'a.scss',
    base: '.a{.b{color:red}}\n',
    reformatted: '.a {\n  .b {\n    color: red;\n  }\n}\n',
    changed: '.a{.b{color:blue}}\n',
  },
  {
    file: 'a.less',
    base: '@c:red;a{color:@c}\n',
    reformatted: '@c: red;\na {\n  color: @c;\n}\n',
    changed: '@c:blue;a{color:@c}\n',
  },
  {
    file: 'a.html',
    base: "<div   id='x'><p>hi</p></div>\n",
    reformatted: '<div id="x"><p>hi</p></div>\n',
    changed: "<div   id='x'><p>bye</p></div>\n",
  },
  {
    file: 'a.vue',
    base: '<script setup>\nconst a=1\n</script>\n',
    reformatted: '<script setup>\nconst a = 1;\n</script>\n',
    changed: '<script setup>\nconst a=2\n</script>\n',
  },
  {
    file: 'a.md',
    base: '# Title\n\n*  one\n*  two\n',
    reformatted: '# Title\n\n- one\n- two\n',
    changed: '# Title\n\n*  one\n*  three\n',
  },
  {
    file: 'a.yaml',
    base: 'a:   1\nb: [1,2]\n',
    reformatted: 'a: 1\nb: [1, 2]\n',
    changed: 'a:   2\nb: [1,2]\n',
  },
  { file: 'a.yml', base: 'a:   1\n', reformatted: 'a: 1\n', changed: 'a:   2\n' },
  {
    file: 'a.graphql',
    base: 'type A{a:Int}\n',
    reformatted: 'type A {\n  a: Int\n}\n',
    changed: 'type A{a:String}\n',
  },
];

for (const c of PRETTIER_CASES) {
  test(`prettier/${c.file}: layout is ignored, content is not`, async () => {
    const engine = await prettierEngine.prepare(c.file, '/tmp/sdt-nonexistent');
    const base = await engine.normalize(c.base);
    assert.equal(await engine.normalize(c.reformatted), base);
    assert.notEqual(await engine.normalize(c.changed), base);
  });
}
