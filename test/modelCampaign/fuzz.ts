import { FuzzedDataProvider } from '@jazzer.js/core';
import { checkAllocation, checkRestoration, MAX_PEOPLE, MAX_RECIPES } from './properties';

export function fuzz(input: Buffer): void {
  if (process.env.MODEL_TEST_SELF_TEST === '1') throw new Error('Controlled fuzz finding');
  const data = new FuzzedDataProvider(input);
  if (process.env.MODEL_TEST_FUZZ_TARGET === 'allocation') {
    const people = data.consumeIntegralInRange(0, MAX_PEOPLE);
    const recipes = data.consumeIntegralInRange(0, MAX_RECIPES);
    checkAllocation({
      capacities: Array.from({ length: recipes }, () => data.consumeIntegralInRange(0, MAX_PEOPLE)),
      matrix: Array.from({ length: people }, () => Array.from({ length: recipes }, () => data.consumeBoolean())),
    });
    return;
  }
  let value: unknown;
  try {
    value = JSON.parse(input.toString('utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) return;
    throw error;
  }
  checkRestoration(value);
}
