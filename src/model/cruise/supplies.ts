import { produce } from 'immer';
import type { Supply, SupplyCatalog } from '../supply';
import { owned } from './internals';

export interface CategoryGroup {
  readonly category: string;
  readonly supplies: Supply[];
}

export interface AdditionalSupplyItem {
  readonly supply: Supply;
  readonly amount: number;
  readonly isPerPerson: boolean;
  readonly isPerDay: boolean;
}

export interface AdditionalSupplyCategoryGroup {
  readonly category: string;
  readonly supplies: AdditionalSupplyItem[];
}

export function groupSuppliesByCategory(supplies: readonly Supply[]): CategoryGroup[] {
  const grouped: {[key: string]: Supply[]} = {};

  supplies.forEach(supply => {
    const category = supply.category || 'inne';
    if (!grouped[category]) {
      grouped[category] = [];
    }
    grouped[category].push(supply);
  });

  // Convert to array and sort by category name for consistent display order
  return Object.keys(grouped)
    .sort()
    .map(category => ({
      category,
      supplies: grouped[category]
    }));
}

export interface CruiseSupply {
  readonly id: string;
  readonly amount: number;
  readonly isPerPerson: boolean;
  readonly isPerDay: boolean;
}

type CruiseSupplyKey = Pick<CruiseSupply, "id" | "isPerDay" | "isPerPerson">;

function idsEqual(a: CruiseSupplyKey, b: CruiseSupplyKey): boolean {
  return a.id === b.id && a.isPerDay === b.isPerDay && a.isPerPerson === b.isPerPerson;
}

export class CruiseSupplies {
  readonly #entries: readonly CruiseSupply[];

  private constructor(entries: readonly CruiseSupply[]) {
    this.#entries = entries;
    Object.freeze(this);
  }

  static fromEntries(entries: readonly CruiseSupply[]): CruiseSupplies {
    return new CruiseSupplies(owned(entries));
  }

  #with(entries: readonly CruiseSupply[]): CruiseSupplies {
    return entries === this.#entries ? this : new CruiseSupplies(entries);
  }

  get entries(): readonly CruiseSupply[] {
    return this.#entries;
  }

  changeScaling({ supply, perPerson, perDay }: {
    supply: CruiseSupply; perPerson: boolean; perDay: boolean;
  }): CruiseSupplies {
    const source = this.find(supply.id, supply.isPerPerson, supply.isPerDay);
    if (!source || (source.isPerPerson === perPerson && source.isPerDay === perDay)) return this;
    return this.#with(produce(this.#entries, entries => {
      const index = entries.findIndex(item => idsEqual(item, source));
      const [item] = entries.splice(index, 1);
      const target = entries.find(entry => idsEqual(entry, {
        id: item.id, isPerPerson: perPerson, isPerDay: perDay,
      }));
      if (target) target.amount += item.amount;
      else entries.splice(index, 0, { ...item, isPerPerson: perPerson, isPerDay: perDay });
    }));
  }

  upsert(supply: CruiseSupply): CruiseSupplies {
    return this.#with(produce(this.#entries, entries => {
      const existingSupplyIndex = entries.findIndex((s) => idsEqual(s, supply));
      if (existingSupplyIndex >= 0) {
        entries[existingSupplyIndex].amount = supply.amount;
      } else {
        entries.push(owned(supply));
      }
    }));
  }

  add(supply: CruiseSupply): CruiseSupplies {
    return this.#with(produce(this.#entries, entries => {
      const existingSupplyIndex = entries.findIndex((s) => idsEqual(s, supply));
      if (existingSupplyIndex >= 0) {
        entries[existingSupplyIndex].amount += supply.amount;
      } else {
        entries.push(owned(supply));
      }
    }));
  }

  remove(
    supplyId: string,
    isPerPerson: boolean,
    isPerDay: boolean,
  ): CruiseSupplies {
    return this.#with(produce(this.#entries, entries => {
      const existingSupplyIndex = entries.findIndex((s) => idsEqual(s, { id: supplyId, isPerDay, isPerPerson }));
      if (existingSupplyIndex >= 0) {
        entries.splice(existingSupplyIndex, 1);
      }
    }));
  }

  find(
    supplyId: string,
    isPerPerson: boolean,
    isPerDay: boolean,
  ): CruiseSupply | undefined {
    return this.#entries.find((s) => idsEqual(s, { id: supplyId, isPerDay, isPerPerson }));
  }

  has(supplyId: string, isPerPerson: boolean, isPerDay: boolean): boolean {
    return this.find(supplyId, isPerPerson, isPerDay) !== undefined;
  }

  amountFor(
    supplyId: string,
    isPerPerson: boolean,
    isPerDay: boolean,
  ): number | null {
    const item = this.find(supplyId, isPerPerson, isPerDay);

    return item ? item.amount : null;
  }

  groupByCategory(supplyCatalog: SupplyCatalog): AdditionalSupplyCategoryGroup[] {
    const grouped: { [key: string]: AdditionalSupplyItem[] } = {};

    this.#entries.forEach((item) => {
      const supplyDetails = supplyCatalog.getById(item.id);
      if (supplyDetails) {
        const category =
          supplyDetails.category ||
          (supplyDetails.isIngredient ? "inne" : "Pozostałe produkty");

        if (!grouped[category]) {
          grouped[category] = [];
        }

        grouped[category].push({
          supply: supplyDetails,
          amount: item.amount,
          isPerPerson: item.isPerPerson,
          isPerDay: item.isPerDay,
        });
      }
    });

    // Convert to array and sort by category name for consistent display order
    return Object.keys(grouped)
      .sort()
      .map((category) => ({
        category,
        supplies: grouped[category].sort((a, b) => {
          // First sort by supply name
          const nameComparison = a.supply.name.localeCompare(b.supply.name, "pl");
          if (nameComparison !== 0) {
            return nameComparison;
          }

          // If names are equal, sort by flag combination priority: fixed -> per person -> per day -> per person per day
          const getPriority = (item: AdditionalSupplyItem) => {
            if (!item.isPerPerson && !item.isPerDay) return 0; // fixed
            if (item.isPerPerson && !item.isPerDay) return 1; // per person
            if (!item.isPerPerson && item.isPerDay) return 2; // per day
            return 3; // per person per day
          };

          return getPriority(a) - getPriority(b);
        }),
      }));
  }
}
