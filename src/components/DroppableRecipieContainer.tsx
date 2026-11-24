'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import DraggableRecipeItem from './DraggableRecipeItem';
import { getMealCoverage, MealCoverage } from '../model/cruise/mealPlan/cruiseDietCoverage';
import { Diet, DIET_REGISTRY, CrewMember } from '../model/cruise/crew';
import { supplyCatalog } from '../data/supplyRepository';
import { declineUnit } from '../utils/polishDeclension';
import { CruiseDayRecipe, RecipeAssignment } from '@/model/cruise';
import { MealType } from '@/model/recipe';

interface DroppableRecipieContainerProps {
  dayNumber: number;
  recipes: readonly CruiseDayRecipe[];
  crewMembers: readonly CrewMember[];
  getAssignments: (slot: MealType) => readonly RecipeAssignment[];
  onEditIngredients: (assignment: RecipeAssignment) => void;
  onRemoveRecipe: (assignment: RecipeAssignment) => void;
  onCrewCountChange: (assignment: RecipeAssignment, portions: number) => void;
  isDragging?: boolean;
}

const SLOT_ORDER: MealType[] = [
  MealType.BREAKFAST,
  MealType.DINNER,
  MealType.SUPPER,
  MealType.SNACK,
];

const SLOT_LABEL: Record<MealType, string> = {
  [MealType.BREAKFAST]: 'Śniadanie',
  [MealType.DINNER]: 'Obiad',
  [MealType.SUPPER]: 'Kolacja',
  [MealType.SNACK]: 'Przekąski',
};

export default function DroppableRecipieContainer({
  dayNumber,
  recipes,
  crewMembers,
  getAssignments,
  onEditIngredients,
  onRemoveRecipe,
  onCrewCountChange,
  isDragging = false,
}: DroppableRecipieContainerProps) {
  return (
    <div className="flex flex-col gap-4">
      {SLOT_ORDER.map((slot) => {
        const slotRecipes = recipes.filter((recipe) => recipe.mealSlot === slot);
        const assignments = getAssignments(slot);

        return (
          <SlotSection
            key={slot}
            slot={slot}
            dayNumber={dayNumber}
            slotRecipes={slotRecipes}
            assignments={assignments}
            crewMembers={crewMembers}
            isDragging={isDragging}
            onEditIngredients={onEditIngredients}
            onRemoveRecipe={onRemoveRecipe}
            onCrewCountChange={onCrewCountChange}
          />
        );
      })}
    </div>
  );
}

interface SlotSectionProps {
  slot: MealType;
  dayNumber: number;
  slotRecipes: readonly CruiseDayRecipe[];
  assignments: readonly RecipeAssignment[];
  crewMembers: readonly CrewMember[];
  isDragging: boolean;
  onEditIngredients: DroppableRecipieContainerProps['onEditIngredients'];
  onRemoveRecipe: DroppableRecipieContainerProps['onRemoveRecipe'];
  onCrewCountChange: DroppableRecipieContainerProps['onCrewCountChange'];
}

function SlotSection({
  slot,
  dayNumber,
  slotRecipes,
  assignments,
  crewMembers,
  isDragging,
  onEditIngredients,
  onRemoveRecipe,
  onCrewCountChange,
}: SlotSectionProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `day-slot-${dayNumber}-${slot}`,
    data: {
      type: 'day-slot',
      dayNumber,
      mealSlot: slot,
    },
  });

  const sortableIds = assignments.map((assignment) => assignment.key);

  const coverage: MealCoverage | null =
    slot === MealType.SNACK
      ? null
      : getMealCoverage(
          slotRecipes,
          crewMembers,
          slot,
          supplyCatalog,
        );

  return (
    <section className="transition-opacity">
      <div className="flex items-baseline justify-between mb-1">
        <h4 className="font-semibold text-sm md:text-base">
          {SLOT_LABEL[slot]}
        </h4>
        {slot === MealType.SNACK && (
          <span className="text-xs text-muted-light italic">
            nie wliczają się do pokrycia
          </span>
        )}
      </div>
      <div
        ref={setNodeRef}
        className={`min-h-[60px] p-2 rounded-lg border-2 ${
          isOver
            ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/30'
            : isDragging
            ? 'border-dashed border-gray-300 dark:border-gray-600'
            : 'border-transparent'
        }`}
      >
        {slotRecipes.length === 0 ? (
          <div className="flex items-center justify-center h-16 text-muted-light text-xs md:text-sm border-2 border-solid rounded-lg border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            Przeciągnij przepis tutaj
          </div>
        ) : (
          <SortableContext
            items={sortableIds}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-2">
              {assignments.map((assignment) => (
                <DraggableRecipeItem
                  key={assignment.key}
                  assignment={assignment}
                  mealSlot={slot}
                  dayNumber={dayNumber}
                  onEditIngredients={onEditIngredients}
                  onRemoveRecipe={onRemoveRecipe}
                  onCrewCountChange={onCrewCountChange}
                />
              ))}
            </ul>
          </SortableContext>
        )}
      </div>
      {coverage && (
        <CoverageDisplay
          coverage={coverage}
          isSlotEmpty={slotRecipes.length === 0}
        />
      )}
    </section>
  );
}

interface CoverageDisplayProps {
  coverage: MealCoverage;
  isSlotEmpty: boolean;
}

function CoverageDisplay({ coverage, isSlotEmpty }: CoverageDisplayProps) {
  const { unfed, totalPortions, totalNeeded, surplus, forbiddenIngredientCounts } = coverage;
  const hasUnfed = unfed.length > 0;

  if (isSlotEmpty) {
    return (
      <div className="mt-2 px-2">
        <div className="text-xs md:text-sm text-muted-light">
          {totalPortions}/{totalNeeded} - Dodaj racje
        </div>
      </div>
    );
  }

  let statusClass = 'text-green-700 dark:text-green-400';
  let statusLabel = 'Zaprowiantowano';

  if (hasUnfed) {
    statusClass = 'text-red-700 dark:text-red-400';
    statusLabel = 'Braki w kambuzie';
  } else if (surplus > 0) {
    statusClass = 'text-yellow-700 dark:text-yellow-400';
    statusLabel = 'Nadwyżka racji';
  }

  const dietCounts = new Map<Diet, number>();
  for (const m of unfed) {
    dietCounts.set(m.diet, (dietCounts.get(m.diet) ?? 0) + 1);
  }
  const exclusionEntries = Object.entries(forbiddenIngredientCounts);

  return (
    <div className="mt-2 px-2">
      <div className={`text-xs md:text-sm ${statusClass}`}>
        {totalPortions}/{totalNeeded} - {statusLabel}
      </div>
      {hasUnfed && (
        <div className="mt-1 text-xs text-red-700 dark:text-red-400">
          <div>
            <span className="font-medium">Nienakarmieni załoganci: </span>
            {unfed.map((m) => m.name).join(', ')}
          </div>
          <ul className="mt-0.5 pl-2">
            {([...dietCounts.entries()] as [Diet, number][]).map(([diet, count]) => (
              <li key={diet}>
                Dieta {DIET_REGISTRY[diet].labelLong}: {count} {declineUnit('załogant', count)}
              </li>
            ))}
            {exclusionEntries.length > 0 && (
              <li>
                Wykluczone składniki:{' '}
                {exclusionEntries
                  .map(([id, count]) => {
                    const name = supplyCatalog.getById(id)?.name ?? id;
                    return `${name} (${count} ${declineUnit('załogant', count)})`;
                  })
                  .join(', ')}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
