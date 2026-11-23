import { MealType } from "../recipe";
import type { CrewMember } from "../crew";
import { ownDays } from "./mealPlan";
import type { CruiseDay } from "./mealPlan";
import type { CruiseSupply } from "./supplies";
import { owned } from "./internals";

interface CruiseData {
  readonly id: string;
  readonly name: string;
  readonly dateCreated: string;
  readonly dateModified: string;
  readonly crewMembers: readonly CrewMember[];
  readonly days: readonly CruiseDay[];
  readonly additionalSupplies?: readonly CruiseSupply[];
  readonly startDate?: string;
}

interface RestoredCruiseData extends CruiseData {
  readonly additionalSupplies: readonly CruiseSupply[];
}

export function restoreCruiseData(input: unknown): RestoredCruiseData {
  if (!isCruiseData(input)) throw new Error('Nieprawidłowe dane rejsu');
  const data = input;
  return {
    id: data.id,
    name: data.name,
    dateCreated: data.dateCreated,
    dateModified: data.dateModified,
    crewMembers: owned(data.crewMembers),
    days: ownDays(data.days),
    additionalSupplies: owned(data.additionalSupplies ?? []),
    startDate: data.startDate,
  };
}

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
