/** @jest-environment jsdom */
import React, { useRef, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { CruiseProvider, useCruise } from '../src/app/rejsy/CruiseProvider';
import CruiseMenuTab from '../src/components/CruiseMenuTab';
import CruiseSuppliesTab from '../src/components/CruiseSuppliesTab';
import { getSuppliesByType } from '../src/model/supplyData';
import { Cruise } from '../src/model/cruise';
import { MealType } from '../src/model/recipe';
import { getRecipies } from '../src/model/recipieData';
import { saveCruise, getCruiseById } from '../src/model/cruiseData';
import EditCruisePage from '../src/app/rejsy/edytuj/page';
import CruisesPage from '../src/app/rejsy/page';

let routeId = '';
jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams({ id: routeId }),
  useRouter: () => ({ push: jest.fn() }),
}));

let dragEnd: ((event: unknown) => void) | undefined;
jest.mock('@dnd-kit/core', () => {
  const actual = jest.requireActual('@dnd-kit/core');
  return { ...actual, DndContext: (props: { onDragEnd: (event: unknown) => void; children: React.ReactNode }) => {
    dragEnd = props.onDragEnd;
    return React.createElement(actual.DndContext, props);
  } };
});

const recipe = getRecipies()[0];
const crew = [{ id: 'crew', name: 'Anna', diet: 'omnivore' as const }];

afterEach(() => { cleanup(); localStorage.clear(); jest.restoreAllMocks(); });

function makeCruise(name: string) {
  return Cruise.createNew(name, 2, crew)
    .addRecipe({ day: 1, slot: MealType.DINNER, recipe, portions: 1 })
    .addRecipe({ day: 1, slot: MealType.DINNER, recipe, portions: 2 });
}

function Probe() {
  const { cruise, setCruise } = useCruise();
  const [draft, setDraft] = useState('');
  return <div>
    <span>{cruise.name}</span>
    <input aria-label="draft" value={draft} onChange={e => setDraft(e.target.value)} />
    <button onClick={() => setCruise(cruise.rename(cruise.name))}>Unchanged</button>
    <button onClick={() => setCruise(cruise.rename('Updated'))}>Update</button>
  </div>;
}

function RetryProbe() {
  const { cruise, setCruise } = useCruise();
  const proposed = useRef(cruise.rename('Retry succeeded'));
  return <><span>{cruise.name}</span><button onClick={() => {
    try { setCruise(proposed.current); } catch { /* Retry the same proposal. */ }
  }}>Retry</button></>;
}

describe('cruise UI', () => {
  it('should skip unchanged storage writes and preserve drafts on updates, resetting them on cruise switch', () => {
    const first = makeCruise('First');
    const second = makeCruise('Second');
    saveCruise(first); saveCruise(second);
    const write = jest.spyOn(Storage.prototype, 'setItem');
    const { rerender } = render(<CruiseProvider key={first.id} cruiseId={first.id}><Probe /></CruiseProvider>);
    fireEvent.change(screen.getByLabelText('draft'), { target: { value: 'draft' } });
    fireEvent.click(screen.getByText('Unchanged'));
    expect(write).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Update'));
    expect(write).toHaveBeenCalledTimes(1);
    expect((screen.getByLabelText('draft') as HTMLInputElement).value).toBe('draft');
    rerender(<CruiseProvider key={second.id} cruiseId={second.id}><Probe /></CruiseProvider>);
    expect(screen.getByText('Second')).toBeTruthy();
    expect((screen.getByLabelText('draft') as HTMLInputElement).value).toBe('');
  });

  it('should edit and remove the selected duplicate assignment', () => {
    const cruise = makeCruise('Cruise');
    saveCruise(cruise);
    render(<CruiseProvider cruiseId={cruise.id}><CruiseMenuTab /></CruiseProvider>);
    const editors = screen.getAllByText('Edytuj składniki');
    fireEvent.click(editors[1]);
    const name = screen.getByDisplayValue(recipe.name);
    fireEvent.change(name, { target: { value: 'Second assignment' } });
    fireEvent.click(screen.getByText('Zapisz'));
    let assignments = getCruiseById(cruise.id)!.getRecipeAssignments({ day: 1, slot: MealType.DINNER });
    expect(assignments.map(a => a.recipe.name)).toEqual([recipe.name, 'Second assignment']);
    const card = screen.getByText('Second assignment').closest('li')!;
    fireEvent.click(within(card).getByText('Usuń'));
    assignments = getCruiseById(cruise.id)!.getRecipeAssignments({ day: 1, slot: MealType.DINNER });
    expect(assignments.map(a => a.recipe.name)).toEqual([recipe.name]);
  });
  it('should reorder in both directions and move across days and slots with one write per move', () => {
    const cruise = makeCruise('Cruise').addRecipe({ day: 2, slot: MealType.SUPPER, recipe, portions: 3 });
    saveCruise(cruise);
    render(<CruiseProvider cruiseId={cruise.id}><CruiseMenuTab /></CruiseProvider>);
    const write = jest.spyOn(Storage.prototype, 'setItem');
    const assignments = (day: number, slot: MealType) => getCruiseById(cruise.id)!.getRecipeAssignments({ day, slot });
    const drop = (source: ReturnType<typeof assignments>[number], day: number, slot: MealType, targetDay: number, targetSlot: MealType, before?: ReturnType<typeof assignments>[number]) => {
      act(() => dragEnd!({
        active: { id: source.key, data: { current: { type: 'recipe', assignment: source, dayNumber: day, mealSlot: slot } } },
        over: before
          ? { id: before.key, data: { current: { type: 'recipe', assignment: before, dayNumber: targetDay, mealSlot: targetSlot } } }
          : { id: `day-slot-${targetDay}-${targetSlot}`, data: { current: {} } },
      }));
    };
    const [first, second] = assignments(1, MealType.DINNER);
    drop(first, 1, MealType.DINNER, 1, MealType.DINNER, second);
    expect(assignments(1, MealType.DINNER).map(a => a.portions)).toEqual([2, 1]);
    drop(first, 1, MealType.DINNER, 1, MealType.DINNER, second);
    expect(assignments(1, MealType.DINNER).map(a => a.portions)).toEqual([1, 2]);
    drop(first, 1, MealType.DINNER, 2, MealType.SUPPER, assignments(2, MealType.SUPPER)[0]);
    expect(assignments(1, MealType.DINNER).map(a => a.portions)).toEqual([2]);
    expect(assignments(2, MealType.SUPPER).map(a => a.portions)).toEqual([1, 3]);
    expect(write).toHaveBeenCalledTimes(3);
  });

  it('should keep an invalid recipe draft open without writing storage', () => {
    const cruise = makeCruise('Cruise');
    saveCruise(cruise);
    render(<CruiseProvider cruiseId={cruise.id}><CruiseMenuTab /></CruiseProvider>);
    fireEvent.click(screen.getAllByText('Edytuj składniki')[0]);
    const dialog = screen.getByText('Zapisz').closest('.container-white') as HTMLElement;
    while (within(dialog).queryAllByText('-').length) fireEvent.click(within(dialog).getAllByText('-')[0]);
    const write = jest.spyOn(Storage.prototype, 'setItem');
    fireEvent.click(within(dialog).getByText('Zapisz'));
    expect(within(dialog).getByRole('alert').textContent).toContain('at least one ingredient');
    expect(within(dialog).getByText('Zapisz')).toBeTruthy();
    expect(write).not.toHaveBeenCalled();
  });

  it('should reset edit form when the actual route changes cruise', () => {
    const first = makeCruise('First');
    const second = makeCruise('Second');
    saveCruise(first); saveCruise(second);
    routeId = first.id;
    const { rerender } = render(<EditCruisePage />);
    fireEvent.change(screen.getByLabelText('Nazwa rejsu'), { target: { value: 'Unsaved' } });
    routeId = second.id;
    rerender(<EditCruisePage />);
    expect((screen.getByLabelText('Nazwa rejsu') as HTMLInputElement).value).toBe('Second');
  });

  it('should show the new cruise when the details route changes ID', () => {
    const first = makeCruise('First');
    const second = makeCruise('Second');
    saveCruise(first); saveCruise(second);
    routeId = first.id;
    const { rerender } = render(<CruisesPage />);
    expect(screen.getByText('First')).toBeTruthy();
    routeId = second.id;
    rerender(<CruisesPage />);
    expect(screen.getByText('Second')).toBeTruthy();
  });

  it('should retry the same cruise after a storage failure', () => {
    const cruise = makeCruise('First');
    saveCruise(cruise);
    render(<CruiseProvider cruiseId={cruise.id}><RetryProbe /></CruiseProvider>);
    const originalSetItem = Storage.prototype.setItem;
    const write = jest.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('quota'); });
    fireEvent.click(screen.getByText('Retry'));
    expect(screen.getByText('First')).toBeTruthy();
    write.mockImplementation(originalSetItem);
    fireEvent.click(screen.getByText('Retry'));
    expect(screen.getByText('Retry succeeded')).toBeTruthy();
    expect(getCruiseById(cruise.id)!.name).toBe('Retry succeeded');
  });

  it('should clear the cruise start date when the edit form is submitted', () => {
    const cruise = makeCruise('First').changeStartDate('2027-05-01');
    saveCruise(cruise);
    routeId = cruise.id;
    render(<EditCruisePage />);
    fireEvent.change(screen.getByLabelText('Data rozpoczęcia (opcjonalne)'), { target: { value: '' } });
    fireEvent.click(screen.getByText('Zapisz zmiany'));
    expect(getCruiseById(cruise.id)!.startDate).toBeUndefined();
  });

  it('should cancel or confirm a supply scaling collision and merge base amounts', () => {
    const supply = getSuppliesByType(false)[0];
    const cruise = makeCruise('Cruise')
      .addAdditionalSupply({ id: supply.id, amount: 3, isPerPerson: false, isPerDay: false })
      .addAdditionalSupply({ id: supply.id, amount: 5, isPerPerson: true, isPerDay: false });
    saveCruise(cruise);
    const confirm = jest.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<CruiseProvider cruiseId={cruise.id}><CruiseSuppliesTab /></CruiseProvider>);
    const shopping = screen.getByText('Lista zakupów').parentElement!;
    const fixedRow = within(shopping).getAllByText(supply.name)[0].closest('li')!;
    fireEvent.change(within(fixedRow).getByRole('combobox'), { target: { value: 'perPerson' } });
    expect(getCruiseById(cruise.id)!.additionalSupplies).toHaveLength(2);
    fireEvent.change(within(fixedRow).getByRole('combobox'), { target: { value: 'perPerson' } });
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(getCruiseById(cruise.id)!.additionalSupplies).toEqual([
      expect.objectContaining({ id: supply.id, amount: 8, isPerPerson: true, isPerDay: false }),
    ]);
  });

});
