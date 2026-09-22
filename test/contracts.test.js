import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseProgram, parseRegistry } from '../src/load.js';
import { validate, assertValid } from '../src/schema-check.js';
import { loadFixture } from './helpers.js';

const read = (p) => readFile(new URL(p, import.meta.url), 'utf8');

test('program.json 符合 program.schema.json 契约', async () => {
  const [schemaText, dataText] = await Promise.all([read('../contracts/program.schema.json'), read('../fixtures/program.json')]);
  assertValid(JSON.parse(schemaText), parseProgram(dataText));
});

test('registry.json 符合 registry.schema.json 契约', async () => {
  const [schemaText, dataText] = await Promise.all([read('../contracts/registry.schema.json'), read('../fixtures/registry.json')]);
  assertValid(JSON.parse(schemaText), parseRegistry(dataText));
});

test('契约校验器能拒绝缺字段的资料', () => {
  const schema = {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', pattern: '^v-' } },
    additionalProperties: false
  };
  assert.equal(validate(schema, { id: 'bad' }).length > 0, true);
  assert.deepEqual(validate(schema, { id: 'v-1' }), []);
  assert.equal(validate(schema, { id: 'v-1', extra: 1 }).length > 0, true);
});

test('参照完整性校验拒绝孤儿引用', async () => {
  const idx = await loadFixture();
  const registry = JSON.parse(await read('../fixtures/registry.json', 'utf8'));
  registry.versions[0].asset_ids.push('as-99-xx');
  const { validateRegistry } = await import('../src/load.js');
  assert.throws(() => validateRegistry(registry, idx.program), /as-99-xx/);
});
