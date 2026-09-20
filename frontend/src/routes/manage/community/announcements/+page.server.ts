import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const prerender = false;

/** Announcements are authored in the post console now, alongside news. */
export const load: PageServerLoad = () => {
  redirect(308, "/manage/community/posts?feed=announcements");
};
