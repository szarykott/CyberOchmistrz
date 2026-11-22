import { Cruise } from '@/model/cruise';
import { MealType } from '../src/model/recipe';
import { createTestRecipe, createCruiseWithRecipes, makeCrewMembers } from './cruiseTestHarness';

describe('cruiseRecipeData', () => {

  const setupEmptyCruise = (length = 3) : Cruise => {
    return Cruise.createNew('Test Cruise', length, makeCrewMembers(2));
  };

  describe('addRecipeToCruiseDay', () => {
    it('should add a recipe to a valid cruise day', () => {
      const cruise = setupEmptyCruise();
      const recipeData = createTestRecipe('recipe-1', 'Test Recipe');

      const updated = cruise.addRecipe({ day: 2, recipe: recipeData, portions: 2, slot: MealType.DINNER });

      expect(updated.days[1].recipes).toHaveLength(1);
      expect(updated.days[1].recipes[0]).toEqual(expect.objectContaining({
        originalRecipeId: 'recipe-1',
        recipeData,
        crewCount: 2,
        mealSlot: MealType.DINNER,
      }));
    });

    it('should do nothing if day number is invalid', () => {
      const cruise = setupEmptyCruise();
      const recipeData = createTestRecipe('recipe-1', 'Test Recipe');

      const updated = cruise.addRecipe({ day: 2000, recipe: recipeData, portions: 2, slot: MealType.DINNER });

      expect(cruise).toBe(updated);
    });

    it('should snapshot recipe data when adding to cruise', () => {
      const cruise = setupEmptyCruise();
      const originalRecipeData = createTestRecipe('recipe-1', 'Original Recipe');

      const updated = cruise.addRecipe({ day: 2, recipe: originalRecipeData, portions: 2, slot: MealType.DINNER });

      // The cruise owns a detached snapshot.
      const recipeInCruise = updated.days[1].recipes[0].recipeData;
      expect(recipeInCruise).toBeDefined();
      expect(recipeInCruise).toEqual(originalRecipeData);
      expect(recipeInCruise).not.toBe(originalRecipeData);
    });
  });

  describe('removeRecipeFromCruiseDay', () => {
    it('should remove a recipe from a valid position', () => {
      const recipeData = createTestRecipe('recipe-1', 'Test Recipe');
      const cruise = createCruiseWithRecipes('test-cruise-1', 'Test Cruise', 3, {
        2: [{ recipeId: 'recipe-1', recipeData }, { recipeId: 'recipe-2' }]
      });


      const updated = cruise.removeRecipe({ assignment: cruise.getRecipeAssignments({ day: 2, slot: MealType.DINNER })[0] });

      expect(updated.days[1].recipes).toHaveLength(1);
      expect(updated.days[1].recipes[0]).toEqual(expect.objectContaining({ originalRecipeId: 'recipe-2' }));
    });

    it('should remove a recipe added without explicit recipeData', () => {
      const cruise = createCruiseWithRecipes('test-cruise-1', 'Test Cruise', 3, {
        1: [{ recipeId: 'unknown-recipe' }]
      });

      const updated = cruise.removeRecipe({ assignment: cruise.getRecipeAssignments({ day: 1, slot: MealType.DINNER })[0] });

      expect(updated.days[0].recipes).toHaveLength(0);
    });
  });
});
