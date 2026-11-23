import type { Recipie, MealType } from '../recipe';
import { createRecipie } from '../recipieData';
import { produce, castDraft } from 'immer';
import type { Cruise } from './index';
import { owned, newId } from './internals';

export interface CruiseDay {
  readonly dayNumber: number;
  readonly recipes: readonly CruiseDayRecipe[];
}

export interface CruiseDayRecipe {
  readonly assignmentId?: string;
  readonly originalRecipeId: string;
  readonly recipeData: Recipie; // required: snapshot taken at add-time
  readonly crewCount: number;
  readonly mealSlot: MealType;
}

export interface RecipeAssignment {
  readonly key: string;
  readonly recipe: Recipie;
  readonly portions: number;
}

class AssignmentHandle implements RecipeAssignment {
  constructor(
    readonly cruiseId: string,
    readonly key: string,
    readonly recipe: Recipie,
    readonly portions: number,
  ) { Object.freeze(this); }
}

function locate(days: readonly CruiseDay[], cruiseId: string, assignment: RecipeAssignment): { day: number; index: number } | undefined {
  if (!(assignment instanceof AssignmentHandle) || assignment.cruiseId !== cruiseId) return undefined;
  for (let day = 0; day < days.length; day++) {
    const index = days[day].recipes.findIndex(entry => entry.assignmentId === assignment.key);
    if (index >= 0) return { day, index };
  }
  return undefined;
}

export function createDays(length: number, predefinedDays?: CruiseDay[]): readonly CruiseDay[] {
  if (predefinedDays && length != predefinedDays.length) {
    throw new Error("when inserting days directly, length must match exactly")
  }

  return predefinedDays ?? Array.from({ length }, (_, i) => ({
    dayNumber: i + 1,
    recipes: [],
  }));
}

export function ownDays(days: readonly CruiseDay[]): readonly CruiseDay[] {
  const ids = new Set(days.flatMap(day => day.recipes.flatMap(entry => entry.assignmentId === undefined ? [] : [entry.assignmentId])));
  return owned(days.map((day, dayIndex) => ({ ...day, recipes: day.recipes.map((entry, index) => ({
    ...entry, assignmentId: entry.assignmentId ?? legacyId(dayIndex, index, ids),
  })) })));
}

function legacyId(day: number, index: number, ids: Set<string>): string {
  let id = `legacy:${day}:${index}`;
  while (ids.has(id)) id += ':';
  ids.add(id);
  return id;
}

export class MealPlan {
  readonly #days: readonly CruiseDay[];
  readonly #cruiseId: string;
  readonly #commit: (days: readonly CruiseDay[]) => Cruise;

  constructor(cruiseId: string, days: readonly CruiseDay[], commit: (days: readonly CruiseDay[]) => Cruise) {
    this.#cruiseId = cruiseId;
    this.#days = days;
    this.#commit = commit;
    Object.freeze(this);
  }

  get days(): readonly CruiseDay[] {
    return this.#days;
  }

  changeDuration(length: number): Cruise {
    const days = this.#days;
    if (length === days.length) return this.#commit(days);
    const resized = length > days.length
      ? Object.freeze([
        ...days,
        ...owned(Array.from({ length: length - days.length }, (_, i) => ({
          dayNumber: i + days.length + 1,
          recipes: [],
        }))),
      ])
      : Object.freeze(days.filter(day => day.dayNumber <= length));
    return this.#commit(resized);
  }

  getRecipeAssignments({ day, slot }: { day: number; slot: MealType }): readonly RecipeAssignment[] {
    return (this.#days.find(d => d.dayNumber === day)?.recipes ?? [])
      .filter(entry => entry.mealSlot === slot)
      .map(entry => new AssignmentHandle(this.#cruiseId, entry.assignmentId!, entry.recipeData, entry.crewCount));
  }

  addRecipe({ day, slot, recipe, portions }: {
    day: number; slot: MealType; recipe: Recipie; portions: number;
  }): Cruise {
    createRecipie(recipe);
    return this.#commit(produce(this.#days, draft => {
      const target = draft.find(entry => entry.dayNumber === day);
      if (target) target.recipes.push(castDraft(owned({
        assignmentId: newId(),
        originalRecipeId: recipe.id,
        recipeData: recipe,
        crewCount: portions,
        mealSlot: slot,
      })));
    }));
  }

  editAssignedRecipe({ assignment, changes }: {
    assignment: RecipeAssignment; changes: { name?: string; ingredients?: Recipie['ingredients'] };
  }): Cruise {
    const location = locate(this.#days, this.#cruiseId, assignment);
    if (!location) return this.#commit(this.#days);
    const recipe = this.#days[location.day].recipes[location.index].recipeData;
    const candidate = {
      ...recipe,
      name: changes.name ?? recipe.name,
      ingredients: changes.ingredients ?? recipe.ingredients,
    };
    createRecipie(candidate);
    const sameIngredients = candidate.ingredients.length === recipe.ingredients.length &&
      candidate.ingredients.every((item, i) =>
        item.id === recipe.ingredients[i].id && item.amount === recipe.ingredients[i].amount
      );
    if (candidate.name === recipe.name && sameIngredients) return this.#commit(this.#days);
    return this.#commit(produce(this.#days, draft => {
      draft[location.day].recipes[location.index].recipeData = castDraft(owned(candidate));
    }));
  }

  changePortions({ assignment, portions }: { assignment: RecipeAssignment; portions: number }): Cruise {
    const location = locate(this.#days, this.#cruiseId, assignment);
    if (!location) return this.#commit(this.#days);
    return this.#commit(produce(this.#days, draft => {
      draft[location.day].recipes[location.index].crewCount = portions;
    }));
  }

  moveRecipe({ assignment, to, before }: {
    assignment: RecipeAssignment; to: { day: number; slot: MealType }; before?: RecipeAssignment;
  }): Cruise {
    const source = locate(this.#days, this.#cruiseId, assignment);
    const targetDay = this.#days.findIndex(day => day.dayNumber === to.day);
    const target = before ? locate(this.#days, this.#cruiseId, before) : undefined;
    if (
      !source || targetDay < 0 ||
      (before && (!target || target.day !== targetDay ||
        this.#days[target.day].recipes[target.index].mealSlot !== to.slot))
    ) return this.#commit(this.#days);
    if (before && assignment.key === before.key) return this.#commit(this.#days);
    const original = this.#days[source.day].recipes[source.index];
    const targetRecipes = this.#days[targetDay].recipes;
    const resulting = targetRecipes.filter(entry => entry.assignmentId !== assignment.key);
    const insert = before ? resulting.findIndex(entry => entry.assignmentId === before.key) : resulting.length;
    resulting.splice(insert, 0, original);
    if (source.day === targetDay && original.mealSlot === to.slot) {
      const originalSlot = targetRecipes.filter(entry => entry.mealSlot === to.slot);
      const resultingSlot = resulting.filter(entry => entry.mealSlot === to.slot);
      if (resultingSlot.every((entry, i) => entry === originalSlot[i])) return this.#commit(this.#days);
    }
    return this.#commit(produce(this.#days, draft => {
      const [entry] = draft[source.day].recipes.splice(source.index, 1);
      entry.mealSlot = to.slot;
      const entries = draft[targetDay].recipes;
      const index = before ? entries.findIndex(item => item.assignmentId === before.key) : entries.length;
      entries.splice(index, 0, entry);
    }));
  }

  removeRecipe({ assignment }: { assignment: RecipeAssignment }): Cruise {
    const location = locate(this.#days, this.#cruiseId, assignment);
    if (!location) return this.#commit(this.#days);
    return this.#commit(produce(this.#days, draft => {
      draft[location.day].recipes.splice(location.index, 1);
    }));
  }

  willLengthReductionRemoveRecipes(newLength: number): boolean {
    if (newLength >= this.#days.length) return false;

    return this.#days.some(day => day.dayNumber > newLength && day.recipes.length > 0);
  }
}
