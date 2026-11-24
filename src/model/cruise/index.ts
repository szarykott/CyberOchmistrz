import { Crew, type CrewMember } from "../crew";
import { newId } from "./internals";
import { MealPlan, type CruiseDayData, type CruiseDay } from "./mealPlan";
import { ShoppingList } from "./shoppingList";
import { CruiseSupplies, type CruiseSupply } from "./supplies";

export type { CruiseDay, CruiseDayRecipe, RecipeAssignment } from "./mealPlan";
export type { CruiseDayData } from "./mealPlan";
export type { CruiseSupply } from "./supplies";

export interface CruiseData {
  readonly id: string;
  readonly name: string;
  readonly dateCreated: string;
  readonly dateModified: string;
  readonly crewMembers: readonly CrewMember[];
  readonly days: readonly CruiseDayData[];
  readonly additionalSupplies?: readonly CruiseSupply[];
  readonly startDate?: string;
}

type CruiseChanges = Partial<Pick<Cruise, 'name' | 'startDate' | 'crew' | 'mealPlan' | 'supplies'>>;

export class Cruise {
  public readonly shoppingList: ShoppingList;

  private constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly dateCreated: string,
    public readonly dateModified: string,
    public readonly crew: Crew,
    public readonly mealPlan: MealPlan,
    public readonly supplies: CruiseSupplies,
    public readonly startDate?: string, // YYYY-MM-DD format
  ) {
    this.shoppingList = new ShoppingList(mealPlan, crew, supplies);
    Object.freeze(this);
  }

  public static createNew(
    name: string,
    length: number,
    crew: Crew | readonly CrewMember[],
    predefinedDays?: readonly CruiseDay[],
    predefinedAdditionalSupplies?: readonly CruiseSupply[],
    startDate?: string,
  ): Cruise {
    const id = newId();
    const now = new Date().toISOString();

    return new Cruise(
      id,
      name,
      now,
      now,
      crew instanceof Crew ? crew : Crew.fromMembers(crew),
      MealPlan.create(id, length, predefinedDays),
      CruiseSupplies.fromEntries(predefinedAdditionalSupplies ?? []),
      startDate,
    );
  }

  public static fromData(data: CruiseData): Cruise {
    return new Cruise(
      data.id,
      data.name,
      data.dateCreated,
      data.dateModified,
      Crew.fromMembers(data.crewMembers),
      MealPlan.fromData(data.id, data.days),
      CruiseSupplies.fromEntries(data.additionalSupplies ?? []),
      data.startDate,
    );
  }

  public toJSON(): CruiseData {
    return {
      id: this.id,
      name: this.name,
      dateCreated: this.dateCreated,
      dateModified: this.dateModified,
      crewMembers: this.crew.members,
      days: this.mealPlan.toJSON(),
      additionalSupplies: this.supplies.entries,
      ...(this.startDate === undefined ? {} : { startDate: this.startDate }),
    };
  }

  #with(modifiedValues: CruiseChanges): Cruise {
    const name = modifiedValues.name ?? this.name;
    const crew = modifiedValues.crew ?? this.crew;
    const mealPlan = modifiedValues.mealPlan ?? this.mealPlan;
    const supplies = modifiedValues.supplies ?? this.supplies;
    const startDate = 'startDate' in modifiedValues ? modifiedValues.startDate : this.startDate;

    // No-op: nothing changed, so keep the same instance and dateModified.
    if (
      name === this.name &&
      crew === this.crew &&
      mealPlan === this.mealPlan &&
      supplies === this.supplies &&
      startDate === this.startDate
    ) {
      return this;
    }

    return new Cruise(
      this.id,
      name,
      this.dateCreated,
      new Date().toISOString(),
      crew,
      mealPlan,
      supplies,
      startDate,
    );
  }

  public rename(name: string): Cruise {
    return this.#with({ name });
  }

  public get duration(): number {
    return this.mealPlan.duration;
  }

  public changeDuration(length: number): Cruise {
    return this.updateMealPlan(plan => plan.changeDuration(length));
  }

  public willLengthReductionRemoveRecipes(newLength: number): boolean {
    return this.mealPlan.willLengthReductionRemoveRecipes(newLength);
  }

  public replaceCrew(crew: Crew): Cruise {
    return this.crew.equals(crew) ? this : this.#with({ crew });
  }

  public changeStartDate(startDate: string): Cruise {
    return this.#with({ startDate });
  }

  public clearStartDate(): Cruise {
    return this.#with({ startDate: undefined });
  }

  public updateMealPlan(transform: (current: MealPlan) => MealPlan): Cruise {
    const mealPlan = transform(this.mealPlan);
    if (!mealPlan.belongsTo(this.id)) throw new Error('Plan posiłków należy do innego rejsu');
    return this.#with({ mealPlan });
  }

  public updateSupplies(transform: (current: CruiseSupplies) => CruiseSupplies): Cruise {
    return this.#with({ supplies: transform(this.supplies) });
  }
}
