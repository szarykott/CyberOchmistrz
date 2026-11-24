import suppliesData from './supplies.json';
import { SupplyCatalog } from '../model/supply';

export const supplyCatalog = new SupplyCatalog(suppliesData);
