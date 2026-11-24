import { CrewMember } from '../model/cruise/crew'

export interface CruiseFormData {
  name: string;
  length: number;
  crewMembers: CrewMember[];
  startDate?: string;
}

export interface CruiseFormErrors {
  name: string;
  length: string;
  crewMembers: string;
  startDate: string;
}
