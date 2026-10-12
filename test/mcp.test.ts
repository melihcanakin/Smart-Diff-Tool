import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanup, commitOnBranch, createRepo, runMcp } from './helpers.ts';
import { validate } from './schema.ts';

const initialize = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'test', version: '0' },
  },
};

interface ToolResult {
  isError?: boolean;
  content: { type: string; text: string }[];
  structuredContent?: unknown;
}
interface Response {
  id: number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

async function exchange(
  cwd: string,
  messages: (object | string)[]
): Promise<Map<number | null, Response>> {
  const responses = (await runMcp(cwd, messages)) as unknown as Response[];
  return new Map(responses.map(r => [r.id, r]));
}

const call = (id: number, args: Record<string, unknown>, name = 'semantic_diff'): object => ({
  jsonrpc: '2.0',
  id,
  method: 'tools/call',
  params: { name, arguments: args },
});

const text = (r: Response | undefined): string => (r?.result as ToolResult).content[0]?.text ?? '';

test('MCP: handshake, tool listing and a real tool call', async t => {
  const dir = createRepo({ 'a.js': 'function a(){return 1}\n' });
  commitOnBranch(dir, 'feat', { 'a.js': 'function a() {\n  return 2;\n}\n' });
  t.after(() => {
    cleanup(dir);
  });

  const byId = await exchange(dir, [
    initialize,
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'ping' },
    { jsonrpc: '2.0', id: 3, method: 'tools/list' },
    call(4, { base: 'main', feature: 'feat' }),
  ]);

  assert.equal(byId.size, 4, 'the notification must not get a response');

  const init = byId.get(1)?.result as { protocolVersion: string; serverInfo: { name: string } };
  assert.equal(init.protocolVersion, '2025-06-18');
  assert.equal(init.serverInfo.name, 'semantic-diff');
  assert.deepEqual(byId.get(2)?.result, {});

  const { tools } = byId.get(3)?.result as {
    tools: { name: string; inputSchema: { required: string[] } }[];
  };
  assert.equal(tools[0]?.name, 'semantic_diff');
  assert.deepEqual(tools[0]?.inputSchema.required, ['base', 'feature']);

  const result = byId.get(4)?.result as ToolResult;
  assert.notEqual(result.isError, true);
  assert.deepEqual(validate(result.structuredContent), []);
  assert.match(text(byId.get(4)), /semantic-diff/);
});

test('MCP: tool errors are reported in-band, protocol errors as JSON-RPC errors', async t => {
  const dir = createRepo({ 'a.js': 'a();\n' });
  t.after(() => {
    cleanup(dir);
  });

  const byId = await exchange(dir, [
    initialize,
    call(2, { base: 'main', feature: 'nope' }),
    call(3, { base: 'main' }),
    call(4, {}, 'rm_rf'),
    { jsonrpc: '2.0', id: 5, method: 'does/not/exist' },
    call(6, { base: 'main', feature: 'main', repo: '/definitely/not/here' }),
  ]);

  assert.equal((byId.get(2)?.result as ToolResult).isError, true);
  assert.match(text(byId.get(2)), /Ref not found: nope/);
  assert.equal((byId.get(3)?.result as ToolResult).isError, true);
  assert.match(text(byId.get(3)), /"feature" must be a non-empty string/);
  assert.equal(byId.get(4)?.error?.code, -32602);
  assert.equal(byId.get(5)?.error?.code, -32601);
  assert.equal((byId.get(6)?.result as ToolResult).isError, true);
});

test('MCP: an unsupported protocol version falls back to the newest supported one', async t => {
  const dir = createRepo({ 'a.js': 'a();\n' });
  t.after(() => {
    cleanup(dir);
  });
  const byId = await exchange(dir, [
    { ...initialize, params: { ...initialize.params, protocolVersion: '1999-01-01' } },
  ]);
  assert.equal((byId.get(1)?.result as { protocolVersion: string }).protocolVersion, '2025-06-18');
});

test('MCP: malformed input gets a JSON-RPC error and never corrupts stdout', async t => {
  const dir = createRepo({ 'a.js': 'a();\n' });
  t.after(() => {
    cleanup(dir);
  });
  const byId = await exchange(dir, [
    '{not json',
    '[1,2]',
    '{"jsonrpc":"2.0","id":9}',
    { jsonrpc: '2.0', id: 1, method: 'ping' },
  ]);

  // Parse error and invalid requests are answered with id null; the server keeps working.
  assert.equal(
    byId.get(null)?.error?.code === -32700 || byId.get(null)?.error?.code === -32600,
    true
  );
  assert.deepEqual(byId.get(1)?.result, {});
});
