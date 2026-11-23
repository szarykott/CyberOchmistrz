export interface CrewMember {
  readonly id: string;
  readonly name: string; // can be empty string
  readonly diet: Diet;
  readonly excludedSupplies?: readonly string[];
}

export type Diet = "omnivore" | "vegetarian" | "vegan";

export type CrewMemberChanges = Partial<Pick<CrewMember, 'name' | 'diet' | 'excludedSupplies'>>;

export function addCrewMember(members: readonly CrewMember[]): CrewMember[] {
  const id = `crew-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return [...members, { id, name: 'Załogant #' + (members.length + 1), diet: 'omnivore' }];
}

export function removeCrewMember(members: readonly CrewMember[], index: number): CrewMember[] {
  return members.filter((_, i) => i !== index);
}

export function updateCrewMember(
  members: readonly CrewMember[],
  index: number,
  changes: CrewMemberChanges,
): CrewMember[] {
  return members.map((member, i) => i === index ? { ...member, ...changes } : member);
}

interface DietMetadata {
  readonly labelShort: string;
  readonly labelLong: string;
}

export const DIET_REGISTRY: Record<Diet, DietMetadata> = {
  omnivore:    { labelShort: "wszystkoż.", labelLong: "wszystkożerna" },
  vegetarian:  { labelShort: "weget.",     labelLong: "wegetariańska" },
  vegan:       { labelShort: "weg.",       labelLong: "wegańska" },
};
