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

export interface Ingredient extends Supply {
  readonly isIngredient: true;
  readonly isVegetarian: boolean;
  readonly isVegan: boolean;
}

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
}

export function isIngredient(supply: Supply): supply is Ingredient {
  return supply.isIngredient;
}
