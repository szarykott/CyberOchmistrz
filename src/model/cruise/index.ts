import type { CrewMember } from "../crew";
import type { Recipie, MealType } from "../recipe";
import type { AdditionalSupplyCategoryGroup } from "../supply";
import { newId, owned } from "./internals";
import { Crew } from "./crew";
import { createDays, MealPlan, ownDays } from "./mealPlan";
import type { CruiseDay, RecipeAssignment } from "./mealPlan";
import { Organization } from "./organization";
import { restoreCruiseData } from "./restoration";
import { ShoppingList } from "./shoppingList";
import { Supplies } from "./supplies";
import type { CruiseSupply } from "./supplies";

export type { CruiseDay, CruiseDayRecipe, RecipeAssignment } from "./mealPlan";
export type { CruiseSupply } from "./supplies";

type CruiseChanges = Partial<Pick<Cruise, 'name' | 'startDate' | 'crewMembers' | 'days' | 'additionalSupplies'>>;

export class Cruise {
  readonly #organization: Organization;
  readonly #crew: Crew;
  readonly #mealPlan: MealPlan;
  readonly #supplies: Supplies;
  readonly #shoppingList: ShoppingList;

  public readonly id: string;
  public readonly name: string;
  public readonly dateCreated: string;
  public readonly dateModified: string;
  public readonly crewMembers: readonly CrewMember[];
  public readonly days: readonly CruiseDay[];
  public readonly additionalSupplies: readonly CruiseSupply[];
  public readonly startDate?: string; // YYYY-MM-DD format

  private constructor(
    id: string,
    name: string,
    dateCreated: string,
    dateModified: string,
    crewMembers: readonly CrewMember[],
    days: readonly CruiseDay[],
    additionalSupplies: readonly CruiseSupply[],
    startDate?: string,
  ) {
    this.#mealPlan = new MealPlan(id, days, days => this.#with({ days }));
    this.#organization = new Organization({ name, startDate }, this.#mealPlan, changes => this.#with(changes));
    this.#crew = new Crew(crewMembers, members => this.#with({ crewMembers: members }));
    this.#supplies = new Supplies(additionalSupplies, entries => this.#with({ additionalSupplies: entries }));

    this.id = id;
    this.name = this.#organization.name;
    this.dateCreated = dateCreated;
    this.dateModified = dateModified;
    this.crewMembers = this.#crew.members;
    this.days = this.#mealPlan.days;
    this.additionalSupplies = this.#supplies.entries;
    this.startDate = this.#organization.startDate;
    this.#shoppingList = new ShoppingList({
      days: this.#mealPlan.days,
      crewMembers: this.#crew.members,
      additionalSupplies: this.#supplies.entries,
    });
    Object.freeze(this);
  }

  get organization(): Organization {
    return this.#organization;
  }

  get crew(): Crew {
    return this.#crew;
  }

  get mealPlan(): MealPlan {
    return this.#mealPlan;
  }

  get supplies(): Supplies {
    return this.#supplies;
  }

  get shoppingList(): ShoppingList {
    return this.#shoppingList;
  }

  // cruise details

  public static createNew(
    name: string,
    length: number,
    crewMembers: CrewMember[],
    predefinedDays?: CruiseDay[],
    predefinedAdditionalSupplies?: CruiseSupply[],
    startDate?: string,
  ): Cruise {
    const days = createDays(length, predefinedDays);
    const now = new Date().toISOString();

    return new Cruise(
      newId(),
      name,
      now,
      now,
      owned(crewMembers),
      ownDays(days),
      owned(predefinedAdditionalSupplies ?? []),
      startDate,
    );
  }

  public static fromData(input: unknown): Cruise {
    const data = restoreCruiseData(input);
    return new Cruise(
      data.id,
      data.name,
      data.dateCreated,
      data.dateModified,
      data.crewMembers,
      data.days,
      data.additionalSupplies,
      data.startDate,
    );
  }

  #with(modifiedValues: CruiseChanges): Cruise {
    const name = modifiedValues.name ?? this.name;
    const crewMembers = modifiedValues.crewMembers ?? this.crewMembers;
    const days = modifiedValues.days ?? this.days;
    const additionalSupplies = modifiedValues.additionalSupplies ?? this.additionalSupplies;
    const startDate = 'startDate' in modifiedValues ? modifiedValues.startDate : this.startDate;

    // No-op: nothing changed, so keep the same instance. immer returns the same
    // array reference when a producer mutates nothing, so this catches no-op
    // updates (e.g. out-of-bounds reorder). Avoids a needless dateModified bump,
    // lets React skip re-render and saveCruise skip a redundant write.
    if (
      name === this.name &&
      crewMembers === this.crewMembers &&
      days === this.days &&
      additionalSupplies === this.additionalSupplies &&
      startDate === this.startDate
    ) {
      return this;
    }

    const now = new Date().toISOString()

    return new Cruise(
      this.id,
      name,
      this.dateCreated,
      now,
      crewMembers,
      days,
      additionalSupplies,
      startDate,
    )
  }

  public rename(name: string): Cruise {
    return this.organization.rename(name);
  }

  public changeDuration(length: number): Cruise {
    return this.organization.changeDuration(length);
  }

  public replaceCrew(crewMembers: readonly CrewMember[]): Cruise {
    return this.crew.replace(crewMembers);
  }

  public changeStartDate(startDate: string): Cruise {
    return this.organization.changeStartDate(startDate);
  }

  public clearStartDate(): Cruise {
    return this.organization.clearStartDate();
  }

  public getRecipeAssignments({ day, slot }: { day: number; slot: MealType }): readonly RecipeAssignment[] {
    return this.mealPlan.getRecipeAssignments({ day, slot });
  }

  public addRecipe({ day, slot, recipe, portions }: {
    day: number; slot: MealType; recipe: Recipie; portions: number;
  }): Cruise {
    return this.mealPlan.addRecipe({ day, slot, recipe, portions });
  }

  public editAssignedRecipe({ assignment, changes }: {
    assignment: RecipeAssignment; changes: { name?: string; ingredients?: Recipie['ingredients'] };
  }): Cruise {
    return this.mealPlan.editAssignedRecipe({ assignment, changes });
  }

  public changePortions({ assignment, portions }: { assignment: RecipeAssignment; portions: number }): Cruise {
    return this.mealPlan.changePortions({ assignment, portions });
  }

  public moveRecipe({ assignment, to, before }: {
    assignment: RecipeAssignment; to: { day: number; slot: MealType }; before?: RecipeAssignment;
  }): Cruise {
    return this.mealPlan.moveRecipe({ assignment, to, before });
  }

  public changeAdditionalSupplyScaling({ supply, perPerson, perDay }: {
    supply: CruiseSupply; perPerson: boolean; perDay: boolean;
  }): Cruise {
    return this.supplies.changeScaling({ supply, perPerson, perDay });
  }

  // receipes

  public removeRecipe({ assignment }: { assignment: RecipeAssignment }): Cruise {
    return this.mealPlan.removeRecipe({ assignment });
  }

  public willLengthReductionRemoveRecipes(newLength: number): boolean {
    return this.organization.willLengthReductionRemoveRecipes(newLength);
  }

  // additional supplies

  public upsertAdditionalSupply(supply: CruiseSupply): Cruise {
    return this.supplies.upsert(supply);
  }

  public addAdditionalSupply(supply: CruiseSupply): Cruise {
    return this.supplies.add(supply);
  }

  public removeAdditionalSupply(
    supplyId: string,
    isPerPerson: boolean,
    isPerDay: boolean,
  ): Cruise {
    return this.supplies.remove(supplyId, isPerPerson, isPerDay);
  }

  public hasAdditionalSupply(
    supplyId: string,
    isPerPerson: boolean,
    isPerDay: boolean,
  ): boolean {
    return this.supplies.has(supplyId, isPerPerson, isPerDay);
  }

  public getAdditionalSupplyAmount(
    supplyId: string,
    isPerPerson: boolean,
    isPerDay: boolean,
  ): number | null {
    return this.supplies.amountFor(supplyId, isPerPerson, isPerDay);
  }

  public groupAdditionalSuppliesByCategory(): AdditionalSupplyCategoryGroup[] {
    return this.supplies.groupByCategory();
  }
}
