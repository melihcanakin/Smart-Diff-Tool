import fs from 'node:fs';
import path from 'node:path';

type Schema = Record<string, unknown>;

const SCHEMA_FILE = path.resolve(import.meta.dirname, '..', 'schema', 'report.schema.json');
const root = JSON.parse(fs.readFileSync(SCHEMA_FILE, 'utf8')) as Schema;

function resolveRef(ref: string): Schema {
  return ref
    .replace(/^#\//, '')
    .split('/')
    .reduce<unknown>((node, key) => (node as Schema)[key], root) as Schema;
}

/**
 * Validates `value` against the subset of JSON Schema the report schema uses
 * (type, const, enum, required, properties, additionalProperties, items, $ref, minimum,
 * maximum, pattern). Returns a list of human-readable problems; empty means valid.
 */
export function validate(value: unknown, schema: Schema = root, at = '$'): string[] {
  if (typeof schema['$ref'] === 'string') return validate(value, resolveRef(schema['$ref']), at);

  const problems: string[] = [];
  const fail = (msg: string): number => problems.push(`${at}: ${msg}`);

  if ('const' in schema && value !== schema['const'])
    fail(`expected ${JSON.stringify(schema['const'])}`);
  if (Array.isArray(schema['enum']) && !schema['enum'].includes(value))
    fail(`not one of ${JSON.stringify(schema['enum'])}`);

  const type = schema['type'];
  if (type === 'integer' && !Number.isInteger(value))
    return [...problems, `${at}: expected integer`];
  if (type === 'number' && typeof value !== 'number')
    return [...problems, `${at}: expected number`];
  if (type === 'string' && typeof value !== 'string')
    return [...problems, `${at}: expected string`];
  if (type === 'array' && !Array.isArray(value)) return [...problems, `${at}: expected array`];
  if (type === 'object' && (typeof value !== 'object' || value === null || Array.isArray(value))) {
    return [...problems, `${at}: expected object`];
  }

  if (typeof value === 'number') {
    if (typeof schema['minimum'] === 'number' && value < schema['minimum'])
      fail(`below minimum ${schema['minimum']}`);
    if (typeof schema['maximum'] === 'number' && value > schema['maximum'])
      fail(`above maximum ${schema['maximum']}`);
  }
  if (
    typeof value === 'string' &&
    typeof schema['pattern'] === 'string' &&
    !new RegExp(schema['pattern']).test(value)
  ) {
    fail(`does not match ${schema['pattern']}`);
  }

  if (Array.isArray(value) && schema['items']) {
    value.forEach((item, i) =>
      problems.push(...validate(item, schema['items'] as Schema, `${at}[${i}]`))
    );
  }

  if (type === 'object' && typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    const properties = (schema['properties'] ?? {}) as Record<string, Schema>;
    for (const key of (schema['required'] ?? []) as string[])
      if (!(key in obj)) fail(`missing "${key}"`);
    if (schema['additionalProperties'] === false) {
      for (const key of Object.keys(obj)) if (!(key in properties)) fail(`unexpected "${key}"`);
    }
    for (const [key, sub] of Object.entries(properties)) {
      if (key in obj) problems.push(...validate(obj[key], sub, `${at}.${key}`));
    }
  }

  return problems;
}
