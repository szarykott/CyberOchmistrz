import { renameSync, writeFileSync } from 'node:fs';
import fc from 'fast-check';
import { properties } from './properties';

const [propertyName, output, seedText, path] = process.argv.slice(2);
const property = propertyName === 'self-test'
  ? fc.property(fc.nat(), value => value < 0)
  : properties[propertyName as keyof typeof properties];
if (!property) throw new Error(`Unknown property: ${propertyName}`);
const details = fc.check(property as fc.IProperty<unknown[]>, {
  seed: Number(seedText), numRuns: 100, ...(path === undefined ? {} : { path, endOnFailure: true }),
});
writeFileSync(`${output}.tmp`, JSON.stringify({
  property: propertyName,
  failed: details.failed,
  seed: details.seed,
  path: details.counterexamplePath,
  runs: details.numRuns,
  shrinks: details.numShrinks,
  counterexample: details.counterexample === null ? null : fc.stringify(details.counterexample),
  error: details.errorInstance instanceof Error ? details.errorInstance.stack : String(details.errorInstance ?? ''),
}, null, 2));
renameSync(`${output}.tmp`, output);
