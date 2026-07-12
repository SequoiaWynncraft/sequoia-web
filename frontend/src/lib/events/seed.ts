import type { GuildEvent } from "./types";

/**
 * One-time seed for the event store: imported into the database the first
 * time it initializes, then never consulted again - events are managed
 * through /events/manage from that point on. Deleting a seeded event does
 * not resurrect it.
 */
export const SEED_EVENTS: GuildEvent[] = [
  {
    slug: "the-nameless-hunt",
    name: "The Nameless Hunt",
    tagline: "A guild raid push into the void.",
    access: "members",
    theme: {
      sky: ["#171120", "#251b38"],
      accent: "#a78bfa",
      accentSecondary: "#8fb2f0",
      star: "#c4b5fd",
    },
    about: [
      "A guild-wide raid push. Every guild raid completed inside the event window counts toward the pool, and the pool unlocks the prizes.",
    ],
    goals: [
      {
        metricLabel: "guild raids",
        milestones: [{ at: 2500, unlock: "Rank Up Raffle" }],
        feed: "raids",
      },
    ],
    prizes: [
      { donor: "kd", prize: "5 stx LE" },
      { donor: "hmar", prize: "5 stx LE" },
      { donor: "lastly", prize: "10 stx LE + 50-80 CAD in crates" },
      { donor: "notes", prize: "$25 store credit" },
      { donor: "shisouhan", prize: "30 stx LE" },
      { donor: "kat", prize: "Rank upgrade - caps at Champion" },
      { donor: "raidkeeper", prize: "$25 store credit" },
      { donor: "seedtech", prize: "$25 store credit, Colossal Rat, 25 Party Crackers, 10 Scroll Charge Bombs" },
      { donor: "patcrafter07", prize: "~5 stx LE for Lost Eye bounties" },
      { donor: "purprated", prize: "10 stx LE + Moontower" },
    ],
    prizesNote: "Donated by members. Raffle allocation TBA.",
    comp: {
      roles: [
        { role: "Healer", builds: "Acolyte or Lightbender", note: "Acolyte preferred" },
        { role: "Flex DPS", builds: "Boltslinger, Fallen - anything with good movement" },
        { role: "Main DPS", builds: "Pure damage build" },
        { role: "Paladin", builds: "Ascendant, Guardian, or Hero" },
      ],
      note: "Run at least one main DPS. Stacked comp: Reso / Cspring / Cata or Cspring / Guard.",
    },
    rules: [
      "All guild raids completed inside the event window count toward the goal.",
      "The Rank Up Raffle unlocks when the guild reaches 2,500 raids.",
      "Rank upgrade prize: Captain or above, with enough raffle entries. Entry thresholds TBA.",
      "Rank upgrades cap at Champion - Champion holders are not eligible for that prize.",
    ],
  },
  {
    slug: "grootslang-gauntlet",
    name: "Grootslang Gauntlet",
    tagline: "Open raid marathon in the Nest.",
    access: "public",
    startsAt: "2026-07-05T00:00:00Z",
    endsAt: "2026-07-19T23:59:59Z",
    theme: {
      sky: ["#0c1610", "#15271b"],
      accent: "#57cc82",
      accentSecondary: "#a8e063",
      star: "#9fdcb4",
    },
    about: [
      "Two weeks of Nest of the Grootslangs. Party up in guild chat - allies and guests welcome.",
    ],
    goals: [
      {
        metricLabel: "Nest of the Grootslangs clears",
        milestones: [{ at: 750, unlock: "Giveaway drawing" }],
        feed: "raids",
        countRaid: "Nest of the Grootslangs",
      },
    ],
    rules: [
      "Open to everyone - guild membership not required.",
      "Clears count while at least one Sequoia member is in the party.",
    ],
  },
  {
    slug: "lsto-article-5",
    name: "LSTO Article 5",
    tagline: "An attack on one is an attack on all.",
    access: "members",
    startsAt: "2026-08-03T00:00:00Z",
    endsAt: "2026-08-10T23:59:59Z",
    theme: {
      sky: ["#190d10", "#2a1418"],
      accent: "#e05252",
      accentSecondary: "#f0938d",
      star: "#eba8a3",
    },
    about: [
      "Titans Valor has invoked Article 5 of the Llevigar-Selchar Treaty Organisation. Sequoia answers the call - seven days defending the ocean from our enemies.",
    ],
    goals: [
      {
        metricLabel: "wars",
        milestones: [{ at: 1000, unlock: "War chest payout" }],
      },
    ],
    rules: [
      "Wars count from the first territory hit to the closing bell.",
      "Article 5 obligations are non-negotiable.",
    ],
  },
  {
    slug: "colossus-sprint",
    name: "Colossus Sprint",
    tagline: "One week against the Canyon Colossus.",
    access: "public",
    startsAt: "2026-06-01T00:00:00Z",
    endsAt: "2026-06-08T23:59:59Z",
    theme: {
      sky: ["#191208", "#2a2012"],
      accent: "#e0a458",
      accentSecondary: "#f0cf8d",
      star: "#e6c99a",
    },
    about: ["A one-week sprint through The Canyon Colossus. Goal met on day six."],
    goals: [
      {
        metricLabel: "The Canyon Colossus clears",
        milestones: [{ at: 600, unlock: "Reward night" }],
        feed: "raids",
        countRaid: "The Canyon Colossus",
        finalTotal: 683,
      },
    ],
  },
];
