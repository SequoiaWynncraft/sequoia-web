
// this file is generated — do not edit it


declare module "svelte/elements" {
	export interface HTMLAttributes<T> {
		'data-sveltekit-keepfocus'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-noscroll'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-preload-code'?:
			| true
			| ''
			| 'eager'
			| 'viewport'
			| 'hover'
			| 'tap'
			| 'off'
			| undefined
			| null;
		'data-sveltekit-preload-data'?: true | '' | 'hover' | 'tap' | 'off' | undefined | null;
		'data-sveltekit-reload'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-replacestate'?: true | '' | 'off' | undefined | null;
	}
}

export {};


declare module "$app/types" {
	type MatcherParam<M> = M extends (param : string) => param is (infer U extends string) ? U : string;

	export interface AppTypes {
		RouteId(): "/" | "/legal" | "/news" | "/services" | "/services/announcements" | "/services/bagshop" | "/services/contact" | "/services/requests" | "/statistics" | "/statistics/guilds" | "/statistics/guilds/raid" | "/statistics/guilds/rankings" | "/statistics/guilds/war" | "/statistics/player" | "/statistics/player/activity" | "/statistics/player/playercard" | "/statistics/player/raids";
		RouteParams(): {
			
		};
		LayoutParams(): {
			"/": Record<string, never>;
			"/legal": Record<string, never>;
			"/news": Record<string, never>;
			"/services": Record<string, never>;
			"/services/announcements": Record<string, never>;
			"/services/bagshop": Record<string, never>;
			"/services/contact": Record<string, never>;
			"/services/requests": Record<string, never>;
			"/statistics": Record<string, never>;
			"/statistics/guilds": Record<string, never>;
			"/statistics/guilds/raid": Record<string, never>;
			"/statistics/guilds/rankings": Record<string, never>;
			"/statistics/guilds/war": Record<string, never>;
			"/statistics/player": Record<string, never>;
			"/statistics/player/activity": Record<string, never>;
			"/statistics/player/playercard": Record<string, never>;
			"/statistics/player/raids": Record<string, never>
		};
		Pathname(): "/" | "/legal" | "/news" | "/services" | "/services/announcements" | "/services/bagshop" | "/services/contact" | "/services/requests" | "/statistics" | "/statistics/guilds" | "/statistics/guilds/raid" | "/statistics/guilds/rankings" | "/statistics/guilds/war" | "/statistics/player" | "/statistics/player/activity" | "/statistics/player/playercard" | "/statistics/player/raids";
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): "/assets/fonts/minecraft-bold-italic.otf" | "/assets/fonts/minecraft-bold.otf" | "/assets/fonts/minecraft-italic.otf" | "/assets/fonts/minecraft-regular.otf" | "/assets/images/anni_july_page.avif" | "/assets/images/cozy_aspec.avif" | "/assets/images/fruma_banner.avif" | "/assets/images/nolers2.avif" | "/assets/images/nolers3.avif" | "/assets/images/nol_banner.avif" | "/assets/images/nol_chibi_rush_all.avif" | "/assets/images/sequoia-logo.avif" | "/assets/images/spirits_propaganda_chibis.avif" | "/assets/images/tcc_gloating_rights.avif" | string & {};
	}
}