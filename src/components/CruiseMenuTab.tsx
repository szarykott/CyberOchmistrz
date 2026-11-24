'use client';

import { useState, useEffect } from 'react';
import { recipieRepository } from '../data/recipieRepository';
import { generateMarkdown } from '../utils/markdownExport';
import RecipeList from './RecipeList';
import RecipeIngredientEditor from './RecipeIngredientEditor';
import DroppableRecipieContainer from './DroppableRecipieContainer';
import {
  CollisionDetection,
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  closestCenter,
  pointerWithin,
  rectIntersection,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import DroppableDayItem from './DroppableDayItem';
import { MealType } from '@/model/recipe';
import { RecipeAssignment } from '@/model/cruise';
import { useCruise } from '@/app/rejsy/CruiseProvider';

export default function CruiseMenuTab() {
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const { cruise, setCruise } = useCruise();
  const [mobileView, setMobileView] = useState<'days' | 'details' | 'recipes'>('days');
  const [editingRecipe, setEditingRecipe] = useState<RecipeAssignment | null>(null);
  const [activeRecipe, setActiveRecipe] = useState<RecipeAssignment['recipe'] | null>(null);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 5 },
    }),
  );

  const collisionDetection: CollisionDetection = (args) => {
    const activeType = args.active?.data.current?.type;
    if (activeType === 'catalog-recipe') {
      const pointerCollisions = pointerWithin(args);
      if (pointerCollisions.length > 0) return pointerCollisions;
      return rectIntersection(args);
    }
    return closestCenter(args);
  };

  useEffect(() => {
    if (selectedDay === null && cruise.mealPlan.days.length > 0) {
      const firstDay = cruise.mealPlan.days[0].dayNumber;
      setSelectedDay(firstDay);
    }
  }, [cruise.mealPlan.days, selectedDay]);

  const handleDaySelect = (dayNumber: number) => {
    setSelectedDay(dayNumber === selectedDay ? null : dayNumber);
    if (window.innerWidth < 768) {
      setMobileView('details');
    }
  };

  const handleRemoveRecipe = (assignment: RecipeAssignment) => {
    void setCruise(current => current.updateMealPlan(plan => plan.removeRecipe({ assignment })));
  };

  const handleEditIngredients = (assignment: RecipeAssignment) => {
    setEditingRecipe(assignment);
  };

  const handleCrewCountChange = (assignment: RecipeAssignment, portions: number) => {
    void setCruise(current => current.updateMealPlan(plan => plan.changePortions({ assignment, portions })));
  };

  const handleSaveRecipeEdits = (
    name: string,
    ingredients: Array<{ id: string; amount: number }>,
  ) => {
    if (!editingRecipe) return;
    const previous = editingRecipe.recipe;
    const sameIngredients = ingredients.length === previous.ingredients.length && ingredients.every((item, i) =>
      item.id === previous.ingredients[i].id && item.amount === previous.ingredients[i].amount
    );
    return setCruise(current => current.updateMealPlan(plan => plan.editAssignedRecipe({
      assignment: editingRecipe,
      changes: {
        name: name === previous.name ? undefined : name,
        ingredients: sameIngredients ? undefined : ingredients,
      },
    })));
  };

  const closeIngredientEditor = () => {
    setEditingRecipe(null);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
    const data = event.active.data.current;
    setActiveRecipe(data?.type === 'recipe' ? data.assignment.recipe :
      data?.type === 'catalog-recipe' ? recipieRepository.getById(data.recipeId) ?? null : null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    setOverId((event.over?.id as string) || null);
  };

  const parseSlotDroppable = (id: string): { dayNumber: number; mealSlot: MealType } | null => {
    if (!id.startsWith('day-slot-')) return null;
    const rest = id.substring('day-slot-'.length);
    const dashIdx = rest.indexOf('-');
    if (dashIdx === -1) return null;
    const dayNum = parseInt(rest.substring(0, dashIdx), 10);
    const mealSlotStr = rest.substring(dashIdx + 1);
    if (isNaN(dayNum)) return null;
    const mealSlot = Object.values(MealType).find((m) => m === mealSlotStr) as MealType | undefined;
    if (!mealSlot) return null;
    return { dayNumber: dayNum, mealSlot };
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    setActiveId(null);
    setActiveRecipe(null);
    setOverId(null);

    if (!over || !active.data.current) return;

    const activeData = active.data.current;
    const overId = over.id as string;
    const overData = over.data.current;

    // --- Catalog recipe → slot section ---
    if (activeData.type === 'catalog-recipe') {
      if (selectedDay === null) return;

      let targetDay: number | null = null;
      let targetSlot: MealType | null = null;

      const slotInfo = parseSlotDroppable(overId);
      if (slotInfo) {
        targetDay = slotInfo.dayNumber;
        targetSlot = slotInfo.mealSlot;
      } else if (overData?.type === 'recipe' && typeof overData.dayNumber === 'number') {
        targetDay = overData.dayNumber;
        targetSlot = overData.mealSlot as MealType;
      }

      if (targetDay === null || targetSlot === null) return;
      if (targetDay !== selectedDay) return;

      const recipeId: string = activeData.recipeId;
      const fullRecipe = recipieRepository.getById(recipeId);
      if (!fullRecipe) return;

      const destination = { day: targetDay, slot: targetSlot };
      void setCruise(current => current.updateMealPlan(plan => plan.addRecipe({
        ...destination, recipe: fullRecipe,
        portions: Math.max(1, current.crew.members.length),
      })));
      return;
    }

    // --- Existing recipe dragged ---
    if (activeData.type !== 'recipe') return;

    const assignment: RecipeAssignment = activeData.assignment;
    const sourceMealSlot: MealType = activeData.mealSlot;
    let targetDayNumber: number | undefined;
    let targetMealSlot: MealType | undefined;
    let before: RecipeAssignment | undefined;

    const slotInfo = parseSlotDroppable(overId);
    if (slotInfo) {
      targetDayNumber = slotInfo.dayNumber;
      targetMealSlot = slotInfo.mealSlot;
    } else if (overId.startsWith('day-list-')) {
      targetDayNumber = parseInt(overId.split('-').pop() || '0', 10);
      targetMealSlot = sourceMealSlot;
    } else if (overData?.type === 'recipe') {
      targetDayNumber = overData.dayNumber;
      targetMealSlot = overData.mealSlot;
      before = overData.assignment;
    } else {
      return;
    }

    if (targetDayNumber === undefined || !targetMealSlot) return;
    const destination = { day: targetDayNumber, slot: targetMealSlot };
    void setCruise(current => current.updateMealPlan(plan => {
      let next = before;
      const target = before;
      if (target) {
        const assignments = plan.getRecipeAssignments(destination);
        const sourceIndex = assignments.findIndex(item => item.key === assignment.key);
        const targetIndex = assignments.findIndex(item => item.key === target.key);
        if (sourceIndex >= 0 && sourceIndex < targetIndex) next = assignments[targetIndex + 1];
      }
      return plan.moveRecipe({ assignment, to: destination, before: next });
    }));
  };

  const selectedDayData = selectedDay !== null
    ? cruise.mealPlan.days.find((day) => day.dayNumber === selectedDay)
    : null;

  const switchToRecipesView = () => {
    setMobileView('recipes');
  };

  const backToDays = () => {
    setMobileView('days');
  };

  const backToDetails = () => {
    setMobileView('details');
  };

  const exportToMarkdown = () => {
    const markdown = generateMarkdown(cruise);
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `cruise-menu-${cruise.name}-${new Date().toISOString()}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col md:grid md:grid-cols-3 h-full">
        <div className="flex justify-center gap-2 py-2 md:hidden border-b dark:border-gray-600 mb-2">
          <button
            onClick={() => setMobileView('days')}
            className={`btn-filter ${mobileView === 'days' ? 'btn-filter-active' : 'btn-filter-inactive'}`}
          >
            Dni
          </button>
          <button
            onClick={() => setMobileView('details')}
            className={`btn-filter ${mobileView === 'details' ? 'btn-filter-active' : 'btn-filter-inactive'} ${!selectedDay ? 'opacity-50' : ''}`}
            disabled={!selectedDay}
          >
            Szczegóły dnia
          </button>
          <button
            onClick={() => setMobileView('recipes')}
            className={`btn-filter ${mobileView === 'recipes' ? 'btn-filter-active' : 'btn-filter-inactive'} ${!selectedDay ? 'opacity-50' : ''}`}
            disabled={!selectedDay}
          >
            Przepisy
          </button>
        </div>

        <div
          className={`border-r p-3 md:p-4 overflow-y-auto ${
            mobileView !== 'days' ? 'hidden md:block' : ''
          }`}
        >
          <div className="flex items-center justify-between mb-3 md:mb-4">
            <h2 className="text-lg md:text-xl font-bold">Dni rejsu</h2>
            <button onClick={exportToMarkdown} className="btn-secondary flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              Eksportuj do pliku
            </button>
          </div>
          <div
            className={`space-y-4 max-h-[70vh] overflow-y-auto ${
              !!activeId ? 'border-2 border-gray-300 border-dashed dark:border-gray-600 rounded-lg p-2' : ''
            }`}
          >
            {cruise.mealPlan.days.map((day) => (
              <DroppableDayItem
                key={day.dayNumber}
                dayNumber={day.dayNumber}
                recipes={day.recipes}
                crewMembers={cruise.crew.members}
                isSelected={selectedDay === day.dayNumber}
                isOver={overId === `day-list-${day.dayNumber}`}
                onClick={() => handleDaySelect(day.dayNumber)}
                startDate={cruise.startDate}
              />
            ))}
          </div>
        </div>

        <div
          className={`border-r p-3 md:p-4 overflow-y-auto ${
            mobileView !== 'details' ? 'hidden md:block' : ''
          }`}
        >
          {selectedDay !== null && selectedDayData ? (
            <>
              <div className="flex items-center justify-between mb-3 md:mb-4">
                <h2 className="text-lg md:text-xl font-bold">Dzień {selectedDay}</h2>
                <button onClick={switchToRecipesView} className="btn-primary btn-small md:hidden">
                  Dodaj przepis
                </button>
              </div>
              <div className="space-y-3">
                <DroppableRecipieContainer
                  dayNumber={selectedDay}
                  recipes={selectedDayData.recipes}
                  getAssignments={(slot) => cruise.mealPlan.getRecipeAssignments({ day: selectedDay, slot })}
                  crewMembers={cruise.crew.members}
                  onEditIngredients={handleEditIngredients}
                  onRemoveRecipe={handleRemoveRecipe}
                  onCrewCountChange={handleCrewCountChange}
                  isDragging={!!activeId}
                />
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-light">
              <p className="text-sm md:text-base">
                {mobileView === 'details' ? (
                  <button onClick={backToDays} className="text-link">
                    Wybierz dzień z listy
                  </button>
                ) : (
                  'Wybierz dzień z listy po lewej stronie'
                )}
              </p>
            </div>
          )}
        </div>

        <div
          className={`p-3 md:p-4 overflow-y-auto ${
            mobileView !== 'recipes' ? 'hidden md:block' : ''
          }`}
        >
          {mobileView === 'recipes' && (
            <div className="mb-3 md:hidden">
              <button onClick={backToDetails} className="text-link flex items-center text-sm">
                ← Wróć do szczegółów dnia {selectedDay}
              </button>
            </div>
          )}

          {selectedDay !== null ? (
            <RecipeList onSelectRecipie={() => undefined} selectedRecipieId={null} isDraggable />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-light">
              <p className="text-sm md:text-base">
                {mobileView === 'recipes' ? (
                  <button onClick={backToDays} className="text-link">
                    Najpierw wybierz dzień
                  </button>
                ) : (
                  'Wybierz dzień, aby dodać przepisy'
                )}
              </p>
            </div>
          )}
        </div>

        {editingRecipe && (
          <RecipeIngredientEditor
            recipe={editingRecipe.recipe}
            onSave={handleSaveRecipeEdits}
            onClose={closeIngredientEditor}
          />
        )}
      </div>

      <DragOverlay
        style={{ zIndex: 1000, opacity: 0.5 }}
        dropAnimation={activeId?.startsWith('catalog-') ? null : undefined}
      >
        {activeRecipe ? (
          <div className="p-2 md:p-3 border rounded-lg bg-blue-50 border-blue-500 dark:bg-blue-900 dark:border-blue-400">
            <div className="flex items-center">
              <div className="flex-1">
                <span className="font-medium text-sm md:text-base">
                  {activeRecipe.name}
                </span>
                <p className="text-xs md:text-sm text-muted mt-1">
                  {activeRecipe.mealType.join(', ')}
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
