import { describe, expect, it, vi } from "vitest";
import { render } from "svelte/server";
import CatalogManager from "./CatalogManager.svelte";
import { catalogFixture } from "./catalog.fixture";

vi.mock("$app/navigation", () => ({ beforeNavigate: vi.fn() }));

describe("achievement catalog interface", () => {
  it("groups categories with labeled toggles and names by kind", () => {
    const { body } = render(CatalogManager, { props: { initial: catalogFixture } });
    for (const label of ["Raids", "Guild wars", "Professions", "Roles", "Badges"]) expect(body).toContain(`>${label}</h2>`);
    for (const label of ["TNA", "Guild wars", "Mining", "Insignia", "Badges"]) expect(body).toContain(`<span>Enable ${label}</span>`);
    expect(body).toContain('aria-label="TNA name"');
    expect(body).toContain('aria-label="Insignia name"');
    expect(body).not.toContain('aria-label="Badges name"');
    expect(body).toContain("2 milestones");
    expect(body).toContain('aria-label="Edit TNA milestones"');
    expect(body).not.toContain('aria-label="Edit Insignia milestones"');
    expect(body).toContain("Saved version 3");
    expect(body).not.toContain("\u2014");
  });
  it("states the award rule once and offers only ready stories for previews", () => {
    const { body } = render(CatalogManager, { props: { initial: catalogFixture } });
    expect(body.match(/Edits never revoke or repeat an award\./g)).toHaveLength(1);
    expect(body).toMatch(/<option[^>]*value="sample_story"[^>]*>Sample story/);
    expect(body).not.toContain("pending_story");
    expect(body).toContain("No milestone selected.");
    expect(body).toMatch(/<button disabled=""[^>]*>(?:<!--[^>]*-->|\s)*Save changes/);
  });
  it("explains a missing renderer without an image", () => {
    const { body } = render(CatalogManager, { props: { initial: { ...catalogFixture, stories: [] } } });
    expect(body).toContain("Ceremony artwork is not installed yet.");
    expect(body).not.toContain("<img");
  });
});
