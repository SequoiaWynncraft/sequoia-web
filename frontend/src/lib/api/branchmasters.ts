export type BranchmasterRank = "owner" | "chief" | "strategist";

export interface BranchmasterMember {
  username: string;
  rank: BranchmasterRank;
  online: boolean;
  contributed: number;
  contribution_rank: number;
  wars: number;
  raids: number;
  joined: string;
}

export interface BranchmastersResponse {
  generated_at: string;
  members: BranchmasterMember[];
}

export function isBranchmastersResponse(value: unknown): value is BranchmastersResponse {
  return (
    isRecord(value) &&
    typeof value.generated_at === "string" &&
    Array.isArray(value.members) &&
    value.members.every(isBranchmasterMember)
  );
}

function isBranchmasterMember(value: unknown): value is BranchmasterMember {
  return (
    isRecord(value) &&
    typeof value.username === "string" &&
    isBranchmasterRank(value.rank) &&
    typeof value.online === "boolean" &&
    isFiniteNumber(value.contributed) &&
    isFiniteNumber(value.contribution_rank) &&
    isFiniteNumber(value.wars) &&
    isFiniteNumber(value.raids) &&
    typeof value.joined === "string"
  );
}

function isBranchmasterRank(value: unknown): value is BranchmasterRank {
  return value === "owner" || value === "chief" || value === "strategist";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
