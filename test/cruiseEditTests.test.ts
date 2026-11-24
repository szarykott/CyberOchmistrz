import { Crew } from "../src/model/crew";
import { Recipie } from "../src/model/recipe";
import { MealType } from '../src/model/recipe';
import { makeCrewMembers, createTestRecipe } from './cruiseTestHarness';
import { Cruise } from '@/model/cruise';

describe('cruise edit functionality', () => {
  describe('cruise details', () => {
    it('should update cruise name, length, and crew', () => {
      const cruise = Cruise.createNew('Test Cruise', 5, makeCrewMembers(4));

      const updatedCruise = cruise.rename('Updated Cruise').changeDuration(7).replaceCrew(Crew.fromMembers(makeCrewMembers(6)));

      expect(updatedCruise?.name).toBe('Updated Cruise');
      expect(updatedCruise?.mealPlan.days.length).toBe(7);
      expect(updatedCruise?.crew.members).toHaveLength(6);
      expect(updatedCruise?.mealPlan.days).toHaveLength(7);
    });

    it('should add days when length increases', () => {
      const cruise = Cruise.createNew('Test Cruise', 3, makeCrewMembers(4));

      const updatedCruise = cruise.changeDuration(5);

      expect(updatedCruise?.mealPlan.days).toHaveLength(5);
      expect(updatedCruise?.mealPlan.days[3].dayNumber).toBe(4);
      expect(updatedCruise?.mealPlan.days[4].dayNumber).toBe(5);
      expect(updatedCruise?.mealPlan.days[4].recipes).toEqual([]);
    });

    it('should remove days when length decreases', () => {
      const cruise = Cruise.createNew('Test Cruise', 5, makeCrewMembers(4));

      const updatedCruise = cruise.changeDuration(3);

      expect(updatedCruise?.mealPlan.days).toHaveLength(3);
      expect(updatedCruise?.mealPlan.days[2].dayNumber).toBe(3);
    });
  });

  describe('willLengthReductionRemoveRecipes', () => {
    it('should return false when length is not reduced', () => {
      const cruise = Cruise.createNew('Test Cruise', 5, makeCrewMembers(4));

      const result = cruise.willLengthReductionRemoveRecipes(5);

      expect(result).toBe(false);
    });

    it('should return false when no recipes on days being removed', () => {
      const cruise = Cruise.createNew('Test Cruise', 5, makeCrewMembers(4));

      const result = cruise.willLengthReductionRemoveRecipes(3);

      expect(result).toBe(false);
    });

    it('should return true when recipes exist on days being removed', () => {
      let cruise = Cruise.createNew('Test Cruise', 5, makeCrewMembers(4));
      const recipe1 = createTestRecipe('recipe1', 'Recipe 1');
      const recipe2 = createTestRecipe('recipe2', 'Recipe 2');

      cruise = cruise
        .updateMealPlan(plan => plan.addRecipe({ day: 4, recipe: Recipie.fromData(recipe1), portions: 4, slot: MealType.DINNER }))
        .updateMealPlan(plan => plan.addRecipe({ day: 5, recipe: Recipie.fromData(recipe2), portions: 4, slot: MealType.DINNER }));

      const result = cruise.willLengthReductionRemoveRecipes(3);
      expect(result).toBe(true);
    });
  });
});
