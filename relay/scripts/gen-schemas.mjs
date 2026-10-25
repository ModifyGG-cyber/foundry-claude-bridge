// Generates src/generated/schemas.json: one self-contained JSON Schema per
// module command, from the module's CommandParamsMap TypeScript types.
// Run after updating module/: npm run gen
import { writeFileSync } from 'node:fs';
import { createGenerator } from 'ts-json-schema-generator';

const moduleDir = new URL('../../module/', import.meta.url).pathname;
const schema = createGenerator({
  path: `${moduleDir}src/commands/types.ts`,
  tsconfig: `${moduleDir}tsconfig.json`,
  type: 'CommandParamsMap',
  skipTypeCheck: true,
}).createSchema('CommandParamsMap');

const defs = schema.definitions;
const lookup = ref => defs[decodeURIComponent(ref.replace('#/definitions/', ''))];

function inline(node, seen = new Set()) {
  if (Array.isArray(node)) return node.map(n => inline(n, seen));
  if (!node || typeof node !== 'object') return node;
  if (node.$ref) {
    if (seen.has(node.$ref)) return {}; // recursive type: leave it open
    return inline(lookup(node.$ref), new Set(seen).add(node.$ref));
  }
  return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, inline(v, seen)]));
}

const out = {};
for (const [command, ref] of Object.entries(defs.CommandParamsMap.properties)) {
  const s = inline(ref);
  out[command] = s.type === 'object' ? { ...s, properties: s.properties ?? {} } : { type: 'object', properties: {} };
}
writeFileSync(new URL('../src/generated/schemas.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
console.log(`wrote ${Object.keys(out).length} command schemas`);
