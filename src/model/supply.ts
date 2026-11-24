import type { SupplyValidationErrors } from '@/types';

interface SupplyData {
  readonly isVegetarian?: boolean;
  readonly isVegan?: boolean;
  readonly id: string;
  readonly name: string;
  readonly unit: string;
  readonly description?: string;
  readonly isIngredient: boolean;
  readonly category: string;
  readonly defaultAmount?: number;
}

export const INGREDIENT_CATEGORIES = [
  'nabiał', 'mięso', 'warzywa', 'owoce', 'pieczywo', 'zboża',
  'przyprawy', 'tłuszcze', 'napoje', 'środki czystości', 'inne'
] as const;

export interface Ingredient extends Supply {
  readonly isIngredient: true;
  readonly isVegetarian: boolean;
  readonly isVegan: boolean;
}

type SupplyDraft = Partial<Omit<SupplyData, 'id' | 'defaultAmount'>> & {
  readonly defaultAmount?: string | number;
};

function normalizeSupply(supply: SupplyDraft) {
  const amount = typeof supply.defaultAmount === 'string' ? supply.defaultAmount.trim() : supply.defaultAmount;
  return {
    name: supply.name?.trim() ?? '',
    unit: supply.unit?.trim() ?? '',
    category: supply.category?.trim() ?? '',
    description: supply.description?.trim() || undefined,
    defaultAmount: amount === '' || amount === undefined ? undefined : Number(amount),
    isIngredient: supply.isIngredient ?? false,
    ...(supply.isIngredient && { isVegetarian: supply.isVegetarian, isVegan: supply.isVegan }),
  };
}

function validateNormalizedSupply(supply: ReturnType<typeof normalizeSupply>): SupplyValidationErrors {
  const errors: SupplyValidationErrors = {
    name: '',
    unit: '',
    category: '',
    isVegetarian: '',
    isVegan: '',
    general: ''
  };

  // Required field validations
  if (!supply.name) {
    errors.name = 'Nazwa produktu jest wymagana';
  }

  if (!supply.unit) {
    errors.unit = 'Jednostka jest wymagana';
  }

  if (!supply.category) {
    errors.category = 'Kategoria jest wymagana';
  }

  if (supply.defaultAmount !== undefined && (!Number.isFinite(supply.defaultAmount) || supply.defaultAmount < 0)) {
    errors.general = 'Domyślna ilość musi być liczbą nieujemną';
  }

  // Ingredient-specific validations
  if (supply.isIngredient) {
    if (supply.category && !INGREDIENT_CATEGORIES.some(category => category === supply.category)) {
      errors.category = 'Nieprawidłowa kategoria dla składnika';
    }

    // isVegetarian and isVegan should be boolean values for ingredients
    if (typeof supply.isVegetarian !== 'boolean') {
      errors.isVegetarian = 'Wymagana wartość logiczna dla wegetariańskiego';
    }

    if (typeof supply.isVegan !== 'boolean') {
      errors.isVegan = 'Wymagana wartość logiczna dla wegańskiego';
    }
  }

  return errors;
}

export function isSupplyDataValid(errors: SupplyValidationErrors): boolean {
  return !Object.values(errors).some(error => error !== '');
}

function idFromName(name: string): string {
  // Generate ID from name (slug format)
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
}

type CreationResult = { supply?: Supply; errors: SupplyValidationErrors };

export class Supply {
  readonly #data: SupplyData;

  private constructor(data: SupplyData) {
    this.#data = Object.freeze(data);
    Object.freeze(this);
  }

  get id() { return this.#data.id; }
  get name() { return this.#data.name; }
  get unit() { return this.#data.unit; }
  get category() { return this.#data.category; }
  get description() { return this.#data.description; }
  get defaultAmount() { return this.#data.defaultAmount; }
  get isIngredient() { return this.#data.isIngredient; }
  get isVegetarian() { return this.#data.isVegetarian; }
  get isVegan() { return this.#data.isVegan; }

  toData(): SupplyData {
    return { ...this.#data };
  }

  static fromData({ isVegetarian, isVegan, ...data }: SupplyData): Supply {
    return new Supply(data.isIngredient
      ? { ...data, isVegetarian: isVegetarian ?? false, isVegan: isVegan ?? false }
      : data);
  }

  static create(draft: SupplyDraft): CreationResult {
    const supply = normalizeSupply(draft);
    const errors = validateNormalizedSupply(supply);
    const id = idFromName(supply.name);
    if (supply.name && !id) errors.name = 'Nie można wygenerować ID z nazwy produktu';
    if (!isSupplyDataValid(errors)) return { errors };
    return { supply: new Supply({ id, ...supply }), errors };
  }
}

export class SupplyCatalog {
  readonly all: readonly Supply[];
  readonly ingredients: readonly Ingredient[];
  readonly nonIngredients: readonly Supply[];

  constructor(entries: readonly SupplyData[]) {
    this.all = Object.freeze(entries.map(Supply.fromData));
    this.ingredients = Object.freeze(this.all.filter(isIngredient));
    this.nonIngredients = Object.freeze(this.all.filter(item => !item.isIngredient));
    Object.freeze(this);
  }

  getById(id: string): Supply | undefined {
    return this.all.find(item => item.id === id);
  }

  readonly getIngredientById = (id: string): Ingredient | undefined => {
    const item = this.getById(id);
    return item && isIngredient(item) ? item : undefined;
  };

  createSupply(draft: SupplyDraft): CreationResult {
    const result = Supply.create(draft);
    const name = draft.name?.trim();
    // Check for duplicate names
    if (name && this.all.some(existing => existing.name.toLowerCase() === name.toLowerCase())) {
      return { errors: { ...result.errors, name: `Produkt o nazwie "${name}" już istnieje` } };
    }
    const id = name && idFromName(name);
    if (id && this.getById(id)) {
      return { errors: { ...result.errors, name: `Produkt o ID "${id}" już istnieje` } };
    }
    return result;
  }
}

export function isIngredient(supply: Supply): supply is Ingredient {
  return supply.isIngredient;
}
