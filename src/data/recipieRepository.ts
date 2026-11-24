import recipies from './recipies.json';
import { Recipie } from '../model/recipe';

const catalog = recipies.map(Recipie.hydrateCatalog);

function getAll(): Recipie[] {
  return catalog.slice();
}

function getById(id: string): Recipie | undefined {
  return catalog.find(recipie => recipie.id === id);
}

export const recipieRepository = { getAll, getById };
