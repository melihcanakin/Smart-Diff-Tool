#!/usr/bin/env node
/**
 * Minimal Model Context Protocol server over stdio (newline-delimited JSON-RPC 2.0).
 * Exposes one read-only tool, `semantic_diff`, so an AI agent or IDE can ask what really
 * changed on a branch instead of reading a diff that is mostly formatting.
 *
 * stdout carries protocol messages only; diagnostics go to stderr.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { analyze } from './analyze.ts';
import { SemanticDiffError } from './errors.ts';
import { toJson } from './report/json.ts';
import { renderMarkdown } from './report/markdown.ts';
import { VERSION } from './version.ts';

const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'] as const;

const TOOL = {
  name: 'semantic_diff',
  title: 'Semantic diff',
  description:
    'Compare two git refs and report how much of the change is real (logic, comments) versus noise ' +
    '(formatting, moved or reordered lines). Use it before reviewing a large diff to know what to read.',
  inputSchema: {
    type: 'object',
    properties: {
      base: { type: 'string', description: 'Base ref: branch, tag or commit, e.g. "main".' },
      feature: { type: 'string', description: 'Ref to compare against the base, e.g. "HEAD".' },
      repo: {
        type: 'string',
        description: 'Path to the git repository. Defaults to the server working directory.',
      },
    },
    required: ['base', 'feature'],
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
} as const;

interface Request {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

type Id = string | number | null;

type Outcome = { result: object } | { error: { code: number; message: string } };

const failure = (code: number, message: string): Outcome => ({ error: { code, message } });

function send(id: Id, outcome: Outcome): void {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, ...outcome })}\n`);
}

function str(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '')
    throw new Error(`"${name}" must be a non-empty string`);
  return value;
}

async function callTool(args: Record<string, unknown>): Promise<object> {
  try {
    const base = str(args['base'], 'base');
    const feature = str(args['feature'], 'feature');
    const repo =
      args['repo'] === undefined ? process.cwd() : path.resolve(str(args['repo'], 'repo'));
    if (!fs.existsSync(repo) || !fs.statSync(repo).isDirectory())
      throw new Error(`Not a directory: ${repo}`);

    const report = await analyze({ cwd: repo, base, feature });
    return {
      content: [{ type: 'text', text: renderMarkdown(report) }],
      structuredContent: toJson(report),
    };
  } catch (err) {
    const message =
      err instanceof SemanticDiffError || err instanceof Error ? err.message : String(err);
    return { isError: true, content: [{ type: 'text', text: message }] };
  }
}

/** Pure request handler: returns what to answer, or undefined for notifications we ignore. */
async function handle(request: Request): Promise<Outcome | undefined> {
  switch (request.method) {
    case 'initialize': {
      const requested = request.params?.['protocolVersion'];
      const protocolVersion = (SUPPORTED_PROTOCOLS as readonly unknown[]).includes(requested)
        ? requested
        : SUPPORTED_PROTOCOLS[0];
      return {
        result: {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'semantic-diff', title: 'semantic-diff', version: VERSION },
        },
      };
    }
    case 'ping':
      return { result: {} };
    case 'tools/list':
      return { result: { tools: [TOOL] } };
    case 'tools/call': {
      const name = request.params?.['name'];
      if (name !== TOOL.name) return failure(-32602, `Unknown tool: ${String(name)}`);
      const args = request.params?.['arguments'];
      const input =
        typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {};
      return { result: await callTool(input) };
    }
    default:
      return request.id === undefined
        ? undefined
        : failure(-32601, `Method not found: ${request.method}`);
  }
}

const pending = new Set<Promise<void>>();
const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

lines.on('line', line => {
  if (line.trim() === '') return;

  let message: unknown;
  try {
    message = JSON.parse(line);
  } catch {
    send(null, failure(-32700, 'Parse error'));
    return;
  }

  const candidate = message as Partial<Request> | null;
  if (
    typeof candidate !== 'object' ||
    candidate === null ||
    Array.isArray(candidate) ||
    typeof candidate.method !== 'string'
  ) {
    send(null, failure(-32600, 'Invalid request'));
    return;
  }

  const request = candidate as Request;
  const task = handle(request)
    .then(outcome => {
      // Requests without an id are notifications: they never get a response.
      if (outcome && request.id !== undefined) send(request.id, outcome);
    })
    .catch((err: unknown) => {
      process.stderr.write(`semantic-diff-mcp: ${String(err)}\n`);
      if (request.id !== undefined) send(request.id, failure(-32603, 'Internal error'));
    })
    .finally(() => {
      pending.delete(task);
    });
  pending.add(task);
});

// Exit once stdin is closed and every in-flight request has been answered.
lines.on('close', () => {
  void Promise.allSettled([...pending]).then(() => process.exit(0));
});
