import type { CatalogResponse } from "./catalog";

// Fictional catalog view: one category of each kind, not the seeded catalog.
export const catalogFixture: CatalogResponse = {
  catalog: {
    version: 3,
    categories: [
      { key: "raid:TNA", kind: "raid", enabled: true, label: "TNA", milestones: [
        { id: "bronze", at: 25, label: "Bronze", tier: "bronze" },
        { id: "gold", at: 100, label: "Gold", tier: "gold" },
      ] },
      { key: "war:completed", kind: "war", enabled: false, label: "Guild wars", milestones: [{ id: "silver", at: 50, label: "Silver", tier: "silver" }] },
      { key: "profession:mining", kind: "profession", enabled: true, label: "Mining", milestones: [{ id: "l100", at: 100, label: "Level 100", tier: "gold" }] },
      { key: "role:insignia", kind: "role", enabled: true, label: "Insignia", milestones: [] },
      { key: "badge", kind: "badge", enabled: true, label: "Badges", milestones: [] },
    ],
  },
  defaults: [
    { key: "raid:TNA", kind: "raid", enabled: true, label: "TNA", milestones: [
      { id: "bronze", at: 25, label: "Bronze", tier: "bronze" },
      { id: "silver", at: 50, label: "Silver", tier: "silver" },
      { id: "gold", at: 100, label: "Gold", tier: "gold" },
    ] },
    { key: "war:completed", kind: "war", enabled: true, label: "Guild wars", milestones: [{ id: "silver", at: 50, label: "Silver", tier: "silver" }] },
    { key: "profession:mining", kind: "profession", enabled: true, label: "Mining", milestones: [{ id: "l100", at: 100, label: "Level 100", tier: "gold" }] },
    { key: "role:insignia", kind: "role", enabled: true, label: "Insignia", milestones: [] },
    { key: "badge", kind: "badge", enabled: true, label: "Badges", milestones: [] },
  ],
  tiers: [{ id: "bronze", label: "Bronze" }, { id: "silver", label: "Silver" }, { id: "gold", label: "Gold" }],
  limits: { name_max: 32, label_max: 20, milestones_max: 3, count_max: 1000000, level_max: 132 },
  stories: [{ id: "sample_story", label: "Sample story", ready: true }, { id: "pending_story", label: "Pending story", ready: false }],
  updated_by: "1111111111111111111",
  updated_at: "2026-10-11T12:00:00Z",
};
