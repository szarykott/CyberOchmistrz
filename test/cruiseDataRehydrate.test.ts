import { restoreCruise } from '../src/data/cruiseRepository';
import { CruiseDayRecipe, Cruise } from '../src/model/cruise';
import { Recipie, RecipieData, MealType } from '../src/model/recipe';
import { Diet, CrewMember } from '../src/model/cruise/crew';

const makeRecipe = (id: string): RecipieData =>
  ({
    id,
    name: id,
    description: 'desc',
    mealType: [MealType.DINNER],
    difficulty: 2,
    instructions: ['step'],
    ingredients: [{ id: 'jajka', amount: 3 }],
  });

const makeMember = (id: string): CrewMember => ({ id, name: `Member ${id}`, diet: 'omnivore' as Diet });

const makeRecipeEntry = (id: string, crewCount: number, mealSlot: MealType): CruiseDayRecipe => ({
  originalRecipeId: id,
  recipe: Recipie.fromData(makeRecipe(id)),
  crewCount,
  mealSlot,
});

const originalCruise: Cruise = Cruise.createNew('Test Cruise', 2,
  [makeMember('m1'), makeMember('m2'), makeMember('m3')], [
  {
    dayNumber: 1,
    recipes: [
      makeRecipeEntry('jajecznica', 3, MealType.BREAKFAST),
      makeRecipeEntry('spaghetti', 3, MealType.DINNER),
    ],
  },
  {
    dayNumber: 2,
    recipes: [makeRecipeEntry('pesto', 2, MealType.DINNER)],
  },
], [{ id: 'woda', amount: 10, isPerPerson: false, isPerDay: true }],
  '2030-06-01');

describe('Cruise JSON round-trip (rehydration)', () => {
  let roundTripped: Cruise;

  beforeAll(() => {
    roundTripped = restoreCruise(JSON.parse(JSON.stringify(originalCruise)));
  });

  it('should preserve crewMembers array length', () => {
    expect(roundTripped.crew.members).toHaveLength(originalCruise.crew.members.length);
  });

  it('should preserve crewMember id, name, and diet on each member', () => {
    roundTripped.crew.members.forEach((m, i) => {
      expect(m.id).toBe(originalCruise.crew.members[i].id);
      expect(m.name).toBe(originalCruise.crew.members[i].name);
      expect(m.diet).toBe(originalCruise.crew.members[i].diet);
    });
  });

  it('crewMembers.length after round-trip equals original crew count (guards against scalar regression)', () => {
    expect(roundTripped.crew.members.length).toBe(3);
    expect(roundTripped.toJSON()).not.toHaveProperty('crew');
  });

  it('should preserve days[].recipes[].crewCount', () => {
    expect(roundTripped.mealPlan.days[0].recipes[0].crewCount).toBe(3);
    expect(roundTripped.mealPlan.days[0].recipes[1].crewCount).toBe(3);
    expect(roundTripped.mealPlan.days[1].recipes[0].crewCount).toBe(2);
  });

  it('should preserve days[].recipes[].mealSlot', () => {
    expect(roundTripped.mealPlan.days[0].recipes[0].mealSlot).toBe(MealType.BREAKFAST);
    expect(roundTripped.mealPlan.days[0].recipes[1].mealSlot).toBe(MealType.DINNER);
  });

  it('should preserve days[].recipes[].recipeData as required field', () => {
    const r = roundTripped.toJSON().days[0].recipes[0];
    expect(r.recipeData).toBeDefined();
    expect(r.recipeData.id).toBe('jajecznica');
    expect(r.recipeData.ingredients).toEqual([{ id: 'jajka', amount: 3 }]);
  });

  it('should preserve originalRecipeId', () => {
    expect(roundTripped.mealPlan.days[0].recipes[0].originalRecipeId).toBe('jajecznica');
    expect(roundTripped.mealPlan.days[1].recipes[0].originalRecipeId).toBe('pesto');
  });

  it('should preserve top-level cruise fields', () => {
    expect(roundTripped.id).toBe(originalCruise.id);
    expect(roundTripped.name).toBe(originalCruise.name);
    expect(roundTripped.mealPlan.days.length).toBe(originalCruise.mealPlan.days.length);
    expect(roundTripped.startDate).toBe(originalCruise.startDate);
  });

  it('should preserve additionalSupplies', () => {
    expect(roundTripped.supplies.entries).toEqual(originalCruise.supplies.entries);
  });
});
