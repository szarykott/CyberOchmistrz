/** @jest-environment jsdom */
import { recipieRepository } from '../src/data/recipieRepository';
import { supplyCatalog } from '../src/data/supplyRepository';
import React, { useRef, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { CruiseProvider, useCruise } from '../src/app/rejsy/CruiseProvider';
import CruiseMenuTab from '../src/components/CruiseMenuTab';
import CruiseSuppliesTab from '../src/components/CruiseSuppliesTab';
import { Cruise } from '../src/model/cruise';
import { MealType } from '../src/model/recipe';
import { cruiseRepository } from '../src/data/cruiseRepository';
import EditCruisePage from '../src/app/rejsy/edytuj/page';
import AddCruiseForm from '../src/components/AddCruiseForm';
import CruisesPage from '../src/app/rejsy/page';

const { getAll: getRecipies } = recipieRepository;


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
    .updateMealPlan(plan => plan.addRecipe({ day: 1, slot: MealType.DINNER, recipe, portions: 1 }))
    .updateMealPlan(plan => plan.addRecipe({ day: 1, slot: MealType.DINNER, recipe, portions: 2 }));
}

function Probe() {
  const { cruise, setCruise } = useCruise();
  const [draft, setDraft] = useState('');
  return <div>
    <span>{cruise.name}</span>
    <input aria-label="draft" value={draft} onChange={e => setDraft(e.target.value)} />
    <button onClick={() => setCruise(current => current.rename(current.name))}>Unchanged</button>
    <button onClick={() => setCruise(current => current.rename('Updated'))}>Update</button>
  </div>;
}

function RetryProbe() {
  const { cruise, setCruise } = useCruise();
  const proposed = useRef(cruise.rename('Retry succeeded'));
  return <><span>{cruise.name}</span><button onClick={() => {
    void setCruise(() => proposed.current);
  }}>Retry</button></>;
}

function QueueProbe() {
  const { cruise, setCruise } = useCruise();
  return <button onClick={() => {
    void setCruise(current => current.rename('Renamed'));
    void setCruise(current => current.changeStartDate('2027-05-01'));
  }}>{cruise.name}</button>;
}

function PortionQueueProbe() {
  const { cruise, setCruise } = useCruise();
  const assignments = cruise.mealPlan.getRecipeAssignments({ day: 1, slot: MealType.DINNER });
  return <button onClick={() => {
    for (const assignment of assignments) {
      void setCruise(current => current.updateMealPlan(plan =>
        plan.changePortions({ assignment, portions: assignment.portions + 1 })
      ));
    }
  }}>{assignments.map(assignment => assignment.portions).join(', ')}</button>;
}

describe('cruise UI', () => {
  it('should skip unchanged storage writes and preserve drafts on updates, resetting them on cruise switch', async () => {
    const first = makeCruise('First');
    const second = makeCruise('Second');
    await cruiseRepository.save(first);
    await cruiseRepository.save(second);
    const write = jest.spyOn(Storage.prototype, 'setItem');
    const { rerender } = render(<CruiseProvider key={first.id} cruiseId={first.id}><Probe /></CruiseProvider>);
    fireEvent.change(await screen.findByLabelText('draft'), { target: { value: 'draft' } });
    await act(async () => { fireEvent.click(screen.getByText('Unchanged')); });
    expect(write).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByText('Update')); });
    expect(write).toHaveBeenCalledTimes(1);
    expect((screen.getByLabelText('draft') as HTMLInputElement).value).toBe('draft');
    rerender(<CruiseProvider key={second.id} cruiseId={second.id}><Probe /></CruiseProvider>);
    expect(await screen.findByText('Second')).toBeTruthy();
    expect((screen.getByLabelText('draft') as HTMLInputElement).value).toBe('');
  });

  it('should edit and remove the selected duplicate assignment', async () => {
    const cruise = makeCruise('Cruise');
    await cruiseRepository.save(cruise);
    render(<CruiseProvider cruiseId={cruise.id}><CruiseMenuTab /></CruiseProvider>);
    const editors = await screen.findAllByText('Edytuj składniki');
    fireEvent.click(editors[1]);
    const name = screen.getByDisplayValue(recipe.name);
    fireEvent.change(name, { target: { value: 'Second assignment' } });
    await act(async () => { fireEvent.click(screen.getByText('Zapisz')); });
    let assignments = (await cruiseRepository.getById(cruise.id))!.mealPlan.getRecipeAssignments({ day: 1, slot: MealType.DINNER });
    expect(assignments.map(a => a.recipe.name)).toEqual([recipe.name, 'Second assignment']);
    const card = screen.getByText('Second assignment').closest('li')!;
    await act(async () => { fireEvent.click(within(card).getByText('Usuń')); });
    assignments = (await cruiseRepository.getById(cruise.id))!.mealPlan.getRecipeAssignments({ day: 1, slot: MealType.DINNER });
    expect(assignments.map(a => a.recipe.name)).toEqual([recipe.name]);
  });
  it('should reorder in both directions and move across days and slots with one write per move', async () => {
    const cruise = makeCruise('Cruise').updateMealPlan(plan => plan.addRecipe({ day: 2, slot: MealType.SUPPER, recipe, portions: 3 }));
    await cruiseRepository.save(cruise);
    render(<CruiseProvider cruiseId={cruise.id}><CruiseMenuTab /></CruiseProvider>);
    await screen.findAllByText('Edytuj składniki');
    const write = jest.spyOn(Storage.prototype, 'setItem');
    const assignments = async (day: number, slot: MealType) => (await cruiseRepository.getById(cruise.id))!.mealPlan.getRecipeAssignments({ day, slot });
    const drop = async (source: Awaited<ReturnType<typeof assignments>>[number], day: number, slot: MealType, targetDay: number, targetSlot: MealType, before?: Awaited<ReturnType<typeof assignments>>[number]) => {
      await act(async () => dragEnd!({
        active: { id: source.key, data: { current: { type: 'recipe', assignment: source, dayNumber: day, mealSlot: slot } } },
        over: before
          ? { id: before.key, data: { current: { type: 'recipe', assignment: before, dayNumber: targetDay, mealSlot: targetSlot } } }
          : { id: `day-slot-${targetDay}-${targetSlot}`, data: { current: {} } },
      }));
    };
    const [first, second] = await assignments(1, MealType.DINNER);
    await drop(first, 1, MealType.DINNER, 1, MealType.DINNER, second);
    expect((await assignments(1, MealType.DINNER)).map(a => a.portions)).toEqual([2, 1]);
    await drop(first, 1, MealType.DINNER, 1, MealType.DINNER, second);
    expect((await assignments(1, MealType.DINNER)).map(a => a.portions)).toEqual([1, 2]);
    await drop(first, 1, MealType.DINNER, 2, MealType.SUPPER, (await assignments(2, MealType.SUPPER))[0]);
    expect((await assignments(1, MealType.DINNER)).map(a => a.portions)).toEqual([2]);
    expect((await assignments(2, MealType.SUPPER)).map(a => a.portions)).toEqual([1, 3]);
    expect(write).toHaveBeenCalledTimes(3);
  });

  it('should keep an invalid recipe draft open without writing storage', async () => {
    const cruise = makeCruise('Cruise');
    await cruiseRepository.save(cruise);
    render(<CruiseProvider cruiseId={cruise.id}><CruiseMenuTab /></CruiseProvider>);
    fireEvent.click((await screen.findAllByText('Edytuj składniki'))[0]);
    const dialog = screen.getByText('Zapisz').closest('.container-white') as HTMLElement;
    while (within(dialog).queryAllByText('-').length) fireEvent.click(within(dialog).getAllByText('-')[0]);
    const write = jest.spyOn(Storage.prototype, 'setItem');
    await act(async () => { fireEvent.click(within(dialog).getByText('Zapisz')); });
    expect(within(dialog).getByRole('alert').textContent).toContain('at least one ingredient');
    expect(within(dialog).getByText('Zapisz')).toBeTruthy();
    expect(write).not.toHaveBeenCalled();
  });

  it('should reset edit form when the actual route changes cruise', async () => {
    const first = makeCruise('First');
    const second = makeCruise('Second');
    await cruiseRepository.save(first);
    await cruiseRepository.save(second);
    routeId = first.id;
    const { rerender } = render(<EditCruisePage />);
    fireEvent.change(await screen.findByLabelText('Nazwa rejsu'), { target: { value: 'Unsaved' } });
    routeId = second.id;
    rerender(<EditCruisePage />);
    expect((await screen.findByLabelText<HTMLInputElement>('Nazwa rejsu')).value).toBe('Second');
  });

  it('should show the new cruise when the details route changes ID', async () => {
    const first = makeCruise('First');
    const second = makeCruise('Second');
    await cruiseRepository.save(first);
    await cruiseRepository.save(second);
    routeId = first.id;
    const { rerender } = render(<CruisesPage />);
    expect(await screen.findByText('First')).toBeTruthy();
    routeId = second.id;
    rerender(<CruisesPage />);
    expect(await screen.findByText('Second')).toBeTruthy();
  });

  it('should retry the same cruise after a storage failure', async () => {
    const cruise = makeCruise('First');
    await cruiseRepository.save(cruise);
    render(<CruiseProvider cruiseId={cruise.id}><RetryProbe /></CruiseProvider>);
    const retry = await screen.findByText('Retry');
    const originalSetItem = Storage.prototype.setItem;
    const write = jest.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('quota'); });
    await act(async () => { fireEvent.click(retry); });
    expect(screen.getByText('First')).toBeTruthy();
    write.mockImplementation(originalSetItem);
    await act(async () => { fireEvent.click(retry); });
    expect(screen.getByText('Retry succeeded')).toBeTruthy();
    expect((await cruiseRepository.getById(cruise.id))!.name).toBe('Retry succeeded');
  });

  it('should queue portion edits from one render and retain later edits after a failed save', async () => {
    const cruise = makeCruise('Cruise');
    await cruiseRepository.save(cruise);
    const save = jest.spyOn(cruiseRepository, 'save').mockRejectedValueOnce(new Error('quota'));
    render(<CruiseProvider cruiseId={cruise.id}><PortionQueueProbe /></CruiseProvider>);
    const button = await screen.findByRole('button', { name: '1, 2' });
    await act(async () => { fireEvent.click(button); });
    expect(button.textContent).toBe('1, 3');
    expect(save).toHaveBeenCalledTimes(2);
    await act(async () => { fireEvent.click(button); });
    expect(button.textContent).toBe('2, 4');
    const stored = (await cruiseRepository.getById(cruise.id))!;
    expect(stored.mealPlan.getRecipeAssignments({ day: 1, slot: MealType.DINNER }).map(item => item.portions)).toEqual([2, 4]);
  });

  it('should apply later changes to the last saved cruise', async () => {
    const cruise = makeCruise('First');
    await cruiseRepository.save(cruise);
    const save = cruiseRepository.save;
    let releaseSave!: () => void;
    const pending = new Promise<void>(resolve => { releaseSave = resolve; });
    const writes = jest.spyOn(cruiseRepository, 'save').mockImplementationOnce(async next => {
      await pending;
      await save(next);
    });

    render(<CruiseProvider cruiseId={cruise.id}><QueueProbe /></CruiseProvider>);
    const button = await screen.findByRole('button', { name: 'First' });
    await act(async () => { fireEvent.click(button); });
    expect(writes).toHaveBeenCalledTimes(1);
    expect(button.textContent).toBe('First');

    await act(async () => { releaseSave(); });
    expect(button.textContent).toBe('Renamed');
    expect(await cruiseRepository.getById(cruise.id)).toEqual(expect.objectContaining({
      name: 'Renamed', startDate: '2027-05-01',
    }));
  });

  it('should clear the cruise start date when the edit form is submitted', async () => {
    const cruise = makeCruise('First').changeStartDate('2027-05-01');
    await cruiseRepository.save(cruise);
    routeId = cruise.id;
    render(<EditCruisePage />);
    fireEvent.change(await screen.findByLabelText('Data rozpoczęcia (opcjonalne)'), { target: { value: '' } });
    await act(async () => { fireEvent.click(screen.getByText('Zapisz zmiany')); });
    expect((await cruiseRepository.getById(cruise.id))!.startDate).toBeUndefined();
  });

  it('should keep crew edits local until the cruise form is submitted', async () => {
    const original = Cruise.createNew('Cruise', 1, [...crew, { id: 'second', name: 'Beata', diet: 'omnivore' }]);
    await cruiseRepository.save(original);
    routeId = original.id;
    const cancelled = render(<EditCruisePage />);
    fireEvent.change(await screen.findByDisplayValue('Anna'), { target: { value: 'Draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Anuluj' }));
    cancelled.unmount();
    expect((await cruiseRepository.getById(original.id))!.crew.members[0].name).toBe('Anna');

    jest.spyOn(window, 'confirm').mockReturnValue(true);
    render(<EditCruisePage />);
    await screen.findByDisplayValue('Anna');
    fireEvent.click(screen.getAllByRole('button', { name: 'Rozwiń' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Usuń członka załogi' }));
    fireEvent.change(screen.getByDisplayValue('Beata'), { target: { value: 'Barbara' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Zapisz zmiany' })); });
    expect((await cruiseRepository.getById(original.id))!.crew.members).toEqual([
      { id: 'second', name: 'Barbara', diet: 'omnivore' },
    ]);
  });

  it('should create a cruise with a member from the add form draft', async () => {
    render(<AddCruiseForm />);
    fireEvent.change(screen.getByLabelText('Nazwa rejsu'), { target: { value: 'New cruise' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Zaokrętuj' }));
    fireEvent.change(screen.getByDisplayValue('Załogant #1'), { target: { value: 'Anna' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Zapisz rejs' })); });
    const [created] = await cruiseRepository.getAll();
    expect(created.crew.members).toEqual([expect.objectContaining({ name: 'Anna', diet: 'omnivore' })]);
  });

  it('should cancel or confirm a supply scaling collision and merge base amounts', async () => {
    const supply = supplyCatalog.nonIngredients[0];
    const cruise = makeCruise('Cruise')
      .updateSupplies(supplies => supplies.add({ id: supply.id, amount: 3, isPerPerson: false, isPerDay: false }))
      .updateSupplies(supplies => supplies.add({ id: supply.id, amount: 5, isPerPerson: true, isPerDay: false }));
    await cruiseRepository.save(cruise);
    const confirm = jest.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<CruiseProvider cruiseId={cruise.id}><CruiseSuppliesTab /></CruiseProvider>);
    const shopping = (await screen.findByText('Lista zakupów')).parentElement!;
    const fixedRow = (await within(shopping).findAllByText(supply.name))[0].closest('li')!;
    await act(async () => { fireEvent.change(within(fixedRow).getByRole('combobox'), { target: { value: 'perPerson' } }); });
    expect((await cruiseRepository.getById(cruise.id))!.supplies.entries).toHaveLength(2);
    await act(async () => { fireEvent.change(within(fixedRow).getByRole('combobox'), { target: { value: 'perPerson' } }); });
    expect(confirm).toHaveBeenCalledTimes(2);
    expect((await cruiseRepository.getById(cruise.id))!.supplies.entries).toEqual([
      expect.objectContaining({ id: supply.id, amount: 8, isPerPerson: true, isPerDay: false }),
    ]);
  });

});
