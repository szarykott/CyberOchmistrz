import type { Diet } from './crew';
import { owned } from './cruise/internals';
import type { Ingredient } from './supply';

export interface RecipieData {
  readonly id: string;
  readonly name: string;
  readonly ingredients: readonly IngredientAmount[];
  readonly description: string;
  readonly mealType: readonly MealType[];
  readonly difficulty: number; // 1-5 stars
  readonly instructions: readonly string[]; // array of preparation steps
  readonly developedBy?: string; // Author of the recipe
  readonly modifiedBy?: readonly string[]; // Array of people who modified the recipe
}

export type RecipieChanges = Partial<Pick<RecipieData, 'name' | 'ingredients'>>;

export class Recipie {
  readonly #data: RecipieData;

  private constructor(data: RecipieData) {
    this.#data = owned(data);
    Object.freeze(this);
  }

  static fromData(data: RecipieData): Recipie {
    return data instanceof Recipie ? data : new Recipie(data);
  }

  static hydrateCatalog(data: Omit<RecipieData, 'mealType'> & { readonly mealType: readonly string[] }): Recipie {
    const mealType = data.mealType.map(value => {
      const type = Object.values(MealType).find(slot => slot === value);
      if (!type) throw new Error(`Nieprawidłowy rodzaj posiłku: ${value}`);
      return type;
    });
    Recipie.requireIngredients(data.ingredients);
    return Recipie.fromData({ ...data, mealType });
  }

  static requireIngredients(ingredients: readonly IngredientAmount[]): void {
    if (ingredients.length === 0) throw new Error('Recipe must have at least one ingredient');
  }

  get id() { return this.#data.id; }
  get name() { return this.#data.name; }
  get ingredients() { return this.#data.ingredients; }
  get description() { return this.#data.description; }
  get mealType() { return this.#data.mealType; }
  get difficulty() { return this.#data.difficulty; }
  get instructions() { return this.#data.instructions; }
  get developedBy() { return this.#data.developedBy; }
  get modifiedBy() { return this.#data.modifiedBy; }

  toJSON(): RecipieData {
    return this.#data;
  }

  withChanges(changes: RecipieChanges): Recipie {
    const name = changes.name ?? this.name;
    const ingredients = changes.ingredients ?? this.ingredients;
    Recipie.requireIngredients(ingredients);
    const sameIngredients = ingredients === this.ingredients || (
      ingredients.length === this.ingredients.length && ingredients.every((item, index) =>
        item.id === this.ingredients[index].id && item.amount === this.ingredients[index].amount
      )
    );
    return name === this.name && sameIngredients
      ? this
      : new Recipie({ ...this.#data, name, ingredients });
  }

  ingredientDetails(findIngredient: (id: string) => Ingredient | undefined) {
    return this.ingredients.map(amount => {
      const ingredient = findIngredient(amount.id);
      if (ingredient) return { ...amount, ...ingredient.toData(), isVegan: ingredient.isVegan, isVegetarian: ingredient.isVegetarian };
      console.warn(`Ingredient with id "${amount.id}" not found`);
      // Return a default ingredient to prevent errors
      return {
        ...amount,
        name: `Unknown (${amount.id})`,
        unit: '',
        category: 'inne',
        isVegetarian: false,
        isVegan: false,
      };
    });
  }

  ingredientsForPortions(portions: number): readonly (IngredientAmount & { readonly totalAmount: number })[] {
    return this.ingredients.map(item => ({ ...item, totalAmount: item.amount * portions }));
  }

  matchesDiet(diet: Diet, findIngredient: (id: string) => Ingredient | undefined): boolean {
    if (diet === 'omnivore') return true;
    // Defense-in-depth: legacy snapshots from localStorage may contain no ingredients
    if (this.ingredients.length === 0) return false;
    const flag = diet === 'vegan' ? 'isVegan' : 'isVegetarian';
    return this.ingredients.every(ingredient => findIngredient(ingredient.id)?.[flag] === true);
  }
}

export enum MealType {
  BREAKFAST = 'śniadanie',
  DINNER = 'obiad',
  SUPPER = 'kolacja',
  SNACK = 'przekąska'
}

export interface IngredientAmount {
  readonly id: string;
  readonly amount: number;
}
