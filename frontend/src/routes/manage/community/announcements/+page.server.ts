import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const prerender = false;

export const load: PageServerLoad = () => {
  redirect(308, "/manage/community/posts?feed=announcements");
};
