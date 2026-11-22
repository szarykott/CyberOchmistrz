import { Recipie, MealType } from '../src/model/recipe';
import { clearCruises, createCruiseWithRecipes, createTestRecipe, makeCrewMembers } from './cruiseTestHarness';

const realisticJajecznicaRecipe: Recipie = {
  id: "jajecznica",
  name: "Jajecznica",
  description: "Pyszna. Na jachcie może być konieczność robienia na 2 tury.",
  mealType: ["śniadanie" as MealType, "kolacja" as MealType],
  difficulty: 3,
  ingredients: [
    { id: "jajka", amount: 3 },
    { id: "sol", amount: 1 },
    { id: "pieprz", amount: 1 },
    { id: "chleb", amount: 0.15 },
    { id: "maslo", amount: 2 }
  ],
  instructions: ["Każdy umie zrobić jajecznicę."],
  developedBy: "Przemysław Onak"
};

const realisticPestoRecipe: Recipie = {
  id: "pesto-z-tuczykiem",
  name: "Pesto z tuńczykiem",
  description: "Szybkie i dobre, łatwo zrobić nawet na fali. Zamiast zielonego pesto można użyć czerwonego.",
  mealType: ["obiad" as MealType],
  difficulty: 2,
  ingredients: [
    { id: "tunczyk_w_sosie_wlasnym", amount: 75 },
    { id: "makaron_penne", amount: 90 },
    { id: "pesto", amount: 40 }
  ],
  instructions: [
    "Gotujemy i cedzimy makaron",
    "Dodajemy tuńczyka i pesto, mieszamy"
  ],
  developedBy: "Przemysław Onak"
};

describe('cruiseRecipeModification', () => {
  const ID = 'rejs-na-mazury-2024';

  const setupJajecznica = (day = 1) =>
    createCruiseWithRecipes(ID, 'Rejs na Mazury 2024', 7, { [day]: [{ recipeId: 'jajecznica', recipeData: realisticJajecznicaRecipe }] }, makeCrewMembers(4));

  const setupPesto = (day = 2) =>
    createCruiseWithRecipes(ID, 'Rejs na Mazury 2024', 7, { [day]: [{ recipeId: 'pesto-z-tuczykiem', recipeData: realisticPestoRecipe }] }, makeCrewMembers(4));

  beforeEach(() => {
    jest.clearAllMocks();
    clearCruises();
  });

  describe('updateRecipeIngredientInCruise', () => {
    it('should update ingredient amount in a cruise recipe', () => {
      const cruise = setupJajecznica();

      const updatedCruise = cruise.editAssignedRecipe({ assignment: cruise.getRecipeAssignments({ day: 1, slot: MealType.DINNER })[0], changes: { ingredients: realisticJajecznicaRecipe.ingredients.map(i => i.id === 'jajka' ? { ...i, amount: 6 } : i) } });

      const recipe = updatedCruise.days[0].recipes[0].recipeData!;
      expect(recipe.ingredients[0]).toEqual(expect.objectContaining({ id: 'jajka', amount: 6 }));
      expect(recipe.ingredients[1].amount).toBe(1);
    });

    it('should not modify the original recipe data', () => {
      const originalRecipe = { ...realisticJajecznicaRecipe };
      const cruise = setupJajecznica();

      const updatedCruise = cruise.editAssignedRecipe({ assignment: cruise.getRecipeAssignments({ day: 1, slot: MealType.DINNER })[0], changes: { ingredients: realisticJajecznicaRecipe.ingredients.map(i => i.id === 'jajka' ? { ...i, amount: 8 } : i) } });

      expect(updatedCruise.days[0].recipes[0].recipeData!.ingredients[0].amount).toBe(8);
      expect(originalRecipe.ingredients[0].amount).toBe(3);
      expect(realisticJajecznicaRecipe.ingredients[0].amount).toBe(3);
    });

    it('should append the ingredient if the name is not present yet (upsert)', () => {
      const cruise = setupJajecznica();

      const updatedCruise = cruise.editAssignedRecipe({ assignment: cruise.getRecipeAssignments({ day: 1, slot: MealType.DINNER })[0], changes: { ingredients: realisticJajecznicaRecipe.ingredients.concat({ id: 'notYourDroids', amount: 6 }) } });

      // jajecznica has 5 ingredients; an unknown id is appended → 6
      const ingredients = updatedCruise.days[0].recipes[0].recipeData!.ingredients;
      expect(ingredients).toHaveLength(6);
      expect(ingredients.find(i => i.id === 'notYourDroids')).toEqual(expect.objectContaining({ id: 'notYourDroids', amount: 6 }));
    });
  });

  describe('addIngredientToRecipeInCruise', () => {
    it('should add a new ingredient to a cruise recipe', () => {
      const cruise = setupPesto();

      const updatedCruise = cruise.editAssignedRecipe({ assignment: cruise.getRecipeAssignments({ day: 2, slot: MealType.DINNER })[0], changes: { ingredients: realisticPestoRecipe.ingredients.concat({ id: 'parmezan', amount: 20 }) } });

      const recipe = updatedCruise.days[1].recipes[0].recipeData!;
      expect(recipe.ingredients).toHaveLength(4);
      expect(recipe.ingredients[3]).toEqual(expect.objectContaining({ id: 'parmezan', amount: 20 }));
    });

    it('should add an ingredient even when recipe was added without explicit recipeData', () => {
      const cruise = createCruiseWithRecipes(ID, 'Rejs na Mazury 2024', 7, {
        1: [{ recipeId: 'jajecznica' }]
      }, makeCrewMembers(4));

      const updatedCruise = cruise.editAssignedRecipe({ assignment: cruise.getRecipeAssignments({ day: 1, slot: MealType.DINNER })[0], changes: { ingredients: createTestRecipe('jajecznica', 'jajecznica').ingredients.concat({ id: 'parmezan', amount: 20 }) } });

      const recipe = updatedCruise.days[0].recipes[0].recipeData;
      expect(recipe).toBeDefined();
      expect(recipe.ingredients.find(i => i.id === 'parmezan')).toEqual(expect.objectContaining({ id: 'parmezan', amount: 20 }));
    });

    it('should not modify the original recipe data', () => {
      const cruise = setupPesto(2);

      const updatedCruise = cruise.editAssignedRecipe({ assignment: cruise.getRecipeAssignments({ day: 2, slot: MealType.DINNER })[0], changes: { ingredients: realisticPestoRecipe.ingredients.concat({ id: 'cebula', amount: 50 }) } });

      // pesto was added on day 2 → days[1]
      expect(cruise.days[1].recipes[0].recipeData.ingredients).toHaveLength(3);
      expect(realisticPestoRecipe.ingredients).toHaveLength(3);
      expect(updatedCruise.days[1].recipes[0].recipeData.ingredients).toHaveLength(4);
    });
  });

  describe('removeIngredientFromRecipeInCruise', () => {
    it('should remove an ingredient from a cruise recipe', () => {
      const cruise = setupJajecznica();

      // index 3 of the jajecznica recipe is 'chleb'
      const updatedCruise = cruise.editAssignedRecipe({ assignment: cruise.getRecipeAssignments({ day: 1, slot: MealType.DINNER })[0], changes: { ingredients: realisticJajecznicaRecipe.ingredients.filter(i => i.id !== 'chleb') } });

      const recipe = updatedCruise.days[0].recipes[0].recipeData!;
      expect(recipe.ingredients).toHaveLength(4);
      expect(recipe.ingredients.find(ing => ing.id === 'chleb')).toBeUndefined();
    });

    it('should not modify the original recipe data', () => {
      const originalRecipe = { ...realisticJajecznicaRecipe };
      const cruise = setupJajecznica();

      cruise.editAssignedRecipe({ assignment: cruise.getRecipeAssignments({ day: 1, slot: MealType.DINNER })[0], changes: { ingredients: realisticJajecznicaRecipe.ingredients.filter(i => i.id !== 'chleb') } });

      expect(originalRecipe.ingredients).toHaveLength(5);
      expect(originalRecipe.ingredients[3].id).toBe('chleb');
      expect(realisticJajecznicaRecipe.ingredients).toHaveLength(5);
    });

  });
});
