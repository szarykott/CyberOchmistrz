import { Cruise } from '../model/cruise';

const STORAGE_KEY = 'cyber-ochmistrz-cruises';

function readCruises(): Cruise[] {
  if (typeof window === 'undefined') return [];

  const storedCruises = localStorage.getItem(STORAGE_KEY);
  if (!storedCruises) return [];

  const data: unknown = JSON.parse(storedCruises);
  if (!Array.isArray(data)) throw new Error('Nieprawidłowa lista rejsów');
  return data.map(Cruise.fromData);
}

export const cruiseRepository = {
  async getAll(): Promise<Cruise[]> {
    return readCruises();
  },

  async getById(id: string): Promise<Cruise | undefined> {
    return readCruises().find(cruise => cruise.id === id);
  },

  async save(cruise: Cruise): Promise<void> {
    if (typeof window === 'undefined') return;

    const restored = Cruise.fromData(cruise);
    const cruises = readCruises();
    const existingIndex = cruises.findIndex(c => c.id === restored.id);

    if (existingIndex < 0) {
      cruises.push(restored);
    } else {
      cruises[existingIndex] = restored;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(cruises));
  },

  async delete(id: string): Promise<void> {
    if (typeof window === 'undefined') return;

    const cruises = readCruises().filter(cruise => cruise.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cruises));
  },
};
