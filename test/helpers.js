import { readFile } from 'node:fs/promises';
import { parseProgram, parseRegistry, validateProgram, validateRegistry, buildIndexes } from '../src/load.js';

export async function loadFixture() {
  const [p, r] = await Promise.all([
    readFile(new URL('../fixtures/program.json', import.meta.url), 'utf8'),
    readFile(new URL('../fixtures/registry.json', import.meta.url), 'utf8')
  ]);
  const program = validateProgram(parseProgram(p));
  const registry = validateRegistry(parseRegistry(r), program);
  return buildIndexes(program, registry);
}
