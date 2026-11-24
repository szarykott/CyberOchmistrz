import { newId, owned } from './internals';

export interface CrewMember {
  readonly id: string;
  readonly name: string; // can be empty string
  readonly diet: Diet;
  readonly excludedSupplies?: readonly string[];
}

export type Diet = "omnivore" | "vegetarian" | "vegan";

type CrewMemberChanges = Partial<Pick<CrewMember, 'name' | 'diet' | 'excludedSupplies'>>;

function sameMember(member: CrewMember, current: CrewMember): boolean {
  const exclusions = member.excludedSupplies;
  const currentExclusions = current.excludedSupplies;
  return member.id === current.id && member.name === current.name && member.diet === current.diet &&
    (exclusions === currentExclusions || (
      exclusions !== undefined && currentExclusions !== undefined &&
      exclusions.length === currentExclusions.length &&
      exclusions.every((id, index) => id === currentExclusions[index])
    ));
}

function newMemberId(used: ReadonlySet<string>): string {
  let id = newId();
  while (used.has(id)) id = newId();
  return id;
}

export class Crew {
  private constructor(readonly members: readonly CrewMember[]) {
    Object.freeze(this);
  }

  static fromMembers(members: readonly CrewMember[]): Crew {
    return new Crew(owned(members));
  }

  forEditing(): Crew {
    const reserved = new Set(this.members.map(member => member.id));
    const seen = new Set<string>();
    const members = this.members.map(member => {
      if (member.id && !seen.has(member.id)) {
        seen.add(member.id);
        return member;
      }
      const id = newMemberId(reserved);
      reserved.add(id);
      return Object.freeze({ ...member, id });
    });
    return members.every((member, index) => member === this.members[index])
      ? this
      : new Crew(Object.freeze(members));
  }

  addMember(): Crew {
    const id = newMemberId(new Set(this.members.map(member => member.id)));
    const member: CrewMember = { id, name: 'Załogant #' + (this.members.length + 1), diet: 'omnivore' };
    return new Crew(Object.freeze([...this.members, Object.freeze(member)]));
  }

  removeMember(memberId: string): Crew {
    const index = this.#memberIndex(memberId);
    if (index < 0) return this;
    return new Crew(Object.freeze(this.members.filter((_, position) => position !== index)));
  }

  renameMember(memberId: string, name: string): Crew {
    return this.#updateMember(memberId, { name });
  }

  changeDiet(memberId: string, diet: Diet): Crew {
    return this.#updateMember(memberId, { diet });
  }

  changeExclusions(memberId: string, excludedSupplies: readonly string[] | undefined): Crew {
    return this.#updateMember(memberId, { excludedSupplies });
  }

  equals(other: Crew): boolean {
    return this === other || (
      this.members.length === other.members.length &&
      this.members.every((member, index) => sameMember(member, other.members[index]))
    );
  }

  #memberIndex(memberId: string): number {
    if (!memberId) return -1;
    const index = this.members.findIndex(member => member.id === memberId);
    return this.members.some((member, position) => position > index && member.id === memberId) ? -1 : index;
  }

  #updateMember(memberId: string, changes: CrewMemberChanges): Crew {
    const index = this.#memberIndex(memberId);
    if (index < 0) return this;
    const current = this.members[index];
    const member = { ...current, ...changes };
    if (sameMember(member, current)) return this;
    const members = this.members.slice();
    members[index] = owned(member);
    return new Crew(Object.freeze(members));
  }
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
