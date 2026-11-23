import suppliesData from './supplies.json';
import type { Ingredient, Supply } from '../model/supply';

const supplies: readonly Supply[] = Object.freeze(
  (suppliesData as Supply[]).map(supply => Object.freeze({ ...supply }))
);
const ingredients: readonly Ingredient[] = Object.freeze(
  supplies.filter(supply => supply.isIngredient) as Ingredient[]
);
const nonIngredients: readonly Supply[] = Object.freeze(
  supplies.filter(supply => !supply.isIngredient)
);

function getAll(): readonly Supply[] {
  return supplies;
}

function getIngredients(): readonly Ingredient[] {
  return ingredients;
}

function getNonIngredients(): readonly Supply[] {
  return nonIngredients;
}

function getById(id: string): Supply | undefined {
  return supplies.find(supply => supply.id === id);
}

function getIngredientById(id: string): Ingredient | undefined {
  const supply = getById(id);
  return supply && supply.isIngredient ? supply as Ingredient : undefined;
}

function getSuppliesByType(showIngredients: boolean): readonly Supply[] {
  return showIngredients ? getIngredients() : getNonIngredients();
}

export const supplyRepository = {
  getAll, getById, getIngredients, getNonIngredients, getIngredientById, getSuppliesByType,
};
