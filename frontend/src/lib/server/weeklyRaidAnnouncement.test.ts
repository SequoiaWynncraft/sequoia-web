import { afterEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  players: [
    { username: "Aylin", uuid: "11111111-1111-1111-1111-111111111111", count: 104 },
    { username: "Boreas", uuid: "22222222-2222-2222-2222-222222222222", count: 104 },
    { username: "_Seq_", uuid: "33333333-3333-3333-3333-333333333333", count: 90 },
    { username: "Dris", uuid: "44444444-4444-4444-4444-444444444444", count: 70 },
    { username: "Eir", uuid: "55555555-5555-5555-5555-555555555555", count: 70 },
  ],
}));

vi.mock("$lib/server/sequoiaBackend", () => ({
  sequoiaBackendInternalHeaders: () => ({ authorization: "Bearer mod" }),
  sequoiaBackendOrigin: () => "https://backend.test",
}));
vi.mock("$lib/server/sequoiaWebBackend", () => ({
  sequoiaWebBackendUrl: (path: string) => `https://web.test${path}`,
  sequoiaWebBackendInternalHeaders: () => ({ authorization: "Bearer web" }),
}));
vi.mock("$lib/server/guildStats", () => ({
  getGuildStats: async () => ({
    members: H.players.map((player) => ({
      username: player.username,
      uuid: player.uuid,
      rank: "recruit",
    })),
  }),
}));

// Imported after the mocks so the module binds the stubbed backends.
const { buildWeeklyRaidAnnouncement, isAnnouncementViewer, weekWindows } = await import(
  "$lib/server/weeklyRaidAnnouncement"
);

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Routes the mod leaderboard: NOTG (and the unfiltered total) carry the sample
 * roster; every other raid comes back empty. */
function stubModLeaderboard() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = new URL(input.toString());
      const raid = url.searchParams.get("raid");
      const entries =
        raid === null || raid === "Nest of the Grootslangs"
          ? H.players.map((p) => ({ player_uuid: p.uuid, username: p.username, raids: p.count }))
          : [];
      return new Response(JSON.stringify({ entries }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

/** Routes the mod leaderboard as above, but fails every read in the previous
 * week's window - the two weeks must degrade independently. */
function stubModLeaderboardCurrentWeekOnly(previousStart: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = new URL(input.toString());
      if (url.searchParams.get("from") === previousStart) {
        return new Response("nope", { status: 503 });
      }
      const raid = url.searchParams.get("raid");
      const entries =
        raid === null || raid === "Nest of the Grootslangs"
          ? H.players.map((p) => ({ player_uuid: p.uuid, username: p.username, raids: p.count }))
          : [];
      return new Response(JSON.stringify({ entries }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

describe("weekWindows", () => {
  it("anchors weeks to the fixed Sunday 23:00 UTC reset", () => {
    const windows = weekWindows(Date.parse("2026-07-25T12:27:18Z"));
    expect(windows.current.start).toBe("2026-07-19T23:00:00.000Z");
    expect(windows.current.end).toBe("2026-07-26T23:00:00.000Z");
    expect(windows.previous.start).toBe("2026-07-12T23:00:00.000Z");
    expect(windows.previous.end).toBe("2026-07-19T23:00:00.000Z");
  });

  it("treats the boundary instant as the start of the new week", () => {
    const windows = weekWindows(Date.parse("2026-07-19T23:00:00Z"));
    expect(windows.current.start).toBe("2026-07-19T23:00:00.000Z");
  });
});

describe("buildWeeklyRaidAnnouncement", () => {
  it("groups ties into places and totals completions", async () => {
    stubModLeaderboard();
    const announcement = await buildWeeklyRaidAnnouncement(fetch);
    expect(announcement).not.toBeNull();
    const current = announcement!.current;
    expect(current.completions).toBe(438);
    const notg = current.raids.find((raid) => raid.short === "NOTG")!;
    expect(notg.ranks).toEqual([
      { count: 104, players: ["Aylin", "Boreas"] },
      { count: 90, players: ["_Seq_"] },
      { count: 70, players: ["Dris", "Eir"] },
    ]);
  });

  it("renders the Discord text exactly, escaping names and pinging first place only", async () => {
    stubModLeaderboard();
    const announcement = await buildWeeklyRaidAnnouncement(fetch);
    expect(announcement!.current.discordText).toBe(
      [
        "# **<:Aspect:1351246116024352818> Weekly Guild Raid Leaderboard <:Aspect:1351246116024352818>**",
        "",
        "**NOTG**",
        "-:first_place:Aylin & Boreas - 104 <@&1353722648626073721>",
        "-:second_place:\\_Seq\\_ - 90",
        "-:third_place:Dris & Eir - 70",
        "",
        "**NOL**",
        "",
        "**TCC**",
        "",
        "**TNA**",
        "",
        "**TWP**",
        "",
        "_Please message me for your role color_",
        "-# Raid data taken from seqmod-raids tracker and may be inaccurate",
      ].join("\n"),
    );
  });

  it("keeps the current week when the previous week's read fails", async () => {
    const now = Date.now();
    stubModLeaderboardCurrentWeekOnly(weekWindows(now).previous.start);
    const announcement = await buildWeeklyRaidAnnouncement(fetch);
    expect(announcement).not.toBeNull();
    expect(announcement!.previous).toBeNull();
    expect(announcement!.current.completions).toBe(438);
  });
});

/** Builds a linked-profiles response carrying one profile's branch standings. */
function profilesWith(
  uuid: string,
  branches: { key: string; branch: string; level: "member" | "trainee" }[],
) {
  return {
    profiles: [{ minecraft: { uuid, username: "Aylin" }, summary: { branches } }],
  } as unknown as Parameters<typeof isAnnouncementViewer>[0];
}

/** The guild roster the gate checks membership against. */
function rosterWith(...uuids: string[]) {
  return uuids.map((uuid) => ({
    username: "Aylin",
    uuid,
    rank: "recruit",
  })) as unknown as Parameters<typeof isAnnouncementViewer>[1];
}

describe("isAnnouncementViewer", () => {
  const UUID = H.players[0].uuid;
  const viewer = { discordId: "1", discordUsername: null, minecraftUuid: UUID, minecraftUsername: null };
  const DEV = { key: "branch.development", branch: "development", level: "member" as const };

  it("admits a full Development or Community member who is on the roster", () => {
    expect(isAnnouncementViewer(profilesWith(UUID, [DEV]), rosterWith(UUID), viewer)).toBe(true);
    const community = { key: "branch.community", branch: "community", level: "member" as const };
    expect(isAnnouncementViewer(profilesWith(UUID, [community]), rosterWith(UUID), viewer)).toBe(
      true,
    );
  });

  it("denies anonymous viewers", () => {
    expect(isAnnouncementViewer(profilesWith(UUID, [DEV]), rosterWith(UUID), null)).toBe(false);
  });

  it("denies branch trainees", () => {
    const trainee = { ...DEV, level: "trainee" as const };
    expect(isAnnouncementViewer(profilesWith(UUID, [trainee]), rosterWith(UUID), viewer)).toBe(
      false,
    );
  });

  it("denies other branches", () => {
    const military = { key: "branch.military", branch: "military", level: "member" as const };
    expect(isAnnouncementViewer(profilesWith(UUID, [military]), rosterWith(UUID), viewer)).toBe(
      false,
    );
  });

  it("denies a branch member who has left the guild roster", () => {
    expect(isAnnouncementViewer(profilesWith(UUID, [DEV]), rosterWith(), viewer)).toBe(false);
  });

  it("denies a roster member with no linked rank profile", () => {
    const other = H.players[1].uuid;
    expect(isAnnouncementViewer(profilesWith(other, [DEV]), rosterWith(UUID), viewer)).toBe(false);
  });
});
