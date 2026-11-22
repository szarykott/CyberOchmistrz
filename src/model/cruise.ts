import { CrewMember } from "./crew";
import { Recipie, MealType } from "./recipe";
import { AdditionalSupplyCategoryGroup, AdditionalSupplyItem } from "./supply";
import { getSupplyById } from './supplyData';
import { createRecipie } from "./recipieData";
import { produce, castDraft } from 'immer';

export class Cruise {
  private constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly dateCreated: string,
    public readonly dateModified: string,
    public readonly crewMembers: readonly CrewMember[],
    public readonly days: readonly CruiseDay[],
    public readonly additionalSupplies: readonly CruiseSupply[],
    public readonly startDate?: string, // YYYY-MM-DD format
  ) { Object.freeze(this); }

  // cruise details

  public static createNew(
    name: string,
    length: number,
    crewMembers: CrewMember[],
    predefinedDays?: CruiseDay[],
    predefinedAdditionalSupplies?: CruiseSupply[],
    startDate?: string,
  ): Cruise {
    if (predefinedDays && length != predefinedDays.length) {
      throw new Error("when inserting days directly, length must match exactly")
    }

    const now = new Date().toISOString();

    const days = predefinedDays ?? Array.from({ length }, (_, i) => ({
      dayNumber: i + 1,
      recipes: [],
    }));

    return new Cruise(
      newId(),
      name,
      now,
      now,
      owned(crewMembers),
      ownDays(days),
      owned(predefinedAdditionalSupplies ?? []),
      startDate,
    );
  }

  public static fromData(input: unknown): Cruise {
    if (!isCruiseData(input)) throw new Error('Nieprawidłowe dane rejsu');
    const data = input;
    return new Cruise(
      data.id,
      data.name,
      data.dateCreated,
      data.dateModified,
      owned(data.crewMembers),
      ownDays(data.days),
      owned(data.additionalSupplies ?? []),
      data.startDate,
    );
  }

  private with(modifiedValues: Partial<Omit<Cruise, 'id' | 'dateCreated'>>): Cruise {
    const name = modifiedValues.name ?? this.name;
    const crewMembers = modifiedValues.crewMembers ?? this.crewMembers;
    const days = modifiedValues.days ?? this.days;
    const additionalSupplies = modifiedValues.additionalSupplies ?? this.additionalSupplies;
    const startDate = 'startDate' in modifiedValues ? modifiedValues.startDate : this.startDate;

    // No-op: nothing changed, so keep the same instance. immer returns the same
    // array reference when a producer mutates nothing, so this catches no-op
    // updates (e.g. out-of-bounds reorder). Avoids a needless dateModified bump,
    // lets React skip re-render and saveCruise skip a redundant write.
    if (
      name === this.name &&
      crewMembers === this.crewMembers &&
      days === this.days &&
      additionalSupplies === this.additionalSupplies &&
      startDate === this.startDate
    ) {
      return this;
    }

    const now = new Date().toISOString()

    return new Cruise(
      this.id,
      name,
      this.dateCreated,
      now,
      crewMembers,
      days,
      additionalSupplies,
      startDate,
    )
  }

  public rename(name: string): Cruise {
    return this.with({ name });
  }

  public changeDuration(length: number): Cruise {
    const days = length === this.days.length
      ? this.days
      : length > this.days.length
        ? Object.freeze([
          ...this.days,
          ...owned(Array.from({ length: length - this.days.length }, (_, i) => ({
            dayNumber: i + this.days.length + 1,
            recipes: [],
          }))),
        ])
        : Object.freeze(this.days.filter(day => day.dayNumber <= length));
    return this.with({ days });
  }

  public replaceCrew(crewMembers: readonly CrewMember[]): Cruise {
    const unchanged = crewMembers.length === this.crewMembers.length &&
      crewMembers.every((member, i) => {
        const current = this.crewMembers[i];
        const exclusions = member.excludedSupplies;
        const currentExclusions = current.excludedSupplies;
        return member.id === current.id && member.name === current.name && member.diet === current.diet &&
          (exclusions === currentExclusions || (
            exclusions !== undefined && currentExclusions !== undefined &&
            exclusions.length === currentExclusions.length &&
            exclusions.every((id, index) => id === currentExclusions[index])
          ));
      });
    if (unchanged) return this;
    return this.with({ crewMembers: owned(crewMembers) });
  }

  public changeStartDate(startDate: string): Cruise {
    return this.with({ startDate });
  }

  public clearStartDate(): Cruise {
    return this.with({ startDate: undefined });
  }

  public getRecipeAssignments({ day, slot }: { day: number; slot: MealType }): readonly RecipeAssignment[] {
    return (this.days.find(d => d.dayNumber === day)?.recipes ?? [])
      .filter(entry => entry.mealSlot === slot)
      .map(entry => new AssignmentHandle(this.id, entry.assignmentId!, entry.recipeData, entry.crewCount));
  }

  private locate(assignment: RecipeAssignment): { day: number; index: number } | undefined {
    if (!(assignment instanceof AssignmentHandle) || assignment.cruiseId !== this.id) return undefined;
    for (let day = 0; day < this.days.length; day++) {
      const index = this.days[day].recipes.findIndex(entry => entry.assignmentId === assignment.key);
      if (index >= 0) return { day, index };
    }
    return undefined;
  }

  public addRecipe({ day, slot, recipe, portions }: {
    day: number; slot: MealType; recipe: Recipie; portions: number;
  }): Cruise {
    createRecipie(recipe);
    return this.with({
      days: produce(this.days, days => {
        const target = days.find(entry => entry.dayNumber === day);
        if (target) target.recipes.push(castDraft(owned({
          assignmentId: newId(),
          originalRecipeId: recipe.id,
          recipeData: recipe,
          crewCount: portions,
          mealSlot: slot,
        })));
      }),
    });
  }

  public editAssignedRecipe({ assignment, changes }: {
    assignment: RecipeAssignment; changes: { name?: string; ingredients?: Recipie['ingredients'] };
  }): Cruise {
    const location = this.locate(assignment);
    if (!location) return this;
    const recipe = this.days[location.day].recipes[location.index].recipeData;
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
    if (candidate.name === recipe.name && sameIngredients) return this;
    return this.with({
      days: produce(this.days, days => {
        days[location.day].recipes[location.index].recipeData = castDraft(owned(candidate));
      }),
    });
  }

  public changePortions({ assignment, portions }: { assignment: RecipeAssignment; portions: number }): Cruise {
    const location = this.locate(assignment);
    if (!location) return this;
    return this.with({
      days: produce(this.days, days => {
        days[location.day].recipes[location.index].crewCount = portions;
      }),
    });
  }

  public moveRecipe({ assignment, to, before }: {
    assignment: RecipeAssignment; to: { day: number; slot: MealType }; before?: RecipeAssignment;
  }): Cruise {
    const source = this.locate(assignment);
    const targetDay = this.days.findIndex(day => day.dayNumber === to.day);
    const target = before ? this.locate(before) : undefined;
    if (
      !source || targetDay < 0 ||
      (before && (!target || target.day !== targetDay ||
        this.days[target.day].recipes[target.index].mealSlot !== to.slot))
    ) return this;
    if (before && assignment.key === before.key) return this;
    const original = this.days[source.day].recipes[source.index];
    const targetRecipes = this.days[targetDay].recipes;
    const resulting = targetRecipes.filter(entry => entry.assignmentId !== assignment.key);
    const insert = before ? resulting.findIndex(entry => entry.assignmentId === before.key) : resulting.length;
    resulting.splice(insert, 0, original);
    if (source.day === targetDay && original.mealSlot === to.slot) {
      const originalSlot = targetRecipes.filter(entry => entry.mealSlot === to.slot);
      const resultingSlot = resulting.filter(entry => entry.mealSlot === to.slot);
      if (resultingSlot.every((entry, i) => entry === originalSlot[i])) return this;
    }
    return this.with({
      days: produce(this.days, days => {
        const [entry] = days[source.day].recipes.splice(source.index, 1);
        entry.mealSlot = to.slot;
        const entries = days[targetDay].recipes;
        const index = before ? entries.findIndex(item => item.assignmentId === before.key) : entries.length;
        entries.splice(index, 0, entry);
      }),
    });
  }

  public changeAdditionalSupplyScaling({ supply, perPerson, perDay }: {
    supply: CruiseSupply; perPerson: boolean; perDay: boolean;
  }): Cruise {
    const source = this.additionalSupplies.find(item => idsEqual(item, supply));
    if (!source || (source.isPerPerson === perPerson && source.isPerDay === perDay)) return this;
    return this.with({
      additionalSupplies: produce(this.additionalSupplies, entries => {
        const index = entries.findIndex(item => idsEqual(item, source));
        const [item] = entries.splice(index, 1);
        const target = entries.find(entry => idsEqual(entry, {
          id: item.id, isPerPerson: perPerson, isPerDay: perDay,
        }));
        if (target) target.amount += item.amount;
        else entries.splice(index, 0, { ...item, isPerPerson: perPerson, isPerDay: perDay });
      }),
    });
  }

  // receipes

  public removeRecipe({ assignment }: { assignment: RecipeAssignment }): Cruise {
    const location = this.locate(assignment);
    if (!location) return this;
    return this.with({
      days: produce(this.days, days => {
        days[location.day].recipes.splice(location.index, 1);
      }),
    });
  }

  public willLengthReductionRemoveRecipes(newLength: number): boolean {
    if (newLength >= this.days.length) return false;

    return this.days.some(day => day.dayNumber > newLength && day.recipes.length > 0);
  }

  // additional supplies

  public upsertAdditionalSupply(supply: CruiseSupply): Cruise {
    return this.with({
      additionalSupplies: produce(this.additionalSupplies, additionalSupplies => {
        const existingSupplyIndex = additionalSupplies.findIndex((s) => idsEqual(s, supply));
        if (existingSupplyIndex >= 0) {
          additionalSupplies[existingSupplyIndex].amount = supply.amount;
        } else {
          additionalSupplies.push(owned(supply));
        }
      })
    });
  }

  public addAdditionalSupply(supply: CruiseSupply): Cruise {
    return this.with({
      additionalSupplies: produce(this.additionalSupplies, additionalSupplies => {
        const existingSupplyIndex = additionalSupplies.findIndex((s) => idsEqual(s, supply));
        if (existingSupplyIndex >= 0) {
          additionalSupplies[existingSupplyIndex].amount += supply.amount;
        } else {
          additionalSupplies.push(owned(supply));
        }
      })
    });
  }

  public removeAdditionalSupply(
    supplyId: string,
    isPerPerson: boolean,
    isPerDay: boolean,
  ): Cruise {
    return this.with({
      additionalSupplies: produce(this.additionalSupplies, additionalSupplies => {
        const existingSupplyIndex = additionalSupplies.findIndex((s) => idsEqual(s, { id: supplyId, isPerDay, isPerPerson }));
        if (existingSupplyIndex >= 0) {
          additionalSupplies.splice(existingSupplyIndex, 1);
        }
      })
    });
  }

  public hasAdditionalSupply(
    supplyId: string,
    isPerPerson: boolean,
    isPerDay: boolean,
  ): boolean {
    return this.additionalSupplies.some((s) => idsEqual(s, { id: supplyId, isPerDay, isPerPerson }));
  }

  public getAdditionalSupplyAmount(
    supplyId: string,
    isPerPerson: boolean,
    isPerDay: boolean,
  ): number | null {
    const item = this.additionalSupplies.find((s) => idsEqual(s, { id: supplyId, isPerDay, isPerPerson }));

    return item ? item.amount : null;
  }

  public groupAdditionalSuppliesByCategory(): AdditionalSupplyCategoryGroup[] {
    const grouped: { [key: string]: AdditionalSupplyItem[] } = {};

    this.additionalSupplies.forEach((item) => {
      const supplyDetails = getSupplyById(item.id);
      if (supplyDetails) {
        const category =
          supplyDetails.category ||
          (supplyDetails.isIngredient ? "inne" : "Pozostałe produkty");

        if (!grouped[category]) {
          grouped[category] = [];
        }

        grouped[category].push({
          supply: supplyDetails,
          amount: item.amount,
          isPerPerson: item.isPerPerson,
          isPerDay: item.isPerDay,
        });
      }
    });

    // Convert to array and sort by category name for consistent display order
    return Object.keys(grouped)
      .sort()
      .map((category) => ({
        category,
        supplies: grouped[category].sort((a, b) => {
          // First sort by supply name
          const nameComparison = a.supply.name.localeCompare(b.supply.name, "pl");
          if (nameComparison !== 0) {
            return nameComparison;
          }

          // If names are equal, sort by flag combination priority: fixed -> per person -> per day -> per person per day
          const getPriority = (item: AdditionalSupplyItem) => {
            if (!item.isPerPerson && !item.isPerDay) return 0; // fixed
            if (item.isPerPerson && !item.isPerDay) return 1; // per person
            if (!item.isPerPerson && item.isPerDay) return 2; // per day
            return 3; // per person per day
          };

          return getPriority(a) - getPriority(b);
        }),
      }));
  }
}

export interface CruiseDay {
  readonly dayNumber: number;
  readonly recipes: readonly CruiseDayRecipe[];
}

export interface CruiseSupply {
  readonly id: string;
  readonly amount: number;
  readonly isPerPerson: boolean;
  readonly isPerDay: boolean;
}

type CruiseSupplyKey = Pick<CruiseSupply, "id" | "isPerDay" | "isPerPerson">;

function idsEqual(a: CruiseSupplyKey, b: CruiseSupplyKey): boolean {
  return a.id === b.id && a.isPerDay === b.isPerDay && a.isPerPerson === b.isPerPerson;
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

type CruiseData = Pick<Cruise, 'id' | 'name' | 'dateCreated' | 'dateModified' | 'crewMembers' | 'days' | 'startDate'> & {
  additionalSupplies?: readonly CruiseSupply[];
};

function isCruiseData(value: unknown): value is CruiseData {
  const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
  const string = (v: unknown): v is string => typeof v === 'string';
  const number = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const array = (v: unknown, check: (item: unknown) => boolean): boolean => Array.isArray(v) && v.every(check);
  const slot = (v: unknown): boolean => Object.values(MealType).some(item => item === v);
  const optional = (v: unknown, check: (item: unknown) => boolean): boolean => v === undefined || check(v);
  const recipe = (v: unknown): boolean => record(v) && string(v.id) && string(v.name) && string(v.description)
    && number(v.difficulty) && array(v.mealType, slot) && array(v.instructions, string)
    && optional(v.developedBy, string) && optional(v.modifiedBy, item => array(item, string))
    && array(v.ingredients, item => record(item) && string(item.id) && number(item.amount));
  const assignment = (v: unknown): boolean => record(v) && optional(v.assignmentId, string)
    && string(v.originalRecipeId) && number(v.crewCount) && slot(v.mealSlot) && recipe(v.recipeData);
  const crew = (v: unknown): boolean => record(v) && string(v.id) && string(v.name)
    && (v.diet === 'omnivore' || v.diet === 'vegetarian' || v.diet === 'vegan')
    && optional(v.excludedSupplies, item => array(item, string));
  const supply = (v: unknown): boolean => record(v) && string(v.id) && number(v.amount)
    && typeof v.isPerPerson === 'boolean' && typeof v.isPerDay === 'boolean';
  const date = (v: unknown): boolean => string(v) && Number.isFinite(Date.parse(v));
  const calendarDate = (v: unknown): boolean => {
    if (!string(v) || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const parsed = new Date(`${v}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === v;
  };
  if (!(record(value) && string(value.id) && string(value.name) && date(value.dateCreated) && date(value.dateModified)
    && optional(value.startDate, calendarDate) && array(value.crewMembers, crew)
    && Array.isArray(value.days) && value.days.every((day, index) => record(day)
      && day.dayNumber === index + 1 && array(day.recipes, assignment))
    && optional(value.additionalSupplies, item => array(item, supply)))) return false;
  const days = value.days as CruiseDay[];
  const ids = days.flatMap(day => day.recipes.flatMap(entry => entry.assignmentId === undefined ? [] : [entry.assignmentId]));
  return new Set(ids).size === ids.length;
}

function newId(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function owned<T>(value: T): T {
  const copy = JSON.parse(JSON.stringify(value)) as T;
  const freeze = (item: unknown): void => {
    if (item && typeof item === 'object') {
      Object.values(item).forEach(freeze);
      Object.freeze(item);
    }
  };
  freeze(copy);
  return copy;
}

function ownDays(days: readonly CruiseDay[]): readonly CruiseDay[] {
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
