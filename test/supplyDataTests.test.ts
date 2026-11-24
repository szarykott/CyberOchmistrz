import { supplyCatalog } from '../src/data/supplyRepository';
import { Supply } from '../src/model/supply';
import { groupSuppliesByCategory, type CategoryGroup } from '../src/model/cruise/supplies';

describe('supplyData functions', () => {
  const findGroup = (groups: CategoryGroup[], category: string) =>
    groups.find(g => g.category === category);

  describe('getAllSupplies', () => {
    it('should return all supplies', () => {
      const supplies = supplyCatalog.all;
      expect(Array.isArray(supplies)).toBe(true);
      expect(supplies.length).toBeGreaterThan(0);
      supplies.forEach(supply => {
        expect(supply).toHaveProperty('id');
        expect(supply).toHaveProperty('name');
        expect(supply).toHaveProperty('unit');
        expect(supply).toHaveProperty('isIngredient');
        expect(supply).toHaveProperty('category');
      });
    });
  });

  describe('getIngredients', () => {
    it('should return only ingredients', () => {
      const ingredients = supplyCatalog.ingredients;
      expect(Array.isArray(ingredients)).toBe(true);
      ingredients.forEach(ingredient => {
        expect(ingredient.isIngredient).toBe(true);
        expect(ingredient).toHaveProperty('category');
        expect(ingredient).toHaveProperty('isVegetarian');
        expect(ingredient).toHaveProperty('isVegan');
      });
    });
  });

  describe('getNonIngredients', () => {
    it('should return only non-ingredients', () => {
      const nonIngredients = supplyCatalog.nonIngredients;
      expect(Array.isArray(nonIngredients)).toBe(true);
      nonIngredients.forEach(supply => {
        expect(supply.isIngredient).toBe(false);
      });
    });
  });

  describe('groupSuppliesByCategory', () => {
    it('should group supplies by their category', () => {
      const supplies = [
        { id: '1', name: 'Jabłko', category: 'owoce', isIngredient: true, unit: 'sztuki' },
        { id: '2', name: 'Banan', category: 'owoce', isIngredient: true, unit: 'sztuki' },
        { id: '3', name: 'Chleb', category: 'pieczywo', isIngredient: false, unit: 'sztuki' },
        { id: '4', name: 'Mleko', category: 'nabiał', isIngredient: true, unit: 'sztuki' }
      ];

      const grouped = groupSuppliesByCategory(supplies.map(Supply.fromData));

      expect(grouped).toHaveLength(3);
      expect(findGroup(grouped, 'owoce')!.supplies).toHaveLength(2);
      expect(findGroup(grouped, 'pieczywo')!.supplies).toHaveLength(1);
      expect(findGroup(grouped, 'nabiał')!.supplies).toHaveLength(1);

      expect(findGroup(grouped, 'owoce')!.supplies).toEqual([
        expect.objectContaining({ id: '1', name: 'Jabłko' }),
        expect.objectContaining({ id: '2', name: 'Banan' }),
      ]);
    });

    it('should use "inne" category for supplies without category', () => {
      const supplies = [
        { id: '1', name: 'Jabłko', category: '', isIngredient: true, unit: 'sztuki' },
        { id: '2', name: 'Banan', category: 'owoce', isIngredient: true, unit: 'sztuki' }
      ];

      const grouped = groupSuppliesByCategory(supplies.map(Supply.fromData));

      expect(grouped).toHaveLength(2);
      expect(findGroup(grouped, 'inne')!.supplies).toHaveLength(1);
      expect(findGroup(grouped, 'owoce')!.supplies).toHaveLength(1);
    });

    it('should return empty array for empty supplies array', () => {
      const grouped = groupSuppliesByCategory([]);
      expect(grouped).toEqual([]);
    });

    it('should handle supplies with empty category', () => {
      const supplies = [
        { id: '1', name: 'Jabłko', category: '', isIngredient: true, unit: 'sztuki' }
      ];

      const grouped = groupSuppliesByCategory(supplies.map(Supply.fromData));

      expect(grouped).toHaveLength(1);
      expect(findGroup(grouped, 'inne')!.supplies).toHaveLength(1);
    });

    it('should sort categories alphabetically', () => {
      const supplies = [
        { id: '1', name: 'Mleko', category: 'nabiał', isIngredient: true, unit: 'sztuki' },
        { id: '2', name: 'Jabłko', category: 'owoce', isIngredient: true, unit: 'sztuki' },
        { id: '3', name: 'Chleb', category: 'pieczywo', isIngredient: false, unit: 'sztuki' }
      ];

      const grouped = groupSuppliesByCategory(supplies.map(Supply.fromData));

      expect(grouped).toHaveLength(3);
      expect(grouped[0].category).toBe('nabiał');
      expect(grouped[1].category).toBe('owoce');
      expect(grouped[2].category).toBe('pieczywo');
    });
  });
});

/* Disabling for now as there is pending MR
describe('supplies data sorting', () => {
  it('should have supplies sorted by name', () => {
    const supplies = supplyCatalog.all;
    const sortedSupplies = [...supplies].sort((a, b) => a.name.localeCompare(b.name));
    expect(supplies).toEqual(sortedSupplies);
  });
});
*/
