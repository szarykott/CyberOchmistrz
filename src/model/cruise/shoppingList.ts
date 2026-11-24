import type { Crew } from "./crew";
import { Supply } from "../supply";
import type { SupplyCatalog } from '../supply';
import type { MealPlan } from "./mealPlan";
import type { CruiseSupplies } from "./supplies";

export interface AggregatedShoppingList {
  readonly [category: string]: readonly AggregatedItem[];
}

export interface AggregatedItem {
  readonly supply: Supply;
  readonly amount: number; // total amount needed
  readonly sources: readonly AmountSource[];
}

export type AmountSource = RecipeAmountSource | AdditionalSupplyAmountSource;

export class RecipeAmountSource {
  readonly type = 'recipe' as const;
  readonly amount: number; // base amount before crew scaling
  readonly recipeName?: string;
  readonly dayNumber?: number;
  readonly crewCount: number;

  constructor(amount: number, recipeName?: string, dayNumber?: number, crewCount: number = 1) {
    this.amount = amount;
    this.recipeName = recipeName;
    this.dayNumber = dayNumber;
    this.crewCount = crewCount;
    Object.freeze(this);
  }
}

export class AdditionalSupplyAmountSource {
  readonly type = 'additional' as const;
  readonly amount: number; // base amount before scaling by flags
  readonly isPerPerson: boolean;
  readonly isPerDay: boolean;

  constructor(amount: number, isPerPerson: boolean, isPerDay: boolean) {
    this.amount = amount;
    this.isPerPerson = isPerPerson;
    this.isPerDay = isPerDay;
    Object.freeze(this);
  }
}

function aggregateShoppingList(mealPlan: MealPlan, crew: Crew, supplies: CruiseSupplies, supplyCatalog: SupplyCatalog): AggregatedShoppingList {
  // Map to hold all items with their total amounts and sources
  const itemsMap: Map<string, { supply: Supply, amount: number, sources: AmountSource[] }> = new Map();

  // Helper function to add items to the itemsMap
  const addToItemsMap = (
    itemsMap: Map<string, { supply: Supply, amount: number, sources: AmountSource[] }>,
    supply: Supply,
    amount: number,
    source: AmountSource
  ) => {
    if (itemsMap.has(supply.id)) {
      // Add to existing item
      const existingItem = itemsMap.get(supply.id)!;
      existingItem.amount += amount;
      existingItem.sources.push(source);
    } else {
      // Add new item
      itemsMap.set(supply.id, {
        supply,
        amount,
        sources: [source]
      });
    }
  };

  // Helper function to create invalid supply placeholder
  const createInvalidSupply = (id: string, isIngredient: boolean): Supply => Supply.fromData({
    id,
    name: `Nieprawidłowy produkt: ${id}`,
    unit: 'sztuki',
    isIngredient: isIngredient,
    category: 'Nieprawidłowe produkty'
  });

  // 1. Add ingredients from recipes in the meal plan, scaled by each recipe's crewCount
  mealPlan.days.forEach(day => {
    day.recipes.forEach(recipe => {
      if (recipe.crewCount === 0) return;
      recipe.recipe.ingredientsForPortions(recipe.crewCount).forEach(ingredientAmount => {
        let ingredient = supplyCatalog.getById(ingredientAmount.id);
        if (!ingredient) {
          ingredient = createInvalidSupply(ingredientAmount.id, true);
        }
        // Preserve the per-person amount in the explanation of the scaled total
        const source = new RecipeAmountSource(ingredientAmount.amount, recipe.recipe.name, day.dayNumber, recipe.crewCount);

        addToItemsMap(itemsMap, ingredient, ingredientAmount.totalAmount, source);
      });
    });
  });

  // 2. Add items from additional supplies
  supplies.entries.forEach(item => {
    let supply = supplyCatalog.getById(item.id);
    if (!supply) {
      supply = createInvalidSupply(item.id, false);
    }
    // Calculate scaled amount based on flags
    const crewMultiplier = item.isPerPerson ? crew.members.length : 1;
    const dayMultiplier = item.isPerDay ? mealPlan.duration : 1;
    const scaledAmount = item.amount * crewMultiplier * dayMultiplier;
    const source = new AdditionalSupplyAmountSource(item.amount, item.isPerPerson, item.isPerDay);

    addToItemsMap(itemsMap, supply, scaledAmount, source);
  });

  // Group items by category
  const groupedItems: Record<string, AggregatedItem[]> = {};

  itemsMap.forEach((item) => {
    const category = item.supply.category || (item.supply.isIngredient ? 'inne' : 'Pozostałe produkty');

    if (!groupedItems[category]) {
      groupedItems[category] = [];
    }

    Object.freeze(item.sources);
    groupedItems[category].push(Object.freeze(item));
  });

  // Sort items in each category alphabetically
  Object.keys(groupedItems).forEach(category => {
    groupedItems[category].sort((a, b) => a.supply.name.localeCompare(b.supply.name, 'pl'));
    Object.freeze(groupedItems[category]);
  });

  return Object.freeze(groupedItems);
}

export class ShoppingList {
  constructor(
    private readonly mealPlan: MealPlan,
    private readonly crew: Crew,
    private readonly supplies: CruiseSupplies,
  ) {
    Object.freeze(this);
  }

  aggregate(supplyCatalog: SupplyCatalog): AggregatedShoppingList {
    return aggregateShoppingList(this.mealPlan, this.crew, this.supplies, supplyCatalog);
  }
}

export function generateShoppingListCSV(aggregatedList: AggregatedShoppingList): string {
  const headers = ['Kategoria', 'Nazwa produktu', 'Ilość', 'Jednostka', 'Opis'];
  const rows: string[] = [];

  rows.push(headers.join(','));

  const sortedCategories = Object.keys(aggregatedList).sort();

  sortedCategories.forEach(category => {
    const items = aggregatedList[category];

    items.forEach(item => {
      const row = [
        escapeCSVValue(category),
        escapeCSVValue(item.supply.name),
        item.amount.toString(),
        escapeCSVValue(item.supply.unit),
        escapeCSVValue(item.supply.description || '')
      ];
      rows.push(row.join(','));
    });
  });

  return rows.join('\n');
}

function escapeCSVValue(value: string): string {
  // If value contains comma, quote, or newline, wrap in quotes and escape internal quotes
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}
