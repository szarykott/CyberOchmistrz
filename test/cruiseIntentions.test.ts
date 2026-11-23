import { Cruise } from '../src/model/cruise';
import { MealType } from '../src/model/recipe';
import { createTestRecipe, makeCrewMembers } from './cruiseTestHarness';

describe('Cruise intentions', () => {
  const recipe = () => createTestRecipe('recipe', 'Recipe');
  const menu = (cruise: Cruise, day = 1, slot = MealType.DINNER) => cruise.getRecipeAssignments({ day, slot });

  it('should create unique IDs and own nested input without freezing it', () => {
    jest.useFakeTimers().setSystemTime(new Date('2027-05-01T12:00:00Z'));
    const crew = [{ ...makeCrewMembers(1)[0], excludedSupplies: ['milk'] }];
    const first = Cruise.createNew('First', 1, crew);
    const second = Cruise.createNew('Second', 1, crew);
    expect(first.id).not.toBe(second.id);
    expect(first.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(first.dateCreated).toBe(second.dateCreated);
    crew[0].excludedSupplies.push('egg');
    expect(first.crewMembers[0].excludedSupplies).toEqual(['milk']);
    expect(Object.isFrozen(crew[0])).toBe(false);
    expect(Object.isFrozen(first.crewMembers[0].excludedSupplies)).toBe(true);
    jest.useRealTimers();
  });

  it('should move and edit the selected duplicate using a stale handle', () => {
    const initial = Cruise.createNew('Cruise', 2, makeCrewMembers(1))
      .addRecipe({ day: 1, slot: MealType.DINNER, recipe: recipe(), portions: 1 })
      .addRecipe({ day: 1, slot: MealType.DINNER, recipe: recipe(), portions: 2 });
    const [first, second] = menu(initial);
    const moved = initial.moveRecipe({ assignment: second, to: { day: 2, slot: MealType.SUPPER } });
    const edited = moved.editAssignedRecipe({ assignment: second, changes: { name: 'Changed' } });
    expect(menu(initial)).toHaveLength(2);
    expect(menu(edited)[0].recipe.name).toBe(first.recipe.name);
    expect(menu(edited, 2, MealType.SUPPER)[0].recipe.name).toBe('Changed');
    expect(edited.removeRecipe({ assignment: second }).removeRecipe({ assignment: second }).days[1].recipes).toHaveLength(0);
    expect(Cruise.fromData(JSON.parse(JSON.stringify(edited))).changePortions({ assignment: second, portions: 3 }).days[1].recipes[0].crewCount).toBe(3);
  });

  it('should preserve identity for equal valid edits and reject empty ingredients', () => {
    const cruise = Cruise.createNew('Cruise', 1, makeCrewMembers(1)).addRecipe({ day: 1, slot: MealType.DINNER, recipe: recipe(), portions: 1 });
    const assignment = menu(cruise)[0];
    expect(cruise.editAssignedRecipe({ assignment, changes: { ingredients: assignment.recipe.ingredients.map(i => ({ ...i })) } })).toBe(cruise);
    expect(cruise.changePortions({ assignment, portions: 1 })).toBe(cruise);
    expect(() => cruise.editAssignedRecipe({ assignment, changes: { ingredients: [] } })).toThrow('Recipe must have at least one ingredient');
    expect(cruise.replaceCrew(cruise.crewMembers)).toBe(cruise);
  });

  it('should merge scaling amounts and warn only for removed days', () => {
    const cruise = Cruise.createNew('Cruise', 3, makeCrewMembers(1), undefined, [
      { id: 'water', amount: 3, isPerPerson: false, isPerDay: false },
      { id: 'water', amount: 5, isPerPerson: true, isPerDay: false },
    ]).addRecipe({ day: 2, slot: MealType.DINNER, recipe: recipe(), portions: 1 });
    expect(cruise.willLengthReductionRemoveRecipes(2)).toBe(false);
    expect(cruise.changeAdditionalSupplyScaling({ supply: cruise.additionalSupplies[0], perPerson: false, perDay: false })).toBe(cruise);
    expect(cruise.changeAdditionalSupplyScaling({ supply: cruise.additionalSupplies[0], perPerson: true, perDay: false }).additionalSupplies).toEqual([
      expect.objectContaining({ amount: 8, isPerPerson: true }),
    ]);
  });
  it('should insert before a target and ignore foreign or removed handles', () => {
    const cruise = Cruise.createNew('Cruise', 2, makeCrewMembers(1))
      .addRecipe({ day: 1, slot: MealType.DINNER, recipe: recipe(), portions: 1 })
      .addRecipe({ day: 2, slot: MealType.SUPPER, recipe: recipe(), portions: 2 });
    const source = menu(cruise)[0];
    const target = menu(cruise, 2, MealType.SUPPER)[0];
    const moved = cruise.moveRecipe({ assignment: source, to: { day: 2, slot: MealType.SUPPER }, before: target });
    expect(menu(moved, 2, MealType.SUPPER).map(item => item.portions)).toEqual([1, 2]);
    expect(moved.removeRecipe({ assignment: { ...target } })).toBe(moved);
    const removed = moved.removeRecipe({ assignment: source });
    expect(removed.changePortions({ assignment: source, portions: 4 })).toBe(removed);
    expect(Cruise.createNew('Other', 1, []).removeRecipe({ assignment: target }).name).toBe('Other');
    expect(moved.moveRecipe({ assignment: target, to: { day: 1, slot: MealType.DINNER }, before: source })).toBe(moved);
  });

  it('should retain stable legacy handles and share unchanged data', () => {
    const cruise = Cruise.createNew('Cruise', 1, makeCrewMembers(1)).addRecipe({ day: 1, slot: MealType.DINNER, recipe: recipe(), portions: 1 });
    const data = JSON.parse(JSON.stringify(cruise));
    delete data.days[0].recipes[0].assignmentId;
    const first = Cruise.fromData(data);
    const second = Cruise.fromData(data);
    const assignment = menu(first)[0];
    expect(menu(second)[0].key).toBe(assignment.key);
    expect(second.changePortions({ assignment, portions: 2 }).days[0].recipes[0].crewCount).toBe(2);
    expect(first.changeDuration(2).days[0]).toBe(first.days[0]);
    expect(first.rename('New').days).toBe(first.days);
    const dated = first.changeStartDate('2027-05-01');
    expect(dated.rename('New').startDate).toBe('2027-05-01');
    expect(dated.changeStartDate('2027-05-01')).toBe(dated);
    expect(dated.clearStartDate().startDate).toBeUndefined();
  });

  it('should keep the same cruise when a move leaves slot order unchanged', () => {
    const cruise = Cruise.createNew('Cruise', 1, makeCrewMembers(1))
      .addRecipe({ day: 1, slot: MealType.DINNER, recipe: recipe(), portions: 1 })
      .addRecipe({ day: 1, slot: MealType.BREAKFAST, recipe: recipe(), portions: 2 });
    const assignment = menu(cruise)[0];
    expect(cruise.moveRecipe({ assignment, to: { day: 1, slot: MealType.DINNER } })).toBe(cruise);
  });

  it('should detach predefined data and later inputs without freezing callers', () => {
    const sourceRecipe = JSON.parse(JSON.stringify(recipe()));
    const days = [{ dayNumber: 1, recipes: [{ originalRecipeId: sourceRecipe.id, recipeData: sourceRecipe, crewCount: 1, mealSlot: MealType.DINNER }] }];
    const supplies = [{ id: 'water', amount: 3, isPerPerson: false, isPerDay: false }];
    const original = Cruise.createNew('Cruise', 1, [], days, supplies);
    sourceRecipe.ingredients[0].amount = 999;
    supplies[0].amount = 999;
    days[0].recipes[0].crewCount = 999;
    expect(menu(original)[0].recipe.ingredients[0].amount).toBe(100);
    expect(menu(original)[0].portions).toBe(1);
    expect(original.additionalSupplies[0].amount).toBe(3);
    expect(Object.isFrozen(sourceRecipe.ingredients[0])).toBe(false);
    expect(Object.isFrozen(supplies[0])).toBe(false);
    expect(Object.isFrozen(original.days[0].recipes[0].recipeData.ingredients[0])).toBe(true);
    const crew = [{ ...makeCrewMembers(1)[0], excludedSupplies: ['milk'] }];
    const updated = original.replaceCrew(crew);
    crew[0].excludedSupplies.push('egg');
    expect(updated.crewMembers[0].excludedSupplies).toEqual(['milk']);
    expect(Object.isFrozen(crew[0].excludedSupplies)).toBe(false);
    expect(updated.days).toBe(original.days);
    expect(updated.additionalSupplies).toBe(original.additionalSupplies);
    const added = updated.addRecipe({ day: 1, slot: MealType.DINNER, recipe: sourceRecipe, portions: 1 });
    sourceRecipe.ingredients[0].amount = 5;
    expect(menu(added)[1].recipe.ingredients[0].amount).toBe(999);
  });

  it('should edit duplicate assignments independently and keep equal drafts unchanged', () => {
    const cruise = Cruise.createNew('Cruise', 1, makeCrewMembers(1))
      .addRecipe({ day: 1, slot: MealType.DINNER, recipe: recipe(), portions: 1 })
      .addRecipe({ day: 1, slot: MealType.DINNER, recipe: recipe(), portions: 1 });
    const [first, second] = menu(cruise);
    for (const changes of [{}, { name: first.recipe.name }, { ingredients: first.recipe.ingredients.map(item => ({ ...item })) }]) {
      const unchanged = cruise.editAssignedRecipe({ assignment: first, changes });
      expect(unchanged).toBe(cruise);
      expect(unchanged.dateModified).toBe(cruise.dateModified);
    }
    const ingredients = [{ id: 'different', amount: 2 }];
    const edited = cruise.editAssignedRecipe({ assignment: first, changes: { name: 'Changed', ingredients } });
    ingredients[0].amount = 10;
    expect(menu(edited)[0].recipe.ingredients[0].amount).toBe(2);
    expect(menu(edited)[1].recipe).toBe(second.recipe);
    expect(menu(cruise)[0].recipe.name).toBe('Recipe');
    for (const ingredients of [[{ ...first.recipe.ingredients[0], id: 'other' }], [{ ...first.recipe.ingredients[0], amount: 2 }]]) {
      expect(menu(cruise.editAssignedRecipe({ assignment: first, changes: { ingredients } }))[0].recipe.ingredients).toEqual(ingredients);
    }
  });

  it('should retain amount when scaling without collision across both flags', () => {
    const cruise = Cruise.createNew('Cruise', 1, [], undefined, [
      { id: 'water', amount: 3, isPerPerson: false, isPerDay: false },
      { id: 'water', amount: 5, isPerPerson: true, isPerDay: false },
    ]);
    const changed = cruise.changeAdditionalSupplyScaling({ supply: cruise.additionalSupplies[0], perPerson: true, perDay: true });
    expect(changed.additionalSupplies).toEqual(expect.arrayContaining([
      expect.objectContaining({ amount: 3, isPerPerson: true, isPerDay: true }),
      expect.objectContaining({ amount: 5, isPerPerson: true, isPerDay: false }),
    ]));
    expect(cruise.additionalSupplies[0].isPerDay).toBe(false);
  });

  it('should treat equal crew values as unchanged regardless of property order', () => {
    const cruise = Cruise.createNew('Cruise', 1, [{ id: 'a', name: 'Anna', diet: 'omnivore', excludedSupplies: ['milk', 'egg'] }]);
    const equalCrew = [{ name: 'Anna', diet: 'omnivore' as const, excludedSupplies: ['milk', 'egg'], id: 'a' }];
    expect(cruise.replaceCrew(equalCrew)).toBe(cruise);
    expect(cruise.replaceCrew([{ ...equalCrew[0], excludedSupplies: ['egg', 'milk'] }])).not.toBe(cruise);
  });

  it('should replace crew when any member field or exclusion changes', () => {
    const crew = [
      { id: 'a', name: 'Anna', diet: 'omnivore' as const, excludedSupplies: ['milk', 'egg'] },
      { id: 'b', name: 'Beata', diet: 'vegan' as const, excludedSupplies: ['nuts', 'soy'] },
    ];
    const cruise = Cruise.createNew('Cruise', 1, crew);
    for (const change of [
      { id: 'c' }, { name: 'Barbara' }, { diet: 'vegetarian' as const },
      { excludedSupplies: ['nuts', 'milk'] }, { excludedSupplies: ['nuts'] },
      { excludedSupplies: undefined },
    ]) {
      const replacement = [crew[0], { ...crew[1], ...change }];
      const updated = cruise.replaceCrew(replacement);
      expect(updated.crewMembers[1]).toEqual(replacement[1]);
      expect(updated).not.toBe(cruise);
    }
    expect(cruise.replaceCrew(crew.map(member => ({ ...member, excludedSupplies: [...member.excludedSupplies] })))).toBe(cruise);
  });

  it('should filter assignments by slot and reorder within a slot', () => {
    const cruise = Cruise.createNew('Cruise', 2, [])
      .addRecipe({ day: 1, slot: MealType.DINNER, recipe: recipe(), portions: 1 })
      .addRecipe({ day: 1, slot: MealType.BREAKFAST, recipe: recipe(), portions: 2 })
      .addRecipe({ day: 1, slot: MealType.DINNER, recipe: recipe(), portions: 3 });
    const [first, last] = menu(cruise);
    const breakfast = menu(cruise, 1, MealType.BREAKFAST)[0];
    expect(menu(cruise, 3)).toEqual([]);
    expect(menu(cruise).map(item => item.portions)).toEqual([1, 3]);
    expect(menu(cruise.moveRecipe({ assignment: last, to: { day: 1, slot: MealType.DINNER }, before: first })).map(item => item.portions)).toEqual([3, 1]);
    expect(cruise.moveRecipe({ assignment: first, to: { day: 1, slot: MealType.DINNER }, before: breakfast })).toBe(cruise);
    expect(cruise.moveRecipe({ assignment: first, to: { day: 2, slot: MealType.DINNER }, before: last })).toBe(cruise);
    expect(cruise.moveRecipe({ assignment: first, to: { day: 3, slot: MealType.DINNER } })).toBe(cruise);
    expect(cruise.moveRecipe({ assignment: first, to: { day: 1, slot: MealType.DINNER }, before: first })).toBe(cruise);
  });

});
