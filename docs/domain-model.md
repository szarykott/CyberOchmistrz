# Domain Entity Diagrams

These diagrams describe the current domain model using the terms in [GLOSSARY.md](../GLOSSARY.md). They show embedded values and catalog references, not database tables or a proposed redesign. Only fields relevant to the relationships are included.

In Mermaid's cardinality notation, `||` means exactly one, `o|` means zero or one, `o{` means zero or more, and `|{` means one or more. Solid relationships show ownership or specialization; dashed relationships show references. Cardinalities describe the intended relationships for valid data; catalog IDs are not enforced foreign keys.

## Cruise, crew, and meal plan

```mermaid
erDiagram
    Cruise ||--o{ CrewMember : contains
    Cruise ||--o{ CruiseDay : contains
    CruiseDay ||--o{ RecipeAssignment : contains
    RecipeAssignment ||--|| RecipeSnapshot : owns
    CatalogRecipe o|..o{ RecipeAssignment : "identified by originalRecipeId"
    CrewMember }o..o{ Supply : excludes

    Cruise {
        string id
        string name
        string startDate "optional"
    }
    CrewMember {
        string id
        string name
        Diet diet
        string[] excludedSupplies "optional supply IDs"
    }
    CruiseDay {
        int dayNumber "within this cruise"
    }
    RecipeAssignment {
        string assignmentId "optional in legacy data; normalized on restoration"
        string originalRecipeId
        int crewCount "portion count"
        MealType mealSlot
    }
    RecipeSnapshot {
        string id "copied recipe ID"
        string name
    }
    CatalogRecipe {
        string id
        string name
    }
    Supply {
        string id
        string name
    }
```

- Crew is the cruise's collection of crew members, not a separate record. A crew member has one diet: `omnivore`, `vegetarian`, or `vegan`. Exclusions reference supplies independently of diet.
- A cruise day belongs to one cruise. `dayNumber` identifies its position within that cruise, not a global day entity.
- A recipe assignment belongs to one day and owns an immutable recipe snapshot. `originalRecipeId` records its catalog origin; the snapshot remains available even when that catalog lookup fails. Multiple assignments can originate from the same catalog recipe. `assignmentId` persists their distinct identities; legacy data without it receives a stable identity on restoration.
- The model reads assignments by day and slot and returns handles containing `key`, `recipe`, and `portions`. Edits, moves, and removal select assignments through these handles rather than day-array indices.
- A meal slot is identified by a day and a meal type. It is represented by `RecipeAssignment.mealSlot`, not a separate object. Multiple assignments can share the same slot. Meal types are `śniadanie`, `obiad`, `kolacja`, and `przekąska`.
- `crewCount` means portions for that assignment, not the number of people in the cruise's crew.

The cruise owns its name, start date, ID, and timestamps. `MealPlan` and `CruiseSupplies` return local edits that the cruise installs through `updateMealPlan` and `updateSupplies`. `Crew` edits target stable member IDs. Forms apply the crew draft through `replaceCrew` on save, which persists any repaired legacy member IDs. Cruise duration comes from the meal plan. Shortening a cruise removes the old days and their assignments together. The cruise emits the existing JSON shape through `toJSON`. [Cruise](../src/model/cruise/index.ts), [crew](../src/model/crew.ts), [meal plan](../src/model/cruise/mealPlan/index.ts), [supplies](../src/model/cruise/supplies.ts), [restoration](../src/data/cruiseRepository.ts), [diet coverage](../src/model/cruise/mealPlan/cruiseDietCoverage.ts).

## Recipes, ingredients, and catalog supplies

```mermaid
erDiagram
    Recipe ||--|{ IngredientQuantity : contains
    Ingredient ||..o{ IngredientQuantity : "referenced by id"
    Supply ||--o| Ingredient : "specialized as"

    Recipe {
        string id
        string name
        MealType[] mealType "suitable meal types"
        string[] instructions
    }
    IngredientQuantity {
        string id "ingredient supply ID"
        number amount "per person"
    }
    Supply {
        string id
        string name
        string unit
        string category
        boolean isIngredient
    }
    Ingredient {
        boolean isVegetarian
        boolean isVegan
    }
```

- The immutable `Recipie` owns edits, portion scaling, and diet checks with a caller-supplied ingredient lookup. The catalog and cruise assignment snapshots share the `RecipieData` JSON shape. A snapshot can be edited independently of the catalog recipe.
- An ingredient is a specialization of a supply with the same identity, not a second catalog entry. Supplies also include non-food products. `Supply.create` normalizes and validates one product. `SupplyCatalog.createSupply` also checks catalog names and IDs. `Supply.fromData` preserves stored IDs, and `toData()` exports a plain record.
- Ingredient quantity is an embedded value containing a supply ID and an amount per person. It is not the ingredient catalog record itself.
- `mealType` describes the recipe's suitable meal types; `mealSlot` places one assignment in a day's plan.
- Valid new recipes have at least one ingredient quantity. Ingredient IDs should resolve to ingredient supplies; missing references and older snapshots can still occur in stored data. A recipe is confirmed vegetarian or vegan only when every ingredient resolves and has the corresponding property.

Source: [recipe.ts](../src/model/recipe.ts), [supply.ts](../src/model/supply.ts).

## Additional supplies and derived shopping list

```mermaid
erDiagram
    Cruise ||--o{ AdditionalSupply : contains
    Supply ||..o{ AdditionalSupply : "referenced by id"
    Cruise ||..|| ShoppingList : "input for calculation"
    ShoppingList ||--o{ ShoppingListItem : "groups by category"
    Supply ||..o{ ShoppingListItem : describes
    ShoppingListItem ||--|{ AmountSource : "explained by"

    Cruise {
        string id
    }
    AdditionalSupply {
        string id "supply ID"
        number amount "base quantity"
        boolean isPerPerson
        boolean isPerDay
    }
    Supply {
        string id
        string unit
        string category
    }
    ShoppingListItem {
        number amount "total quantity"
    }
    AmountSource {
        string type "recipe or additional"
        number amount "base quantity"
    }
```

- Shopping list and its items are calculated results, not separately persisted entities. The list is a category-to-items mapping. Each item combines all contributions for one supply ID.
- An additional supply is identified within a cruise by `(id, isPerPerson, isPerDay)`. One product can have several entries with different scaling flags.
- A recipe contribution is `ingredient amount per person × assignment portion count`.
- An additional supply contribution is `base amount × crew multiplier × day multiplier`. The multipliers are crew size when `isPerPerson` is true and cruise day count when `isPerDay` is true; otherwise each is 1.
- Amount sources preserve the explanation of each contribution: recipe sources include recipe name, day number, and portion count; additional supply sources include scaling flags. They do not store references to assignment objects.
- Missing supply IDs produce placeholder supplies in the shopping list rather than dropping the contribution.

Use `cruise.supplies` to update or query additional supplies. Use `cruise.shoppingList.aggregate(supplyCatalog)` to calculate the shopping list from the current meal plan, crew size, and additional supplies. [Additional supplies](../src/model/cruise/supplies.ts), [shopping list](../src/model/cruise/shoppingList.ts).

## Mapping discussion terms to code

| Diagram term | Current representation |
| --- | --- |
| Cruise | `Cruise` |
| Cruise day | `CruiseDay` |
| Crew member | `CrewMember` |
| Recipe assignment | `CruiseDayRecipe` |
| Catalog recipe / recipe snapshot | `Recipie` / `CruiseDayRecipe.recipeData` of type `RecipieData` |
| Ingredient quantity | `IngredientAmount` |
| Supply / ingredient | `Supply` / `Ingredient extends Supply` |
| Additional supply | `CruiseSupply` |
| Shopping list / item | `AggregatedShoppingList` / `AggregatedItem` |
| Amount source | `RecipeAmountSource` or `AdditionalSupplyAmountSource` |

The spelling `recipie` remains intentional in code. Conceptual roles such as recipe snapshot and meal slot do not imply additional classes or storage records.
