import { MealType } from '../model/recipe';
import { Cruise, type CruiseData, type CruiseDayData } from '../model/cruise';

const STORAGE_KEY = 'cyber-ochmistrz-cruises';

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
  const days = value.days as CruiseDayData[];
  const ids = days.flatMap(day => day.recipes.flatMap(entry => entry.assignmentId === undefined ? [] : [entry.assignmentId]));
  return new Set(ids).size === ids.length;
}

export function restoreCruise(input: unknown): Cruise {
  if (!isCruiseData(input)) throw new Error('Nieprawidłowe dane rejsu');
  return Cruise.fromData(input);
}

function readCruises(): Cruise[] {
  if (typeof window === 'undefined') return [];

  const storedCruises = localStorage.getItem(STORAGE_KEY);
  if (!storedCruises) return [];

  const data: unknown = JSON.parse(storedCruises);
  if (!Array.isArray(data)) throw new Error('Nieprawidłowa lista rejsów');
  return data.map(restoreCruise);
}

export const cruiseRepository = {
  exportToFile(cruise: Cruise): void {
    const json = JSON.stringify(cruise, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `rejs-${cruise.name}.json`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },

  async importFromFile(file: File): Promise<Cruise> {
    const text = await file.text();
    const parsed: unknown = JSON.parse(text);
    return restoreCruise(parsed);
  },

  async getAll(): Promise<Cruise[]> {
    return readCruises();
  },

  async getById(id: string): Promise<Cruise | undefined> {
    return readCruises().find(cruise => cruise.id === id);
  },

  async save(cruise: Cruise): Promise<void> {
    if (typeof window === 'undefined') return;

    const restored = restoreCruise(cruise.toJSON());
    const cruises = readCruises();
    const existingIndex = cruises.findIndex(c => c.id === restored.id);

    if (existingIndex < 0) {
      cruises.push(restored);
    } else {
      cruises[existingIndex] = restored;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(cruises));
  },

  async delete(id: string): Promise<void> {
    if (typeof window === 'undefined') return;

    const cruises = readCruises().filter(cruise => cruise.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cruises));
  },
};
