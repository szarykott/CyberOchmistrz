import { restoreCruise } from '../../src/data/cruiseRepository';
import { supplyCatalog } from '../../src/data/supplyRepository';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { Cruise, CruiseDayRecipe } from '../../src/model/cruise';
import { Crew, CrewMember, Diet } from '../../src/model/crew';
import { Recipie, MealType, RecipieData } from '../../src/model/recipe';
import { canEat, getMealCoverage } from '../../src/model/cruise/mealPlan/cruiseDietCoverage';
import { CrewRecipeAllocationChecker } from '../../src/model/cruise/mealPlan/maxFlow';

// Keep exhaustive allocation cheap: at most six people and four recipes.
export const MAX_PEOPLE = 6;
export const MAX_RECIPES = 4;
const slots = Object.values(MealType);
const diets: Diet[] = ['omnivore', 'vegetarian', 'vegan'];
const ids = [...supplyCatalog.all.filter(item => item.isIngredient).slice(0, 12).map(item => item.id), 'unknown'];
const json = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const amount = fc.integer({ min: 0, max: 1000 });
const ingredient = fc.record({ id: fc.constantFrom(...ids), amount });
export const recipeArbitrary: fc.Arbitrary<RecipieData> = fc.record({
  id: fc.string({ maxLength: 16 }), name: fc.string({ maxLength: 32 }),
  description: fc.string({ maxLength: 32 }),
  ingredients: fc.array(ingredient, { minLength: 1, maxLength: 5 }),
  mealType: fc.array(fc.constantFrom(...slots), { maxLength: 4 }),
  difficulty: fc.integer({ min: 1, max: 5 }),
  instructions: fc.array(fc.string({ maxLength: 32 }), { maxLength: 3 }),
});
const crewArbitrary = fc.array(fc.record({
  name: fc.string({ maxLength: 16 }), diet: fc.constantFrom(...diets),
  excludedSupplies: fc.uniqueArray(fc.constantFrom(...ids), { maxLength: 4 }),
}), { maxLength: MAX_PEOPLE }).map(crew => crew.map((member, i) => ({ ...member, id: `member-${i}` })));
const supplyArbitrary = fc.record({
  id: fc.constantFrom(...ids), amount, isPerPerson: fc.boolean(), isPerDay: fc.boolean(),
});
export const cruiseArbitrary = fc.record({
  crew: crewArbitrary,
  days: fc.array(fc.array(fc.record({
    recipe: recipeArbitrary.map(Recipie.fromData),
    crewCount: fc.integer({ min: 0, max: 12 }), mealSlot: fc.constantFrom(...slots),
  }), { maxLength: MAX_RECIPES }), { maxLength: 5 }),
  supplies: fc.array(supplyArbitrary, { maxLength: 8 }),
}).map(({ crew, days, supplies }) => Cruise.createNew('Generated cruise', days.length, crew,
  days.map((recipes, i) => ({ dayNumber: i + 1, recipes: recipes.map(entry => ({
    ...entry, originalRecipeId: entry.recipe.id,
  })) })), supplies));

export function checkRestoration(input: unknown): void {
  const before = JSON.stringify(input);
  let cruise: Cruise;
  try {
    cruise = restoreCruise(input);
  } catch (error) {
    // Only this boundary is allowed to reject malformed serialized input.
    if (error instanceof Error && error.message === 'Nieprawidłowe dane rejsu') {
      assert.equal(JSON.stringify(input), before);
      return;
    }
    throw error;
  }
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(json(restoreCruise(json(cruise))), json(cruise));
  assert.ok(Object.isFrozen(cruise));
  assert.ok(Object.isFrozen(cruise.mealPlan.days));
  assert.ok(Object.isFrozen(cruise.crew.members));
  for (const day of cruise.mealPlan.days) {
    assert.ok(Object.isFrozen(day.recipes));
    for (const entry of day.recipes) assert.ok(Object.isFrozen(entry.recipe.ingredients));
  }
  const assignmentIds = cruise.mealPlan.days.flatMap(day => day.recipes.map(entry => entry.assignmentId));
  assert.equal(new Set(assignmentIds).size, assignmentIds.length);
}

export function checkShopping(cruise: Cruise): void {
  const expected = new Map<string, number>();
  const add = (id: string, value: number) => expected.set(id, (expected.get(id) ?? 0) + value);
  for (const day of cruise.mealPlan.days) for (const entry of day.recipes) {
    if (entry.crewCount !== 0) for (const item of entry.recipe.ingredients) add(item.id, item.amount * entry.crewCount);
  }
  for (const item of cruise.supplies.entries) {
    let total = item.amount;
    if (item.isPerDay) total *= cruise.mealPlan.days.length;
    if (item.isPerPerson) total *= cruise.crew.members.length;
    add(item.id, total);
  }
  const totals = (value: Cruise) => {
    const entries = Object.values(value.shoppingList.aggregate(supplyCatalog)).flat();
    assert.equal(new Set(entries.map(item => item.supply.id)).size, entries.length);
    return new Map(entries.map(item => [item.supply.id, item.amount]));
  };
  assert.deepEqual(totals(cruise), expected);
  const reversed = json(cruise.toJSON());
  reversed.days.forEach(day => (day.recipes as unknown[]).reverse());
  (reversed.additionalSupplies as unknown[]).reverse();
  assert.deepEqual(totals(restoreCruise(reversed)), expected);
}

export interface AllocationInput { matrix: boolean[][]; capacities: number[] }
export const allocationArbitrary = fc.integer({ min: 0, max: MAX_RECIPES }).chain(count => fc.record({
  capacities: fc.array(fc.integer({ min: 0, max: MAX_PEOPLE }), { minLength: count, maxLength: count }),
  matrix: fc.array(fc.array(fc.boolean(), { minLength: count, maxLength: count }), { maxLength: MAX_PEOPLE }),
}));

// Independent oracle: exhaustive assignment with memoization, no flow network.
export function maximumFed(matrix: boolean[][], capacities: number[]): number {
  const cache = new Map<string, number>();
  const search = (person: number, remaining: number[]): number => {
    if (person === matrix.length) return 0;
    const key = `${person}:${remaining.join(',')}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    let best = search(person + 1, remaining);
    matrix[person].forEach((compatible, recipe) => {
      if (compatible && remaining[recipe] > 0) {
        const next = [...remaining];
        next[recipe]--;
        best = Math.max(best, 1 + search(person + 1, next));
      }
    });
    cache.set(key, best);
    return best;
  };
  return search(0, capacities);
}

export function checkAllocation({ matrix, capacities }: AllocationInput): void {
  const people: CrewMember[] = matrix.map((_, i) => ({ id: `${i}`, name: '', diet: 'omnivore' }));
  const resources = capacities.map((crewCount, i) => ({ originalRecipeId: `${i}`, crewCount })) as CruiseDayRecipe[];
  const count = (crew: CrewMember[], recipes: CruiseDayRecipe[]) => {
    const checker = new CrewRecipeAllocationChecker(crew, recipes,
      (member, recipe) => matrix[Number(member.id)][Number(recipe.originalRecipeId)]);
    const unfed = checker.getUnfedCrewMembers();
    assert.deepEqual(checker.getUnfedCrewMembers(), unfed);
    assert.equal(new Set(unfed.map(member => member.id)).size, unfed.length);
    return crew.length - unfed.length;
  };
  const actual = count(people, resources);
  assert.equal(actual, maximumFed(matrix, capacities), 'Allocation differs from exhaustive oracle');
  assert.equal(count([...people].reverse(), [...resources].reverse()), actual);
  assert.ok(count(people, resources.map(recipe => ({ ...recipe, crewCount: recipe.crewCount + 1 }))) >= actual);
}

function expectedCanEat(member: CrewMember, recipe: RecipieData): boolean {
  if (recipe.ingredients.some(item => member.excludedSupplies?.includes(item.id))) return false;
  if (member.diet === 'omnivore') return true;
  if (recipe.ingredients.length === 0) return false;
  return recipe.ingredients.every(item => {
    const supply = supplyCatalog.getIngredientById(item.id);
    return member.diet === 'vegan' ? supply?.isVegan === true : supply?.isVegetarian === true;
  });
}

interface CommandModel { count: number }
interface CommandReal { cruise: Cruise }
type Operation = 'add' | 'remove' | 'move' | 'edit' | 'portions' | 'duration' | 'crew';
class CruiseCommand implements fc.Command<CommandModel, CommandReal> {
  constructor(readonly operation: Operation, readonly index: number, readonly value: number, readonly recipe: RecipieData) {}
  check(model: Readonly<CommandModel>): boolean {
    return ['add', 'duration', 'crew'].includes(this.operation) || model.count > 0;
  }
  run(model: CommandModel, real: CommandReal): void {
    const previous = real.cruise;
    const snapshot = JSON.stringify(previous);
    const all = previous.mealPlan.days.flatMap(day => slots.flatMap(slot => previous.mealPlan.getRecipeAssignments({ day: day.dayNumber, slot })));
    const assignment = all[this.index % all.length];
    const day = this.value % previous.mealPlan.days.length + 1;
    const slot = slots[this.index % slots.length];
    switch (this.operation) {
      case 'add':
        real.cruise = previous.updateMealPlan(plan => plan.addRecipe({ day, slot, recipe: Recipie.create(this.recipe), portions: this.value }));
        assert.deepEqual(json(real.cruise.mealPlan.getRecipeAssignments({ day, slot }).at(-1)?.recipe), json(this.recipe));
        assert.equal(real.cruise.mealPlan.getRecipeAssignments({ day, slot }).at(-1)?.portions, this.value);
        model.count++;
        break;
      case 'remove':
        real.cruise = previous.updateMealPlan(plan => plan.removeRecipe({ assignment }));
        model.count--;
        assert.equal(real.cruise.updateMealPlan(plan => plan.removeRecipe({ assignment })), real.cruise);
        break;
      case 'move':
        real.cruise = previous.updateMealPlan(plan => plan.moveRecipe({ assignment, to: { day, slot } }));
        assert.ok(real.cruise.mealPlan.getRecipeAssignments({ day, slot }).some(item => item.key === assignment.key));
        break;
      case 'edit':
        real.cruise = previous.updateMealPlan(plan => plan.editAssignedRecipe({ assignment, changes: { name: this.recipe.name } }));
        assert.equal(real.cruise.mealPlan.days.flatMap(item => item.recipes).find(item => item.assignmentId === assignment.key)?.recipe.name, this.recipe.name);
        break;
      case 'portions':
        real.cruise = previous.updateMealPlan(plan => plan.changePortions({ assignment, portions: this.value }));
        assert.equal(real.cruise.mealPlan.days.flatMap(item => item.recipes).find(item => item.assignmentId === assignment.key)?.crewCount, this.value);
        break;
      case 'duration': {
        const length = this.value % 5 + 1;
        model.count -= previous.mealPlan.days.filter(item => item.dayNumber > length).reduce((sum, item) => sum + item.recipes.length, 0);
        real.cruise = previous.changeDuration(length);
        assert.deepEqual(real.cruise.mealPlan.days.map(item => item.dayNumber), Array.from({ length }, (_, i) => i + 1));
        break;
      }
      case 'crew':
        real.cruise = previous.replaceCrew(Crew.fromMembers(Array.from({ length: this.value % MAX_PEOPLE }, (_, i) => ({ id: `${i}`, name: '', diet: 'vegan' }))));
        assert.equal(real.cruise.crew.members.length, this.value % MAX_PEOPLE);
        assert.ok(real.cruise.crew.members.every(member => member.diet === 'vegan'));
        break;
    }
    assert.equal(JSON.stringify(previous), snapshot, 'Operation mutated previous instance');
    assert.equal(real.cruise.id, previous.id);
    assert.equal(real.cruise.dateCreated, previous.dateCreated);
    assert.equal(real.cruise.mealPlan.days.flatMap(item => item.recipes).length, model.count);
    assert.equal(real.cruise.rename(real.cruise.name), real.cruise);
    if (assignment) {
      const other = Cruise.createNew('Other', 1, []);
      assert.equal(other.updateMealPlan(plan => plan.removeRecipe({ assignment })), other);
    }
    checkRestoration(json(real.cruise));
    checkShopping(real.cruise);
  }
  toString(): string { return JSON.stringify(this); }
}
const commandArbitrary = fc.tuple(
  fc.constantFrom<Operation>('add', 'remove', 'move', 'edit', 'portions', 'duration', 'crew'),
  fc.nat({ max: 20 }), fc.nat({ max: 12 }), recipeArbitrary,
).map(args => new CruiseCommand(...args));

export const properties = {
  restoration: fc.property(cruiseArbitrary, cruise => {
    const input = json(cruise.toJSON());
    checkRestoration(input);
    const restored = restoreCruise(input);
    Object.assign(input, { name: 'Changed externally' });
    assert.equal(restored.name, cruise.name);
    assert.equal(Object.isFrozen(input.days), false);
  }),
  validation: fc.property(cruiseArbitrary, fc.integer({ min: 0, max: 5 }), (cruise, corruption) => {
    const input = json(cruise.toJSON()) as unknown as Record<string, unknown>;
    switch (corruption) {
      case 0: delete input.days; break;
      case 1: input.startDate = '2030-02-30'; break;
      case 2: input.dateCreated = 'not-a-date'; break;
      case 3: input.crewMembers = [{ id: 'x', name: '', diet: 'invalid' }]; break;
      case 4: input.additionalSupplies = [{ id: 'x', amount: '1', isPerDay: false, isPerPerson: false }]; break;
      case 5: input.days = [{ dayNumber: 0, recipes: [] }]; break;
    }
    assert.throws(() => restoreCruise(input), /Nieprawidłowe dane rejsu/);
  }),
  shopping: fc.property(cruiseArbitrary, checkShopping),
  allocation: fc.property(allocationArbitrary, checkAllocation),
  diets: fc.property(crewArbitrary, fc.array(recipeArbitrary, { maxLength: MAX_RECIPES }), (crew, recipes) => {
    const matrix = crew.map(member => recipes.map(recipe => {
      const expected = expectedCanEat(member, recipe);
      assert.equal(canEat(member, Recipie.fromData(recipe), supplyCatalog), expected);
      return expected;
    }));
    const assignments = recipes.map((recipeData, i) => ({ recipe: Recipie.fromData(recipeData), originalRecipeId: recipeData.id, crewCount: i, mealSlot: MealType.DINNER }));
    const report = getMealCoverage(assignments, crew, MealType.DINNER, supplyCatalog);
    assert.equal(report.unfed.length, crew.length - maximumFed(matrix, assignments.map(item => item.crewCount)));
    assert.equal(report.totalNeeded, crew.length);
    assert.equal(report.totalPortions, assignments.reduce((sum, item) => sum + item.crewCount, 0));
  }),
  operations: fc.property(fc.commands([commandArbitrary], { maxCommands: 30 }), commands => {
    fc.modelRun(() => ({ model: { count: 0 }, real: { cruise: Cruise.createNew('Commands', 3, []) } }), commands);
  }),
};
