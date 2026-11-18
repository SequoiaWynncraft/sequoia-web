import type {
  CompRole,
  EventGoal,
  EventIcon,
  EventRaffle,
  EventTheme,
  GuildEvent,
  PersonalMilestone,
  PrizeEntry,
  RaffleWinner,
} from "./types";

/**
 * The browser contracts for events: the hub, the homepage band, the detail
 * page and the raffle stage. A stored `GuildEvent` also carries configuration
 * only the editor and the server use - raffle eligibility (manual
 * include/exclude names and UUIDs, rules, ticket weights), ticket maths, how
 * each winner was chosen, tracker and activity-feed settings. None of that is
 * rendered for a viewer, so every field below is copied explicitly, nested
 * objects included: a field added to `GuildEvent` stays server-side until it
 * is added here on purpose. Managers edit the full event under /manage/events.
 */
export type ViewerRaffleWinner = Pick<RaffleWinner, "slot" | "username" | "player_uuid">;

export type ViewerRaffle = Pick<EventRaffle, "id" | "prize" | "winnerCount" | "icon" | "wheelStyle" | "drawnAt"> & {
  winners?: ViewerRaffleWinner[];
};

export type ViewerEventGoal = Pick<EventGoal, "metricLabel" | "milestones" | "finalTotal" | "milestoneStyle">;

/** What a locked (members-only) event shows to a visitor who can't open it. */
export type EventTeaser = Pick<
  GuildEvent,
  "slug" | "name" | "tagline" | "access" | "theme" | "icon" | "startsAt" | "endsAt" | "about"
>;

export type ViewerEvent = EventTeaser &
  Pick<GuildEvent, "personalMilestones" | "prizes" | "prizesNote" | "comp" | "rules" | "raffleHideWheel"> & {
    goals?: ViewerEventGoal[];
    raffles?: ViewerRaffle[];
  };

/** A band on the events hub. */
export type HubEvent = Pick<EventTeaser, "slug" | "name" | "tagline" | "access" | "theme" | "icon" | "startsAt" | "endsAt"> & {
  goal?: ViewerEventGoal;
  draft?: true;
};

/** A card in the homepage "Latest" row. */
export type HomepageEvent = Pick<EventTeaser, "slug" | "name" | "tagline" | "theme" | "startsAt" | "endsAt">;

export function eventTeaser(event: GuildEvent): EventTeaser {
  return defined({
    ...homepageEvent(event),
    access: event.access,
    icon: event.icon && viewerIcon(event.icon),
    about: event.about && [...event.about],
  });
}

export function homepageEvent(event: GuildEvent): HomepageEvent {
  return defined({
    slug: event.slug,
    name: event.name,
    tagline: event.tagline,
    theme: viewerTheme(event.theme),
    startsAt: event.startsAt,
    endsAt: event.endsAt,
  });
}

/**
 * The stored goal a hub band shows: a public event's primary goal. Members-only
 * goals stay behind the event page's gate. The hub's progress loader reads the
 * feed settings from this stored goal before the band is projected.
 */
export function hubGoal(event: GuildEvent): EventGoal | undefined {
  return event.access === "public" ? event.goals?.[0] : undefined;
}

export function hubEvent(event: GuildEvent, published = true): HubEvent {
  const goal = hubGoal(event);
  return defined({
    ...homepageEvent(event),
    access: event.access,
    icon: event.icon?.placements.includes("band") ? viewerIcon(event.icon) : undefined,
    goal: goal && viewerGoal(goal),
    draft: published ? undefined : (true as const),
  });
}

export interface ViewerEventOptions {
  /** `raffleId:slot` keys whose wheel is still spinning; their winners stay hidden until it settles. */
  spinningSlots?: readonly string[];
}

export function viewerEvent(event: GuildEvent, options: ViewerEventOptions = {}): ViewerEvent {
  const spinning = new Set(options.spinningSlots ?? []);
  return defined({
    ...eventTeaser(event),
    goals: event.goals?.map(viewerGoal),
    personalMilestones: event.personalMilestones?.map(viewerPersonalMilestone),
    prizes: event.prizes?.map(viewerPrize),
    prizesNote: event.prizesNote,
    comp: event.comp && defined({ roles: event.comp.roles.map(viewerCompRole), note: event.comp.note }),
    rules: event.rules && [...event.rules],
    raffles: event.raffles?.map((raffle) => viewerRaffle(raffle, spinning)),
    raffleHideWheel: event.raffleHideWheel,
  });
}

function viewerTheme(theme: EventTheme): EventTheme {
  return {
    sky: [theme.sky[0], theme.sky[1]],
    accent: theme.accent,
    accentSecondary: theme.accentSecondary,
    star: theme.star,
  };
}

function viewerIcon(icon: EventIcon): EventIcon {
  return { file: icon.file, placements: [...icon.placements] };
}

function viewerGoal(goal: EventGoal): ViewerEventGoal {
  return defined({
    metricLabel: goal.metricLabel,
    milestones: goal.milestones.map((milestone) =>
      defined({ at: milestone.at, unlock: milestone.unlock, label: milestone.label }),
    ),
    finalTotal: goal.finalTotal,
    milestoneStyle: goal.milestoneStyle,
  });
}

function viewerPersonalMilestone(milestone: PersonalMilestone): PersonalMilestone {
  return { id: milestone.id, at: milestone.at, unlock: milestone.unlock };
}

function viewerPrize(entry: PrizeEntry): PrizeEntry {
  return defined({ donor: entry.donor, prize: entry.prize, donorPlayer: entry.donorPlayer });
}

function viewerCompRole(role: CompRole): CompRole {
  return defined({ role: role.role, builds: role.builds, note: role.note });
}

function viewerRaffle(raffle: EventRaffle, spinning: ReadonlySet<string>): ViewerRaffle {
  return defined({
    id: raffle.id,
    prize: raffle.prize,
    winnerCount: raffle.winnerCount,
    icon: raffle.icon,
    wheelStyle: raffle.wheelStyle,
    drawnAt: raffle.drawnAt,
    winners: raffle.winners
      ?.filter((winner) => !spinning.has(`${raffle.id}:${winner.slot}`))
      .map((winner) => ({ slot: winner.slot, username: winner.username, player_uuid: winner.player_uuid })),
  });
}

/** Drops undefined-valued keys so the serialized page data only names fields that are set. */
function defined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T;
}
