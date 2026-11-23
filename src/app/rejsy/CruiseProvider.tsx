import { createContext, ReactNode, useContext, useEffect, useState, useRef } from 'react';
import { Cruise } from '@/model/cruise';
import { cruiseRepository } from '@/data/cruiseRepository';

type CruiseContextValue = {
  cruise: Cruise,
  setCruise: (update: (cruise: Cruise) => Cruise) => Promise<void>
}

type CruiseProviderProps = {
  cruiseId: string,
  children: ReactNode
}

const CruiseContext = createContext<CruiseContextValue>(null!);

export function CruiseProvider({ cruiseId, children }: CruiseProviderProps) {
  const [cruise, setCruiseState] = useState<Cruise>();
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const currentCruise = useRef<Cruise>(undefined);
  const saveQueue = useRef(Promise.resolve());

  useEffect(() => {
    let active = true;
    cruiseRepository.getById(cruiseId).then(found => {
      if (!active) return;
      if (!found) {
        setLoadError('Nie znaleziono rejsu');
        return;
      }
      currentCruise.current = found;
      setCruiseState(found);
    }, () => {
      if (active) setLoadError('Nie udało się wczytać rejsu');
    });
    return () => { active = false; };
  }, [cruiseId]);

  const setCruise: CruiseContextValue['setCruise'] = (update) => {
    const saved = saveQueue.current.then(async () => {
      const current = currentCruise.current!;
      const next = update(current);
      if (next === current) return;
      await cruiseRepository.save(next);
      currentCruise.current = next;
      setCruiseState(next);
      setSaveError('');
    });
    saveQueue.current = saved.catch(() => setSaveError('Nie udało się zapisać zmian w rejsie'));
    return saved;
  };

  if (loadError) return <p role="alert" className="error-text">{loadError}</p>;
  if (!cruise) return <p role="status">Wczytywanie rejsu…</p>;

  const value: CruiseContextValue = {cruise, setCruise};

  return (
  <CruiseContext.Provider value={value}>
    {saveError && <p role="alert" className="error-text">{saveError}</p>}
    {children}
  </CruiseContext.Provider>)
}

export function useCruise(): CruiseContextValue {
  const context = useContext(CruiseContext);
  if (context === null) {
    throw new Error('useCruise must be used within CruiseProvider');
  }
  return context;
}
