import type { Cruise } from './index';
import type { MealPlan } from './mealPlan';

interface Details {
  readonly name: string;
  readonly startDate?: string;
}

export class Organization {
  readonly #details: Details;
  readonly #mealPlan: Pick<MealPlan, 'days' | 'changeDuration' | 'willLengthReductionRemoveRecipes'>;
  readonly #commit: (changes: Partial<Details>) => Cruise;

  constructor(
    details: Details,
    mealPlan: Pick<MealPlan, 'days' | 'changeDuration' | 'willLengthReductionRemoveRecipes'>,
    commit: (changes: Partial<Details>) => Cruise,
  ) {
    this.#details = details;
    this.#mealPlan = mealPlan;
    this.#commit = commit;
    Object.freeze(this);
  }

  get name(): string {
    return this.#details.name;
  }

  get startDate(): string | undefined {
    return this.#details.startDate;
  }

  get duration(): number {
    return this.#mealPlan.days.length;
  }

  rename(name: string): Cruise {
    return this.#commit({ name });
  }

  changeStartDate(startDate: string): Cruise {
    return this.#commit({ startDate });
  }

  clearStartDate(): Cruise {
    return this.#commit({ startDate: undefined });
  }

  changeDuration(length: number): Cruise {
    return this.#mealPlan.changeDuration(length);
  }

  willLengthReductionRemoveRecipes(newLength: number): boolean {
    return this.#mealPlan.willLengthReductionRemoveRecipes(newLength);
  }
}
