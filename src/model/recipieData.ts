import { supplyRepository } from '../data/supplyRepository';
import { Recipie, IngredientAmount } from './recipe';
import { Ingredient } from './supply';

export function createRecipie(data: Recipie): Recipie {
  if (data.ingredients.length === 0) {
    throw new Error('Recipe must have at least one ingredient');
  }
  return data;
}

export function getRecipieIngredients(ingredients: readonly IngredientAmount[]): (IngredientAmount & Ingredient)[] {

  return ingredients.map(ing => {
    const ingredient = supplyRepository.getIngredientById(ing.id);
    if (!ingredient) {
      console.warn(`Ingredient with id "${ing.id}" not found`);
      // Return a default ingredient to prevent errors
      return {
        ...ing,
        name: `Unknown (${ing.id})`,
        unit: '',
        category: 'inne' as const,
        isVegetarian: false,
        isVegan: false
      } as (IngredientAmount & Ingredient);
    }
    return {
      ...ing,
      ...ingredient
    } as (IngredientAmount & Ingredient);
  });
}

export function isRecipieVegetarian(dish: Recipie): boolean {
  // Defense-in-depth: legacy snapshots from localStorage may predate the factory guard
  if (dish.ingredients.length === 0) return false;
  return dish.ingredients.every(ing => supplyRepository.getIngredientById(ing.id)?.isVegetarian === true);
}

export function isRecipieVegan(dish: Recipie): boolean {
  // Defense-in-depth: legacy snapshots from localStorage may predate the factory guard
  if (dish.ingredients.length === 0) return false;
  return dish.ingredients.every(ing => supplyRepository.getIngredientById(ing.id)?.isVegan === true);
}
