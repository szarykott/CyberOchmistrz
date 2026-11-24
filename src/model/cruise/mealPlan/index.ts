import { Recipie, type MealType, type RecipieData, type RecipieChanges } from '../../recipe';
import { produce, castDraft } from 'immer';
import { newId } from '../internals';

export interface CruiseDayData {
  readonly dayNumber: number;
  readonly recipes: readonly (Omit<CruiseDayRecipe, 'recipe'> & { readonly recipeData: RecipieData })[];
}

export interface CruiseDay {
  readonly dayNumber: number;
  readonly recipes: readonly CruiseDayRecipe[];
}

export interface CruiseDayRecipe {
  readonly assignmentId?: string;
  readonly originalRecipeId: string;
  readonly recipe: Recipie; // required: snapshot taken at add-time
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

function legacyId(day: number, index: number, ids: Set<string>): string {
  let id = `legacy:${day}:${index}`;
  while (ids.has(id)) id += ':';
  ids.add(id);
  return id;
}

export class MealPlan {
  readonly #days: readonly CruiseDay[];
  readonly #cruiseId: string;

  private constructor(cruiseId: string, days: readonly CruiseDay[]) {
    this.#cruiseId = cruiseId;
    this.#days = days;
    Object.freeze(this);
  }

  static create(cruiseId: string, length: number, predefinedDays?: readonly CruiseDay[]): MealPlan {
    if (predefinedDays && length !== predefinedDays.length) {
      throw new Error("when inserting days directly, length must match exactly");
    }

    const days = predefinedDays ?? Array.from({ length }, (_, i) => ({ dayNumber: i + 1, recipes: [] }));
    const ids = new Set(days.flatMap(day => day.recipes.flatMap(entry => entry.assignmentId === undefined ? [] : [entry.assignmentId])));
    return new MealPlan(cruiseId, Object.freeze(days.map((day, dayIndex) => Object.freeze({
      dayNumber: day.dayNumber,
      recipes: Object.freeze(day.recipes.map((entry, index) => Object.freeze({
        assignmentId: entry.assignmentId ?? legacyId(dayIndex, index, ids),
        originalRecipeId: entry.originalRecipeId,
        recipe: entry.recipe,
        crewCount: entry.crewCount,
        mealSlot: entry.mealSlot,
      }))),
    }))));
  }

  static fromData(cruiseId: string, days: readonly CruiseDayData[]): MealPlan {
    return MealPlan.create(cruiseId, days.length, days.map(day => ({
      dayNumber: day.dayNumber,
      recipes: day.recipes.map(({ recipeData, ...entry }) => ({ ...entry, recipe: Recipie.fromData(recipeData) })),
    })));
  }

  belongsTo(cruiseId: string): boolean {
    return this.#cruiseId === cruiseId;
  }

  #with(days: readonly CruiseDay[]): MealPlan {
    return days === this.#days ? this : new MealPlan(this.#cruiseId, days);
  }

  get duration(): number {
    return this.#days.length;
  }

  toJSON(): CruiseDayData[] {
    return this.#days.map(day => ({
      dayNumber: day.dayNumber,
      recipes: day.recipes.map(({ recipe, ...entry }) => ({ ...entry, recipeData: recipe.toJSON() })),
    }));
  }

  get days(): readonly CruiseDay[] {
    return this.#days;
  }

  changeDuration(length: number): MealPlan {
    const days = this.#days;
    if (length === days.length) return this;
    const resized = length > days.length
      ? Object.freeze([
        ...days,
        ...Array.from({ length: length - days.length }, (_, i) => Object.freeze({
          dayNumber: i + days.length + 1,
          recipes: Object.freeze([]),
        })),
      ])
      : Object.freeze(days.filter(day => day.dayNumber <= length));
    return this.#with(resized);
  }

  getRecipeAssignments({ day, slot }: { day: number; slot: MealType }): readonly RecipeAssignment[] {
    return Object.freeze((this.#days.find(d => d.dayNumber === day)?.recipes ?? [])
      .filter(entry => entry.mealSlot === slot)
      .map(entry => new AssignmentHandle(this.#cruiseId, entry.assignmentId!, entry.recipe, entry.crewCount)));
  }

  addRecipe({ day, slot, recipe, portions }: {
    day: number; slot: MealType; recipe: Recipie; portions: number;
  }): MealPlan {
    Recipie.requireIngredients(recipe.ingredients);
    return this.#with(produce(this.#days, draft => {
      const target = draft.find(entry => entry.dayNumber === day);
      if (target) target.recipes.push(castDraft({
        assignmentId: newId(),
        originalRecipeId: recipe.id,
        recipe,
        crewCount: portions,
        mealSlot: slot,
      }));
    }));
  }

  editAssignedRecipe({ assignment, changes }: {
    assignment: RecipeAssignment; changes: RecipieChanges;
  }): MealPlan {
    const location = locate(this.#days, this.#cruiseId, assignment);
    if (!location) return this;
    const recipe = this.#days[location.day].recipes[location.index].recipe;
    const candidate = recipe.withChanges(changes);
    if (candidate === recipe) return this;
    return this.#with(produce(this.#days, draft => {
      draft[location.day].recipes[location.index].recipe = castDraft(candidate);
    }));
  }

  changePortions({ assignment, portions }: { assignment: RecipeAssignment; portions: number }): MealPlan {
    const location = locate(this.#days, this.#cruiseId, assignment);
    if (!location) return this;
    return this.#with(produce(this.#days, draft => {
      draft[location.day].recipes[location.index].crewCount = portions;
    }));
  }

  moveRecipe({ assignment, to, before }: {
    assignment: RecipeAssignment; to: { day: number; slot: MealType }; before?: RecipeAssignment;
  }): MealPlan {
    const source = locate(this.#days, this.#cruiseId, assignment);
    const targetDay = this.#days.findIndex(day => day.dayNumber === to.day);
    const target = before ? locate(this.#days, this.#cruiseId, before) : undefined;
    if (
      !source || targetDay < 0 ||
      (before && (!target || target.day !== targetDay ||
        this.#days[target.day].recipes[target.index].mealSlot !== to.slot))
    ) return this;
    if (before && assignment.key === before.key) return this;
    const original = this.#days[source.day].recipes[source.index];
    const targetRecipes = this.#days[targetDay].recipes;
    const resulting = targetRecipes.filter(entry => entry.assignmentId !== assignment.key);
    const insert = before ? resulting.findIndex(entry => entry.assignmentId === before.key) : resulting.length;
    resulting.splice(insert, 0, original);
    if (source.day === targetDay && original.mealSlot === to.slot) {
      const originalSlot = targetRecipes.filter(entry => entry.mealSlot === to.slot);
      const resultingSlot = resulting.filter(entry => entry.mealSlot === to.slot);
      if (resultingSlot.every((entry, i) => entry === originalSlot[i])) return this;
    }
    return this.#with(produce(this.#days, draft => {
      const [entry] = draft[source.day].recipes.splice(source.index, 1);
      entry.mealSlot = to.slot;
      const entries = draft[targetDay].recipes;
      const index = before ? entries.findIndex(item => item.assignmentId === before.key) : entries.length;
      entries.splice(index, 0, entry);
    }));
  }

  removeRecipe({ assignment }: { assignment: RecipeAssignment }): MealPlan {
    const location = locate(this.#days, this.#cruiseId, assignment);
    if (!location) return this;
    return this.#with(produce(this.#days, draft => {
      draft[location.day].recipes.splice(location.index, 1);
    }));
  }

  willLengthReductionRemoveRecipes(newLength: number): boolean {
    if (newLength >= this.#days.length) return false;

    return this.#days.some(day => day.dayNumber > newLength && day.recipes.length > 0);
  }
}
