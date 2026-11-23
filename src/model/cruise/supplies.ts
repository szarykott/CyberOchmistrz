import { produce } from 'immer';
import type { AdditionalSupplyCategoryGroup, AdditionalSupplyItem } from '../supply';
import { supplyRepository } from '../../data/supplyRepository';
import type { Cruise } from './index';
import { owned } from './internals';

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

export class Supplies {
  readonly #entries: readonly CruiseSupply[];
  readonly #commit: (entries: readonly CruiseSupply[]) => Cruise;

  constructor(entries: readonly CruiseSupply[], commit: (entries: readonly CruiseSupply[]) => Cruise) {
    this.#entries = entries;
    this.#commit = commit;
    Object.freeze(this);
  }

  get entries(): readonly CruiseSupply[] {
    return this.#entries;
  }

  changeScaling({ supply, perPerson, perDay }: {
    supply: CruiseSupply; perPerson: boolean; perDay: boolean;
  }): Cruise {
    const source = this.find(supply.id, supply.isPerPerson, supply.isPerDay);
    if (!source || (source.isPerPerson === perPerson && source.isPerDay === perDay)) return this.#commit(this.#entries);
    return this.#commit(produce(this.#entries, entries => {
      const index = entries.findIndex(item => idsEqual(item, source));
      const [item] = entries.splice(index, 1);
      const target = entries.find(entry => idsEqual(entry, {
        id: item.id, isPerPerson: perPerson, isPerDay: perDay,
      }));
      if (target) target.amount += item.amount;
      else entries.splice(index, 0, { ...item, isPerPerson: perPerson, isPerDay: perDay });
    }));
  }

  upsert(supply: CruiseSupply): Cruise {
    return this.#commit(produce(this.#entries, entries => {
      const existingSupplyIndex = entries.findIndex((s) => idsEqual(s, supply));
      if (existingSupplyIndex >= 0) {
        entries[existingSupplyIndex].amount = supply.amount;
      } else {
        entries.push(owned(supply));
      }
    }));
  }

  add(supply: CruiseSupply): Cruise {
    return this.#commit(produce(this.#entries, entries => {
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
  ): Cruise {
    return this.#commit(produce(this.#entries, entries => {
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

  groupByCategory(): AdditionalSupplyCategoryGroup[] {
    const grouped: { [key: string]: AdditionalSupplyItem[] } = {};

    this.#entries.forEach((item) => {
      const supplyDetails = supplyRepository.getById(item.id);
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
