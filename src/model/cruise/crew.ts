import { addCrewMember, removeCrewMember, updateCrewMember } from '../crew';
import type { CrewMember, CrewMemberChanges, Diet } from '../crew';
import type { Cruise } from './index';
import { owned } from './internals';

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

export class Crew {
  readonly #members: readonly CrewMember[];
  readonly #commit: (members: readonly CrewMember[]) => Cruise;

  constructor(members: readonly CrewMember[], commit: (members: readonly CrewMember[]) => Cruise) {
    this.#members = members;
    this.#commit = commit;
    Object.freeze(this);
  }

  get members(): readonly CrewMember[] {
    return this.#members;
  }

  addMember(): Cruise {
    const members = addCrewMember(this.#members);
    Object.freeze(members[members.length - 1]);
    return this.#commit(Object.freeze(members));
  }

  removeMember(index: number): Cruise {
    const members = removeCrewMember(this.#members, index);
    return this.#commit(members.length === this.#members.length ? this.#members : Object.freeze(members));
  }

  renameMember(index: number, name: string): Cruise {
    return this.#updateMember(index, { name });
  }

  changeDiet(index: number, diet: Diet): Cruise {
    return this.#updateMember(index, { diet });
  }

  changeExclusions(index: number, excludedSupplies: readonly string[] | undefined): Cruise {
    return this.#updateMember(index, { excludedSupplies });
  }

  replace(members: readonly CrewMember[]): Cruise {
    const unchanged = members.length === this.#members.length &&
      members.every((member, index) => sameMember(member, this.#members[index]));
    return this.#commit(unchanged ? this.#members : owned(members));
  }

  #updateMember(index: number, changes: CrewMemberChanges): Cruise {
    const current = this.#members[index];
    if (!current) return this.#commit(this.#members);
    const members = updateCrewMember(this.#members, index, changes);
    if (sameMember(members[index], current)) return this.#commit(this.#members);
    members[index] = owned(members[index]);
    return this.#commit(Object.freeze(members));
  }
}
