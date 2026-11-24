import { SupplyCatalog, Supply, Ingredient } from '../src/model/supply';

// Mocked data for testing
const mockedSupplies = [
  {
    id: 'maka',
    name: 'Mąka pszenna',
    unit: 'gramy',
    category: 'zboża',
    isVegetarian: true,
    isVegan: true,
    isIngredient: true,
    defaultAmount: 1000
  },
  {
    id: 'cukier',
    name: 'Cukier',
    unit: 'gramy',
    category: 'inne',
    isVegetarian: true,
    isVegan: true,
    isIngredient: true
  },
  {
    id: 'woda_butelkowana',
    name: 'Woda butelkowana',
    unit: 'sztuki',
    category: 'napoje',
    isIngredient: false
  },
  {
    id: 'papier_toaletowy',
    name: 'Papier toaletowy',
    unit: 'rolki',
    category: 'środki czystości',
    isIngredient: false
  }
];

const supplyCatalog = new SupplyCatalog(mockedSupplies);

// tests which verify correctness of supply module

describe('Supply', () => {
  it('restores the stored identity and owns its state across imports and exports', () => {
    const data = { id: 'legacy_id', name: 'Flour', category: 'zboża', unit: 'kg', isIngredient: true };
    const supply = Supply.fromData(data);
    data.name = 'changed';
    const exported = supply.toData();
    expect(exported).toEqual({ ...data, name: 'Flour', isVegetarian: false, isVegan: false });
    Reflect.set(exported, 'name', 'another name');
    expect(supply.name).toBe('Flour');
  });
});

describe('SupplyCatalog', () => {
  it('should validate across ingredient and non-ingredient views without changing the catalog', () => {
    const draft = { name: 'Papier_toaletowy', unit: 'kg', category: 'inne',
      isIngredient: true, isVegetarian: true, isVegan: true };
    expect(supplyCatalog.createSupply(draft).errors.name).toContain('papier_toaletowy');
    const result = supplyCatalog.createSupply({ ...draft, name: 'Ryż' });
    expect(result.supply).toBeDefined();
    expect(supplyCatalog.getById(result.supply!.id)).toBeUndefined();
  });

  it('should protect catalog collections and entries from mutation', () => {
    const supplies = supplyCatalog.all;
    const original = supplies[0];
    const originalLength = supplies.length;
    const originalName = original.name;
    expect(() => (supplies as Supply[]).pop()).toThrow();
    expect(Reflect.set(original, 'name', 'changed')).toBe(false);
    expect(supplyCatalog.all).toHaveLength(originalLength);
    expect(supplyCatalog.getById(original.id)?.name).toBe(originalName);
    expect(Object.isFrozen(supplies)).toBe(true);
    expect(Object.isFrozen(original)).toBe(true);
    expect(Object.isFrozen(supplyCatalog.ingredients)).toBe(true);
    expect(Object.isFrozen(supplyCatalog.nonIngredients)).toBe(true);
    expect([...supplies].reverse()[0]).not.toBe(original);
    expect(supplyCatalog.all[0]).toBe(original);
  });

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

  describe('supplyCatalog.getById', () => {
    it('should return supply by id if exists', () => {
      const supply = supplyCatalog.getById('maka');
      expect(supply).toBeDefined();
      expect(supply?.id).toBe('maka');
      expect(supply?.name).toBe('Mąka pszenna');
    });

    it('should return ingredient with ingredient properties when querying an ingredient', () => {
      const supply = supplyCatalog.getById('maka');
      expect(supply).toBeDefined();
      expect(supply?.isIngredient).toBe(true);
      expect(supply).toHaveProperty('isVegan');
      expect((supply as Ingredient)?.isVegan).toBe(true);
    });

    it('should return undefined for non-existing id', () => {
      const supply = supplyCatalog.getById('non-existing');
      expect(supply).toBeUndefined();
    });
  });

  describe('supplyCatalog.getIngredientById', () => {
    it('should return ingredient by id if it is an ingredient', () => {
      const ingredient = supplyCatalog.getIngredientById('maka');
      expect(ingredient).toBeDefined();
      expect(ingredient?.id).toBe('maka');
      expect(ingredient?.isIngredient).toBe(true);
    });

    it('should return undefined for non-existing id', () => {
      const ingredient = supplyCatalog.getIngredientById('non-existing');
      expect(ingredient).toBeUndefined();
    });

    it('should return undefined if id exists but is not an ingredient', () => {
      const ingredient = supplyCatalog.getIngredientById('woda_butelkowana');
      expect(ingredient).toBeUndefined();
    });
  });

  describe('catalog views', () => {
    it('should return ingredients when showIngredients is true', () => {
      const supplies = supplyCatalog.ingredients;
      expect(Array.isArray(supplies)).toBe(true);
      supplies.forEach(supply => {
        expect(supply.isIngredient).toBe(true);
      });
    });

    it('should return non-ingredients when showIngredients is false', () => {
      const supplies = supplyCatalog.nonIngredients;
      expect(Array.isArray(supplies)).toBe(true);
      supplies.forEach(supply => {
        expect(supply.isIngredient).toBe(false);
      });
    });

    it('should have supplies that contain both ingredients and non-ingredients', () => {
      const allSupplies = supplyCatalog.all;
      const hasIngredients = allSupplies.some(supply => supply.isIngredient);
      const hasNonIngredients = allSupplies.some(supply => !supply.isIngredient);
      expect(hasIngredients).toBe(true);
      expect(hasNonIngredients).toBe(true);
    });
  });
});
