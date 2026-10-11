/** Test-only sample of Sierra GET /v1/achievements/me. */
const ladder = [
  { label: "Bronze", at: 25 }, { label: "Silver", at: 50 }, { label: "Gold", at: 100 }, { label: "Platinum", at: 500 },
];

// Fictional player and award ids.
export const sampleProgress = {
  player: { uuid: "00000000-0000-4000-8000-000000000001", username: "FictionalMember" },
  eligible: true,
  categories: [
    { key: "raid:TNA", kind: "raid", label: "TNA", value: null, unknown: true, level: 0, tier_label: null, next: { label: "Bronze", at: 25 }, ladder },
    { key: "war:completed", kind: "war", label: "Guild wars", value: 137, unknown: false, level: 3, tier_label: "Gold", next: { label: "Platinum", at: 500 }, ladder },
    { key: "profession:mining", kind: "profession", label: "Mining", value: 112, unknown: false, level: 2, tier_label: "Level 110",
      next: { label: "Level 120", at: 120 }, ladder: [{ label: "Level 100", at: 100 }, { label: "Level 110", at: 110 }, { label: "Level 120", at: 120 }, { label: "Level 132", at: 132 }] },
    { key: "raid:NOTG", kind: "raid", label: "NOTG", value: 600, unknown: false, level: 4, tier_label: "Platinum", next: null, ladder },
  ],
  history: [
    { award_id: null, key: "raid:TNA", label: "Silver, TNA", earned_at: null },
    { award_id: "a1", key: "war:completed", label: "Silver, Guild wars", earned_at: "2026-09-01T12:00:00Z" },
    { award_id: "a2", key: "war:completed", label: "Gold, Guild wars", earned_at: "2026-10-11T12:00:00Z" },
  ],
};
