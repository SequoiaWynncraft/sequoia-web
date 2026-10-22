import { describe, expect, it } from "vitest";
import {
  canSortMilestones, catalogEditable, catalogGroups, catalogIssue, categoryIssue, milestonePreviewable, nextMilestone,
  parseCatalogResponse, resetCategory, sortMilestones, type CatalogCategory,
} from "./catalog";
import { catalogFixture } from "./catalog.fixture";

const { limits, tiers, defaults } = catalogFixture;
const [raid, war, profession, role, badge] = catalogFixture.catalog.categories;

describe("achievement catalog parsing", () => {
  it("accepts the server view and fills optional fields", () => {
    expect(parseCatalogResponse(structuredClone(catalogFixture))).toEqual(catalogFixture);
    const { stories: _stories, updated_by: _by, updated_at: _at, ...bare } = structuredClone(catalogFixture);
    expect(parseCatalogResponse(bare)).toMatchObject({ stories: [], updated_by: null, updated_at: null });
  });
  it("rejects unusable views rather than guessing", () => {
    expect(parseCatalogResponse(null)).toBeNull();
    expect(parseCatalogResponse({ ...catalogFixture, catalog: { version: -1, categories: [] } })).toBeNull();
    expect(parseCatalogResponse({ ...catalogFixture, defaults: undefined })).toBeNull();
    expect(parseCatalogResponse({ ...catalogFixture, tiers: [] })).toBeNull();
    expect(parseCatalogResponse({ ...catalogFixture, limits: { ...limits, label_max: 0 } })).toBeNull();
    const broken = structuredClone(catalogFixture);
    (broken.catalog.categories[0].milestones[0] as { at: unknown }).at = "25";
    expect(parseCatalogResponse(broken)).toBeNull();
  });
});

describe("achievement catalog editing", () => {
  it("groups by kind in server order and limits edits by kind", () => {
    expect(catalogGroups(catalogFixture.catalog.categories).map(({ label, categories }) => [label, categories.length]))
      .toEqual([["Raids", 1], ["Guild wars", 1], ["Professions", 1], ["Roles", 1], ["Badges", 1]]);
    expect(catalogEditable("raid")).toEqual({ label: true, milestones: true });
    expect(catalogEditable("role")).toEqual({ label: true, milestones: false });
    expect(catalogEditable("badge")).toEqual({ label: false, milestones: false });
  });
  it("hints at the first local problem and names the category", () => {
    const edit = (category: CatalogCategory, change: Partial<CatalogCategory>) => categoryIssue({ ...category, ...change }, limits, tiers);
    expect(catalogIssue(catalogFixture.catalog.categories, limits, tiers)).toBeNull();
    expect(edit(raid, { label: " " })).toBe("Use a name of 1 to 32 characters.");
    expect(edit(role, { label: "x".repeat(33) })).toBe("Use a name of 1 to 32 characters.");
    expect(edit(badge, { label: "" })).toBeNull();
    expect(edit(raid, { milestones: [] })).toBe("Add at least one milestone.");
    expect(edit(raid, { milestones: [...raid.milestones, ...raid.milestones] })).toBe("Use at most 3 milestones.");
    expect(edit(profession, { milestones: [{ ...profession.milestones[0], at: 133 }] })).toBe("Use whole-number thresholds from 1 to 132.");
    expect(edit(war, { milestones: [{ ...war.milestones[0], at: 2.5 }] })).toBe("Use whole-number thresholds from 1 to 1,000,000.");
    expect(edit(war, { milestones: [{ ...war.milestones[0], label: "x".repeat(21) }] })).toBe("Use milestone labels of 1 to 20 characters.");
    expect(edit(war, { milestones: [{ ...war.milestones[0], tier: "mythril" }] })).toBe("Choose a style for every milestone.");
    expect(edit(raid, { milestones: [raid.milestones[0], { ...raid.milestones[1], at: 25 }] })).toBe("Thresholds must increase from top to bottom.");
    expect(catalogIssue([{ ...raid, milestones: [] }], limits, tiers)).toBe("TNA: Add at least one milestone.");
  });
  it("sorts only on request and keeps ids", () => {
    const reversed = [...raid.milestones].reverse();
    expect(canSortMilestones(raid.milestones)).toBe(false);
    expect(canSortMilestones(reversed)).toBe(true);
    expect(sortMilestones(reversed)).toEqual(raid.milestones);
    expect(reversed[0].id).toBe("gold");
  });
  it("adds an unsaved milestone past the last threshold in the last style", () => {
    expect(nextMilestone(raid, limits, tiers)).toEqual({ id: "", at: 101, label: "Gold", tier: "gold" });
    expect(nextMilestone({ ...raid, milestones: [] }, limits, tiers)).toEqual({ id: "", at: 1, label: "Bronze", tier: "bronze" });
    expect(nextMilestone({ ...profession, milestones: [{ ...profession.milestones[0], at: 132 }] }, limits, tiers)).toMatchObject({ at: 132, label: "Level 132" });
  });
  it("resets to the seeded ids while keeping the enabled switch", () => {
    expect(resetCategory({ ...war, label: "Wars", milestones: [] }, defaults)).toEqual({ ...defaults[1], enabled: false });
    expect(resetCategory(raid, defaults)?.milestones.map(({ id }) => id)).toEqual(["bronze", "silver", "gold"]);
    expect(resetCategory({ ...raid, key: "raid:unknown" }, defaults)).toBeNull();
  });
  it("previews only milestones identical to their saved row", () => {
    const [bronze] = raid.milestones;
    expect(milestonePreviewable(raid, raid, bronze)).toBe(true);
    expect(milestonePreviewable(raid, raid, { ...bronze, at: 26 })).toBe(false);
    expect(milestonePreviewable(raid, raid, { ...bronze, id: "" })).toBe(false);
    expect(milestonePreviewable(raid, { ...raid, label: "Renamed" }, bronze)).toBe(false);
    expect(milestonePreviewable(undefined, raid, bronze)).toBe(false);
  });
});
