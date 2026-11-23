import recipies from './recipies.json';
import { createRecipie } from '../model/recipieData';
import type { Recipie } from '../model/recipe';

function getAll(): Recipie[] {
  return (recipies as Recipie[]).map(createRecipie);
}

function getById(id: string): Recipie | undefined {
  return getAll().find(recipie => recipie.id === id);
}

export const recipieRepository = { getAll, getById };
