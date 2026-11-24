import { restoreCruise } from '../src/data/cruiseRepository';
import { Crew } from "../src/model/crew";
import { Cruise } from '../src/model/cruise';
import { Recipie, MealType } from '../src/model/recipe';
import { createTestRecipe, makeCrewMembers } from './cruiseTestHarness';

describe('Cruise intentions', () => {
  const recipe = () => createTestRecipe('recipe', 'Recipe');
  const menu = (cruise: Cruise, day = 1, slot = MealType.DINNER) => cruise.mealPlan.getRecipeAssignments({ day, slot });

  it('should create unique IDs and own nested input without freezing it', () => {
    jest.useFakeTimers().setSystemTime(new Date('2027-05-01T12:00:00Z'));
    const crew = [{ ...makeCrewMembers(1)[0], excludedSupplies: ['milk'] }];
    const first = Cruise.createNew('First', 1, crew);
    const second = Cruise.createNew('Second', 1, crew);
    expect(first.id).not.toBe(second.id);
    expect(first.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(first.dateCreated).toBe(second.dateCreated);
    crew[0].excludedSupplies.push('egg');
    expect(first.crew.members[0].excludedSupplies).toEqual(['milk']);
    expect(Object.isFrozen(crew[0])).toBe(false);
    expect(Object.isFrozen(first.crew.members[0].excludedSupplies)).toBe(true);
    jest.useRealTimers();
  });

  it('should move and edit the selected duplicate using a stale handle', () => {
    const initial = Cruise.createNew('Cruise', 2, makeCrewMembers(1))
      .updateMealPlan(plan => plan.addRecipe({ day: 1, slot: MealType.DINNER, recipe: Recipie.create(recipe()), portions: 1 }))
      .updateMealPlan(plan => plan.addRecipe({ day: 1, slot: MealType.DINNER, recipe: Recipie.create(recipe()), portions: 2 }));
    const [first, second] = menu(initial);
    const moved = initial.updateMealPlan(plan => plan.moveRecipe({ assignment: second, to: { day: 2, slot: MealType.SUPPER } }));
    const edited = moved.updateMealPlan(plan => plan.editAssignedRecipe({ assignment: second, changes: { name: 'Changed' } }));
    expect(menu(initial)).toHaveLength(2);
    expect(menu(edited)[0].recipe.name).toBe(first.recipe.name);
    expect(menu(edited, 2, MealType.SUPPER)[0].recipe.name).toBe('Changed');
    expect(edited.updateMealPlan(plan => plan.removeRecipe({ assignment: second })).updateMealPlan(plan => plan.removeRecipe({ assignment: second })).mealPlan.days[1].recipes).toHaveLength(0);
    expect(restoreCruise(JSON.parse(JSON.stringify(edited))).updateMealPlan(plan => plan.changePortions({ assignment: second, portions: 3 })).mealPlan.days[1].recipes[0].crewCount).toBe(3);
  });

  it('should install only an edited plan from the same cruise', () => {
    const cruise = Cruise.createNew('Cruise', 2, makeCrewMembers(1))
      .updateMealPlan(plan => plan.addRecipe({ day: 1, slot: MealType.DINNER, recipe: Recipie.create(recipe()), portions: 1 }));
    const [assignment] = menu(cruise);
    const detached = cruise.mealPlan.changePortions({ assignment, portions: 2 });

    expect(menu(cruise)[0].portions).toBe(1);
    expect(detached.days[1]).toBe(cruise.mealPlan.days[1]);
    expect(detached.getRecipeAssignments({ day: 1, slot: MealType.DINNER })[0].recipe).toBe(assignment.recipe);
    const installed = cruise.updateMealPlan(() => detached);
    expect(menu(installed)[0].portions).toBe(2);
    expect(installed.mealPlan).toBe(detached);
    expect(installed.crew).toBe(cruise.crew);
    expect(installed.supplies).toBe(cruise.supplies);
    expect(installed.updateMealPlan(plan => plan.changePortions({ assignment, portions: 2 }))).toBe(installed);
    expect(() => Cruise.createNew('Other', 2, []).updateMealPlan(() => detached)).toThrow('Plan posiłków należy do innego rejsu');
  });

  it('should preserve identity for equal valid edits and reject empty ingredients', () => {
    const cruise = Cruise.createNew('Cruise', 1, makeCrewMembers(1)).updateMealPlan(plan => plan.addRecipe({ day: 1, slot: MealType.DINNER, recipe: Recipie.create(recipe()), portions: 1 }));
    const assignment = menu(cruise)[0];
    expect(cruise.updateMealPlan(plan => plan.editAssignedRecipe({ assignment, changes: { ingredients: assignment.recipe.ingredients.map(i => ({ ...i })) } }))).toBe(cruise);
    expect(cruise.updateMealPlan(plan => plan.changePortions({ assignment, portions: 1 }))).toBe(cruise);
    expect(() => cruise.updateMealPlan(plan => plan.editAssignedRecipe({ assignment, changes: { ingredients: [] } }))).toThrow('Recipe must have at least one ingredient');
    expect(cruise.replaceCrew(Crew.fromMembers(cruise.crew.members))).toBe(cruise);
  });

  it('should merge scaling amounts and warn only for removed days', () => {
    const cruise = Cruise.createNew('Cruise', 3, makeCrewMembers(1), undefined, [
      { id: 'water', amount: 3, isPerPerson: false, isPerDay: false },
      { id: 'water', amount: 5, isPerPerson: true, isPerDay: false },
    ]).updateMealPlan(plan => plan.addRecipe({ day: 2, slot: MealType.DINNER, recipe: Recipie.create(recipe()), portions: 1 }));
    expect(cruise.willLengthReductionRemoveRecipes(2)).toBe(false);
    expect(cruise.updateSupplies(supplies => supplies.changeScaling({ supply: cruise.supplies.entries[0], perPerson: false, perDay: false }))).toBe(cruise);
    expect(cruise.updateSupplies(supplies => supplies.changeScaling({ supply: cruise.supplies.entries[0], perPerson: true, perDay: false })).supplies.entries).toEqual([
      expect.objectContaining({ amount: 8, isPerPerson: true }),
    ]);
  });
  it('should insert before a target and ignore foreign or removed handles', () => {
    const cruise = Cruise.createNew('Cruise', 2, makeCrewMembers(1))
      .updateMealPlan(plan => plan.addRecipe({ day: 1, slot: MealType.DINNER, recipe: Recipie.create(recipe()), portions: 1 }))
      .updateMealPlan(plan => plan.addRecipe({ day: 2, slot: MealType.SUPPER, recipe: Recipie.create(recipe()), portions: 2 }));
    const source = menu(cruise)[0];
    const target = menu(cruise, 2, MealType.SUPPER)[0];
    const moved = cruise.updateMealPlan(plan => plan.moveRecipe({ assignment: source, to: { day: 2, slot: MealType.SUPPER }, before: target }));
    expect(menu(moved, 2, MealType.SUPPER).map(item => item.portions)).toEqual([1, 2]);
    expect(moved.updateMealPlan(plan => plan.removeRecipe({ assignment: { ...target } }))).toBe(moved);
    const removed = moved.updateMealPlan(plan => plan.removeRecipe({ assignment: source }));
    expect(removed.updateMealPlan(plan => plan.changePortions({ assignment: source, portions: 4 }))).toBe(removed);
    expect(Cruise.createNew('Other', 1, []).updateMealPlan(plan => plan.removeRecipe({ assignment: target })).name).toBe('Other');
    expect(moved.updateMealPlan(plan => plan.moveRecipe({ assignment: target, to: { day: 1, slot: MealType.DINNER }, before: source }))).toBe(moved);
  });

  it('should retain stable legacy handles and share unchanged data', () => {
    const cruise = Cruise.createNew('Cruise', 1, makeCrewMembers(1)).updateMealPlan(plan => plan.addRecipe({ day: 1, slot: MealType.DINNER, recipe: Recipie.create(recipe()), portions: 1 }));
    const data = JSON.parse(JSON.stringify(cruise));
    delete data.days[0].recipes[0].assignmentId;
    const first = restoreCruise(data);
    const second = restoreCruise(data);
    const assignment = menu(first)[0];
    expect(menu(second)[0].key).toBe(assignment.key);
    expect(second.updateMealPlan(plan => plan.changePortions({ assignment, portions: 2 })).mealPlan.days[0].recipes[0].crewCount).toBe(2);
    expect(first.changeDuration(2).mealPlan.days[0]).toBe(first.mealPlan.days[0]);
    expect(first.rename('New').mealPlan).toBe(first.mealPlan);
    const dated = first.changeStartDate('2027-05-01');
    expect(dated.rename('New').startDate).toBe('2027-05-01');
    expect(dated.changeStartDate('2027-05-01')).toBe(dated);
    expect(dated.mealPlan).toBe(first.mealPlan);
    const cleared = dated.clearStartDate();
    expect(cleared.mealPlan).toBe(first.mealPlan);
    expect(cleared.toJSON()).not.toHaveProperty('startDate');
  });

  it('should keep the same cruise when a move leaves slot order unchanged', () => {
    const cruise = Cruise.createNew('Cruise', 1, makeCrewMembers(1))
      .updateMealPlan(plan => plan.addRecipe({ day: 1, slot: MealType.DINNER, recipe: Recipie.create(recipe()), portions: 1 }))
      .updateMealPlan(plan => plan.addRecipe({ day: 1, slot: MealType.BREAKFAST, recipe: Recipie.create(recipe()), portions: 2 }));
    const assignment = menu(cruise)[0];
    expect(cruise.updateMealPlan(plan => plan.moveRecipe({ assignment, to: { day: 1, slot: MealType.DINNER } }))).toBe(cruise);
  });

  it('should detach predefined data and later inputs without freezing callers', () => {
    const sourceRecipe = JSON.parse(JSON.stringify(recipe()));
    const days = [{ dayNumber: 1, recipes: [{ originalRecipeId: sourceRecipe.id, recipe: Recipie.fromData(sourceRecipe), crewCount: 1, mealSlot: MealType.DINNER }] }];
    const supplies = [{ id: 'water', amount: 3, isPerPerson: false, isPerDay: false }];
    const original = Cruise.createNew('Cruise', 1, [], days, supplies);
    sourceRecipe.ingredients[0].amount = 999;
    supplies[0].amount = 999;
    days[0].recipes[0].crewCount = 999;
    expect(menu(original)[0].recipe.ingredients[0].amount).toBe(100);
    expect(menu(original)[0].portions).toBe(1);
    expect(original.supplies.entries[0].amount).toBe(3);
    expect(Object.isFrozen(sourceRecipe.ingredients[0])).toBe(false);
    expect(Object.isFrozen(supplies[0])).toBe(false);
    expect(Object.isFrozen(original.mealPlan.days[0].recipes[0].recipe.ingredients[0])).toBe(true);
    const crew = [{ ...makeCrewMembers(1)[0], excludedSupplies: ['milk'] }];
    const updated = original.replaceCrew(Crew.fromMembers(crew));
    crew[0].excludedSupplies.push('egg');
    expect(updated.crew.members[0].excludedSupplies).toEqual(['milk']);
    expect(Object.isFrozen(crew[0].excludedSupplies)).toBe(false);
    expect(updated.mealPlan.days).toBe(original.mealPlan.days);
    expect(updated.supplies.entries).toBe(original.supplies.entries);
    const added = updated.updateMealPlan(plan => plan.addRecipe({ day: 1, slot: MealType.DINNER, recipe: Recipie.create(sourceRecipe), portions: 1 }));
    sourceRecipe.ingredients[0].amount = 5;
    expect(menu(added)[1].recipe.ingredients[0].amount).toBe(999);
  });

  it('should edit duplicate assignments independently and keep equal drafts unchanged', () => {
    const cruise = Cruise.createNew('Cruise', 1, makeCrewMembers(1))
      .updateMealPlan(plan => plan.addRecipe({ day: 1, slot: MealType.DINNER, recipe: Recipie.create(recipe()), portions: 1 }))
      .updateMealPlan(plan => plan.addRecipe({ day: 1, slot: MealType.DINNER, recipe: Recipie.create(recipe()), portions: 1 }));
    const [first, second] = menu(cruise);
    for (const changes of [{}, { name: first.recipe.name }, { ingredients: first.recipe.ingredients.map(item => ({ ...item })) }]) {
      const unchanged = cruise.updateMealPlan(plan => plan.editAssignedRecipe({ assignment: first, changes }));
      expect(unchanged).toBe(cruise);
      expect(unchanged.dateModified).toBe(cruise.dateModified);
    }
    const ingredients = [{ id: 'different', amount: 2 }];
    const edited = cruise.updateMealPlan(plan => plan.editAssignedRecipe({ assignment: first, changes: { name: 'Changed', ingredients } }));
    ingredients[0].amount = 10;
    expect(menu(edited)[0].recipe.ingredients[0].amount).toBe(2);
    expect(menu(edited)[1].recipe).toBe(second.recipe);
    expect(menu(cruise)[0].recipe.name).toBe('Recipe');
    for (const ingredients of [[{ ...first.recipe.ingredients[0], id: 'other' }], [{ ...first.recipe.ingredients[0], amount: 2 }]]) {
      expect(menu(cruise.updateMealPlan(plan => plan.editAssignedRecipe({ assignment: first, changes: { ingredients } })))[0].recipe.ingredients).toEqual(ingredients);
    }
  });

  it('should retain amount when scaling without collision across both flags', () => {
    const cruise = Cruise.createNew('Cruise', 1, [], undefined, [
      { id: 'water', amount: 3, isPerPerson: false, isPerDay: false },
      { id: 'water', amount: 5, isPerPerson: true, isPerDay: false },
    ]);
    const changed = cruise.updateSupplies(supplies => supplies.changeScaling({ supply: cruise.supplies.entries[0], perPerson: true, perDay: true }));
    expect(changed.supplies.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ amount: 3, isPerPerson: true, isPerDay: true }),
      expect.objectContaining({ amount: 5, isPerPerson: true, isPerDay: false }),
    ]));
    expect(cruise.supplies.entries[0].isPerDay).toBe(false);
  });

  it('should treat equal crew values as unchanged regardless of property order', () => {
    const cruise = Cruise.createNew('Cruise', 1, [{ id: 'a', name: 'Anna', diet: 'omnivore', excludedSupplies: ['milk', 'egg'] }]);
    const equalCrew = [{ name: 'Anna', diet: 'omnivore' as const, excludedSupplies: ['milk', 'egg'], id: 'a' }];
    expect(cruise.replaceCrew(Crew.fromMembers(equalCrew))).toBe(cruise);
    expect(cruise.replaceCrew(Crew.fromMembers([{ ...equalCrew[0], excludedSupplies: ['egg', 'milk'] }]))).not.toBe(cruise);
  });

  it('should target a crew member by ID after an earlier member is removed', () => {
    const cruise = Cruise.createNew('Cruise', 1, [
      { id: 'a', name: 'Anna', diet: 'omnivore' },
      { id: 'b', name: 'Beata', diet: 'omnivore' },
    ]);
    const exclusions = ['milk'];
    const draft = cruise.crew.removeMember('a').renameMember('b', 'Barbara')
      .changeDiet('b', 'vegan').changeExclusions('b', exclusions);
    exclusions.push('egg');

    expect(draft.members).toEqual([{ id: 'b', name: 'Barbara', diet: 'vegan', excludedSupplies: ['milk'] }]);
    expect(cruise.crew.members.map(member => member.name)).toEqual(['Anna', 'Beata']);
    expect(draft.renameMember('a', 'Missing').removeMember('a').changeDiet('b', 'vegan')).toBe(draft);
    expect(cruise.replaceCrew(cruise.crew.renameMember('b', 'Barbara').renameMember('b', 'Beata'))).toBe(cruise);
    expect(restoreCruise(JSON.parse(JSON.stringify(cruise.replaceCrew(draft)))).crew.members).toEqual(draft.members);
  });

  it('should repair legacy member IDs only in the editable draft', () => {
    const cruise = restoreCruise(Cruise.createNew('Cruise', 1, [
      { id: 'a', name: 'Anna', diet: 'omnivore' },
      { id: '', name: 'Beata', diet: 'omnivore' },
      { id: 'a', name: 'Celina', diet: 'vegan' },
    ]).toJSON());
    const draft = cruise.crew.forEditing();
    const ids = draft.members.map(member => member.id);
    expect(ids[0]).toBe('a');
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(draft.members.length);
    expect(draft.forEditing()).toBe(draft);

    const saved = cruise.replaceCrew(draft.removeMember(ids[1]).renameMember(ids[2], 'Cecylia'));
    expect(saved.crew.members.map(({ id, name }) => [id, name])).toEqual([['a', 'Anna'], [ids[2], 'Cecylia']]);
    expect(cruise.crew.members.map(member => member.id)).toEqual(['a', '', 'a']);
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
      const updated = cruise.replaceCrew(Crew.fromMembers(replacement));
      expect(updated.crew.members[1]).toEqual(replacement[1]);
      expect(updated).not.toBe(cruise);
    }
    expect(cruise.replaceCrew(Crew.fromMembers(crew.map(member => ({ ...member, excludedSupplies: [...member.excludedSupplies] }))))).toBe(cruise);
  });

  it('should filter assignments by slot and reorder within a slot', () => {
    const cruise = Cruise.createNew('Cruise', 2, [])
      .updateMealPlan(plan => plan.addRecipe({ day: 1, slot: MealType.DINNER, recipe: Recipie.create(recipe()), portions: 1 }))
      .updateMealPlan(plan => plan.addRecipe({ day: 1, slot: MealType.BREAKFAST, recipe: Recipie.create(recipe()), portions: 2 }))
      .updateMealPlan(plan => plan.addRecipe({ day: 1, slot: MealType.DINNER, recipe: Recipie.create(recipe()), portions: 3 }));
    const [first, last] = menu(cruise);
    const breakfast = menu(cruise, 1, MealType.BREAKFAST)[0];
    expect(menu(cruise, 3)).toEqual([]);
    expect(menu(cruise).map(item => item.portions)).toEqual([1, 3]);
    expect(menu(cruise.updateMealPlan(plan => plan.moveRecipe({ assignment: last, to: { day: 1, slot: MealType.DINNER }, before: first }))).map(item => item.portions)).toEqual([3, 1]);
    expect(cruise.updateMealPlan(plan => plan.moveRecipe({ assignment: first, to: { day: 1, slot: MealType.DINNER }, before: breakfast }))).toBe(cruise);
    expect(cruise.updateMealPlan(plan => plan.moveRecipe({ assignment: first, to: { day: 2, slot: MealType.DINNER }, before: last }))).toBe(cruise);
    expect(cruise.updateMealPlan(plan => plan.moveRecipe({ assignment: first, to: { day: 3, slot: MealType.DINNER } }))).toBe(cruise);
    expect(cruise.updateMealPlan(plan => plan.moveRecipe({ assignment: first, to: { day: 1, slot: MealType.DINNER }, before: first }))).toBe(cruise);
  });

});
