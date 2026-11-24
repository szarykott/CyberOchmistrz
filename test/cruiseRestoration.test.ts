import { Cruise } from '../src/model/cruise';
import { MealType, Recipie } from '../src/model/recipe';
import { cruiseRepository, restoreCruise } from '../src/data/cruiseRepository';
import { clearCruises, localStorageMock, makeCrewMembers } from './cruiseTestHarness';

describe('cruise restoration', () => {
  const data = () => JSON.parse(JSON.stringify(Cruise.createNew('Trip', 1, makeCrewMembers(1), [{
    dayNumber: 1,
    recipes: [{ originalRecipeId: 'recipe', crewCount: 0, mealSlot: MealType.DINNER, recipe: Recipie.fromData({
      id: 'recipe', name: 'Local snapshot', description: '', mealType: [MealType.DINNER],
      difficulty: 1, instructions: [], ingredients: [{ id: 'unknown-ingredient', amount: 2 }],
    }) }],
  }])));
  const file = (value: unknown) => ({ text: async () => JSON.stringify(value) }) as File;

  beforeEach(() => { clearCruises(); jest.clearAllMocks(); });

  it('should import a usable immutable model preserving snapshots and identities', async () => {
    const input = data();
    input.id = '1700000000000';
    input.days[0].recipes[0].recipeData.ingredients[0].id = 'unknown-ingredient';
    const restored = await cruiseRepository.importFromFile(file(input));
    expect(restored).toBeInstanceOf(Cruise);
    expect(restored.rename('Changed').id).toBe(input.id);
    expect(restored.dateCreated).toBe(input.dateCreated);
    expect(restored.toJSON().days[0].recipes[0].recipeData).toEqual(input.days[0].recipes[0].recipeData);
    expect(Object.isFrozen(restored.mealPlan.days[0].recipes[0].recipe.ingredients)).toBe(true);
  });

  it('should keep legacy assignment identities stable without writing storage', async () => {
    const input = data();
    delete input.additionalSupplies;
    delete input.days[0].recipes[0].assignmentId;
    localStorageMock.setItem('cyber-ochmistrz-cruises', JSON.stringify([input]));
    jest.clearAllMocks();
    const first = (await cruiseRepository.getAll())[0];
    const second = (await cruiseRepository.getAll())[0];
    const assignment = first.mealPlan.getRecipeAssignments({ day: 1, slot: MealType.DINNER })[0];
    expect(second.updateMealPlan(plan => plan.changePortions({ assignment, portions: 3 })).mealPlan.days[0].recipes[0].crewCount).toBe(3);
    expect(first.supplies.entries).toEqual([]);
    expect(localStorageMock.setItem).not.toHaveBeenCalled();
  });

  it('should own restored data without freezing the input', () => {
    const input = data();
    const restored = restoreCruise(input);
    input.days[0].recipes[0].recipeData.ingredients[0].amount = 9;
    expect(restored.mealPlan.days[0].recipes[0].recipe.ingredients[0].amount).toBe(2);
    expect(Object.isFrozen(input.days)).toBe(false);
  });

  it('should edit and persist a legacy record using the original wire fields', async () => {
    const legacy = {
      id: '1700000000000',
      name: 'Trip',
      dateCreated: '2026-01-01T00:00:00.000Z',
      dateModified: '2026-01-01T00:00:00.000Z',
      crewMembers: [{ id: 'anna', name: 'Anna', diet: 'omnivore', excludedSupplies: ['milk'] }],
      days: [{
        dayNumber: 1,
        recipes: [{
          originalRecipeId: 'catalog-id',
          crewCount: 1,
          mealSlot: MealType.DINNER,
          recipeData: {
            id: 'snapshot-id', name: 'Historical recipe', description: '', difficulty: 1,
            mealType: [MealType.DINNER], instructions: [], ingredients: [{ id: 'milk', amount: 2 }],
            modifiedBy: ['Anna'],
          },
        }],
      }],
    };
    localStorageMock.setItem('cyber-ochmistrz-cruises', JSON.stringify([legacy]));
    const cruise = (await cruiseRepository.getAll())[0];
    const [assignment] = cruise.mealPlan.getRecipeAssignments({ day: 1, slot: MealType.DINNER });
    const updated = cruise.updateMealPlan(plan => plan.changePortions({ assignment, portions: 2 }));
    await cruiseRepository.save(updated);

    const output = JSON.parse(JSON.stringify((await cruiseRepository.getAll())[0]));
    expect(output).toEqual({
      ...legacy,
      dateModified: updated.dateModified,
      additionalSupplies: [],
      days: [{
        dayNumber: 1,
        recipes: [{ ...legacy.days[0].recipes[0], assignmentId: 'legacy:0:0', crewCount: 2 }],
      }],
    });
    const serialized = updated.toJSON();
    expect(Reflect.set(serialized.days[0].recipes[0].recipeData.ingredients[0], 'amount', 99)).toBe(false);
    expect(Reflect.set(serialized.crewMembers[0].excludedSupplies!, 0, 'egg')).toBe(false);
    expect(Reflect.set(serialized.days[0].recipes[0], 'crewCount', 99)).toBe(true);
    expect(updated.mealPlan.getRecipeAssignments({ day: 1, slot: MealType.DINNER })[0].portions).toBe(2);
    expect(JSON.parse(JSON.stringify(await cruiseRepository.importFromFile(file(output))))).toEqual(output);
  });

  it('should avoid collisions between existing and legacy assignment identities', () => {
    const input = data();
    const first = input.days[0].recipes[0];
    delete first.assignmentId;
    input.days[0].recipes.push({ ...first, assignmentId: 'legacy:0:0' });
    const restored = restoreCruise(input);
    const assignments = restored.mealPlan.getRecipeAssignments({ day: 1, slot: MealType.DINNER });
    expect(assignments[0].key).not.toBe(assignments[1].key);
    expect(assignments[1].key).toBe('legacy:0:0');
  });

  it.each([
    ['missing days', (value: ReturnType<typeof data>) => { delete value.days; }],
    ['invalid diet', (value: ReturnType<typeof data>) => { value.crewMembers[0].diet = 'unknown'; }],
    ['invalid day number', (value: ReturnType<typeof data>) => { value.days[0].dayNumber = 2; }],
    ['invalid meal slot', (value: ReturnType<typeof data>) => { value.days[0].recipes[0].mealSlot = 'unknown'; }],
    ['missing snapshot field', (value: ReturnType<typeof data>) => { delete value.days[0].recipes[0].recipeData.instructions; }],
    ['invalid ingredient amount', (value: ReturnType<typeof data>) => { value.days[0].recipes[0].recipeData.ingredients[0].amount = '2'; }],
    ['invalid recipe name', (value: ReturnType<typeof data>) => { value.days[0].recipes[0].recipeData.name = 1; }],
    ['invalid recipe description', (value: ReturnType<typeof data>) => { value.days[0].recipes[0].recipeData.description = null; }],
    ['invalid recipe difficulty', (value: ReturnType<typeof data>) => { value.days[0].recipes[0].recipeData.difficulty = '1'; }],
    ['invalid assignment recipe ID', (value: ReturnType<typeof data>) => { value.days[0].recipes[0].originalRecipeId = 1; }],
    ['invalid crew name', (value: ReturnType<typeof data>) => { value.crewMembers[0].name = 1; }],
    ['invalid crew exclusions', (value: ReturnType<typeof data>) => { value.crewMembers[0].excludedSupplies = [1]; }],
    ['invalid additional supply flags', (value: ReturnType<typeof data>) => { value.additionalSupplies = [{ id: 'water', amount: 1, isPerPerson: false, isPerDay: 'yes' }]; }],
    ['prefixed start date', (value: ReturnType<typeof data>) => { value.startDate = 'x2030-01-01'; }],
    ['suffixed start date', (value: ReturnType<typeof data>) => { value.startDate = '2030-01-01x'; }],
    ['invalid date', (value: ReturnType<typeof data>) => { value.dateModified = 'invalid'; }],
    ['incomplete start date', (value: ReturnType<typeof data>) => { value.startDate = '2030'; }],
    ['impossible start date', (value: ReturnType<typeof data>) => { value.startDate = '2030-02-30'; }],
    ['duplicate assignment IDs', (value: ReturnType<typeof data>) => { value.days[0].recipes.push(value.days[0].recipes[0]); }],
  ])('should reject %s before import or storage writes', async (_, invalidate) => {
    const input = data();
    invalidate(input);
    await expect(cruiseRepository.importFromFile(file(input))).rejects.toThrow();
    localStorageMock.setItem('cyber-ochmistrz-cruises', JSON.stringify([input]));
    jest.clearAllMocks();
    await expect(cruiseRepository.getAll()).rejects.toThrow();
    await expect(cruiseRepository.save(Cruise.createNew('Other', 1, []))).rejects.toThrow();
    expect(localStorageMock.setItem).not.toHaveBeenCalled();
  });

  it('should reject non-finite nested numeric values', () => {
    for (const amount of [Infinity, -Infinity, NaN]) {
      const input = data();
      input.days[0].recipes[0].recipeData.ingredients[0].amount = amount;
      expect(() => restoreCruise(input)).toThrow();
    }
  });

  it('should reject non-array stored data without deleting it', async () => {
    localStorageMock.setItem('cyber-ochmistrz-cruises', JSON.stringify(data()));
    jest.clearAllMocks();
    await expect(cruiseRepository.getAll()).rejects.toThrow();
    expect(localStorageMock.setItem).not.toHaveBeenCalled();
    expect(localStorageMock.removeItem).not.toHaveBeenCalled();
  });
});
