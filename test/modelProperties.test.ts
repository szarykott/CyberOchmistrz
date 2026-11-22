import fc from 'fast-check';
import './cruiseTestHarness';
import { properties } from './modelCampaign/properties';

describe('model properties', () => {
  for (const [name, property] of Object.entries(properties)) {
    it(`should preserve ${name} invariants`, () => {
      // Fixed seed and bounded runs keep mutation testing deterministic.
      fc.assert(property as fc.IProperty<unknown[]>, { seed: 20261122, numRuns: 40 });
    });
  }
});
