# CyberOchmistrz Domain Glossary

CyberOchmistrz helps a cruise steward (Polish: ochmistrz) plan meals and provisions for a sailing crew. This glossary defines the shared domain vocabulary.

## Cruises and crew

**Cruise** (Polish: rejs / rejsy)
A sailing trip with a crew, a sequence of days, a meal plan, and additional supplies.

**Cruise day** (Polish: dzień / dni)
A numbered day within a cruise to which recipes can be assigned.

**Crew** (Polish: załoga)
The collection of crew members participating in a cruise.

**Crew member** (Polish: załogant / załoganci)
A person in the cruise's crew with a diet and optional ingredient exclusions.

**Diet** (Polish: dieta)
A crew member's food preference: omnivore (wszystkożerna), vegetarian (wegetariańska), or vegan (wegańska). Ingredient exclusions are separate restrictions on what that person can eat.

## Recipes and meal planning

**Recipe** (Polish: przepis / przepisy)
A preparation description with ingredient quantities per person, instructions, and suitable meal types.

**Recipe assignment** (Polish: przepis przypisany do dnia rejsu)
An occurrence of a recipe in a cruise's meal plan, with its own recipe snapshot, portion count, and meal slot. The same recipe can have multiple assignments, and an assignment's recipe can be edited independently of the catalog recipe.
_Avoid_: using "recipe" alone when the distinction between the catalog recipe and its assignment matters.

**Portion count** (Polish: liczba porcji)
The number of servings planned for one recipe assignment. It determines how much of that assignment's ingredients is needed and can differ from the crew size.

**Meal type** (Polish: rodzaj posiłku)
A category of meal: breakfast (śniadanie), dinner (obiad), supper (kolacja), or snack (przekąska). A recipe can be suitable for more than one meal type.

**Meal slot** (Polish: posiłek w danym dniu)
A place in a cruise day's meal plan identified by a meal type. Multiple recipe assignments can share one meal slot.

**Dish** (Polish: danie)
The food prepared from a recipe.

## Supplies and shopping

**Supply** (Polish: produkt / zapas)
A catalog product with a name, unit, and category that can be provisioned for a cruise. Supplies include ingredients and non-food products.

**Ingredient** (Polish: składnik / składniki)
A supply designated for use in recipes, with vegetarian and vegan suitability information. A recipe specifies a quantity of each ingredient per person.

**Additional supply** (Polish: dodatkowy zapas)
A supply included in a cruise independently of its recipe assignments. Its quantity can be fixed or scaled by crew size, cruise duration, or both.

**Shopping list** (Polish: lista zakupów)
The combined quantities of supplies needed for the cruise's recipe assignments and additional supplies, grouped by category.

## Terminology notes

The Polish route name "składniki" is used for a catalog containing ingredients and non-food supplies. Keep "supply" and "ingredient" distinct in domain discussions.
