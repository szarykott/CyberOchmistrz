import { Cruise } from '../src/model/cruise';
import { MealType } from '../src/model/recipe';
import { getCruises, saveCruise } from '../src/model/cruiseData';
import { importCruiseFromFile } from '../src/utils/cruiseFileIO';
import { clearCruises, localStorageMock, makeCrewMembers } from './cruiseTestHarness';

describe('cruise restoration', () => {
  const data = () => JSON.parse(JSON.stringify(Cruise.createNew('Trip', 1, makeCrewMembers(1), [{
    dayNumber: 1,
    recipes: [{ originalRecipeId: 'recipe', crewCount: 0, mealSlot: MealType.DINNER, recipeData: {
      id: 'recipe', name: 'Local snapshot', description: '', mealType: [MealType.DINNER],
      difficulty: 1, instructions: [], ingredients: [{ id: 'unknown-ingredient', amount: 2 }],
    } }],
  }])));
  const file = (value: unknown) => ({ text: async () => JSON.stringify(value) }) as File;

  beforeEach(() => { clearCruises(); jest.clearAllMocks(); });

  it('should import a usable immutable model preserving snapshots and identities', async () => {
    const input = data();
    input.id = '1700000000000';
    input.days[0].recipes[0].recipeData.ingredients[0].id = 'unknown-ingredient';
    const restored = await importCruiseFromFile(file(input));
    expect(restored).toBeInstanceOf(Cruise);
    expect(restored.rename('Changed').id).toBe(input.id);
    expect(restored.dateCreated).toBe(input.dateCreated);
    expect(restored.days[0].recipes[0].recipeData).toEqual(input.days[0].recipes[0].recipeData);
    expect(Object.isFrozen(restored.days[0].recipes[0].recipeData.ingredients)).toBe(true);
  });

  it('should keep legacy assignment identities stable without writing storage', () => {
    const input = data();
    delete input.additionalSupplies;
    delete input.days[0].recipes[0].assignmentId;
    localStorageMock.setItem('cyber-ochmistrz-cruises', JSON.stringify([input]));
    jest.clearAllMocks();
    const first = getCruises()[0];
    const second = getCruises()[0];
    const assignment = first.getRecipeAssignments({ day: 1, slot: MealType.DINNER })[0];
    expect(second.changePortions({ assignment, portions: 3 }).days[0].recipes[0].crewCount).toBe(3);
    expect(first.additionalSupplies).toEqual([]);
    expect(localStorageMock.setItem).not.toHaveBeenCalled();
  });

  it('should own restored data without freezing the input', () => {
    const input = data();
    const restored = Cruise.fromData(input);
    input.days[0].recipes[0].recipeData.ingredients[0].amount = 9;
    expect(restored.days[0].recipes[0].recipeData.ingredients[0].amount).toBe(2);
    expect(Object.isFrozen(input.days)).toBe(false);
  });

  it('should avoid collisions between existing and legacy assignment identities', () => {
    const input = data();
    const first = input.days[0].recipes[0];
    delete first.assignmentId;
    input.days[0].recipes.push({ ...first, assignmentId: 'legacy:0:0' });
    const restored = Cruise.fromData(input);
    const assignments = restored.getRecipeAssignments({ day: 1, slot: MealType.DINNER });
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
    ['invalid date', (value: ReturnType<typeof data>) => { value.dateModified = 'invalid'; }],
    ['incomplete start date', (value: ReturnType<typeof data>) => { value.startDate = '2030'; }],
    ['impossible start date', (value: ReturnType<typeof data>) => { value.startDate = '2030-02-30'; }],
    ['duplicate assignment IDs', (value: ReturnType<typeof data>) => { value.days[0].recipes.push(value.days[0].recipes[0]); }],
  ])('should reject %s before import or storage writes', async (_, invalidate) => {
    const input = data();
    invalidate(input);
    await expect(importCruiseFromFile(file(input))).rejects.toThrow();
    localStorageMock.setItem('cyber-ochmistrz-cruises', JSON.stringify([input]));
    jest.clearAllMocks();
    expect(() => getCruises()).toThrow();
    expect(() => saveCruise(Cruise.createNew('Other', 1, []))).toThrow();
    expect(localStorageMock.setItem).not.toHaveBeenCalled();
  });

  it('should reject non-array stored data without deleting it', () => {
    localStorageMock.setItem('cyber-ochmistrz-cruises', JSON.stringify(data()));
    jest.clearAllMocks();
    expect(() => getCruises()).toThrow();
    expect(localStorageMock.setItem).not.toHaveBeenCalled();
    expect(localStorageMock.removeItem).not.toHaveBeenCalled();
  });
});
