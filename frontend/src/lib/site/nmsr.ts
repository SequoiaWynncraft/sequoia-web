import { NMSR_BASE_URL } from "#lib/config/public.js";

/** Self-hosted NMSR skin renderer (github.com/NickAcPT/nmsr-rs). */
function base(): string {
  return NMSR_BASE_URL.replace(/\/+$/, "");
}

/** Flat face render — avatars in tables and chips. */
export function nmsrFace(identifier: string, size = 32): string {
  return `${base()}/face/${encodeURIComponent(identifier)}?w=${size}`;
}

/** Isometric bust — podiums and compact member spotlights. */
export function nmsrFrontBust(identifier: string, width = 96): string {
  return `${base()}/frontbust/${encodeURIComponent(identifier)}?w=${width}`;
}

/** Isometric full body — the playercard hero render. */
export function nmsrFullBodyIso(identifier: string, width = 280): string {
  return `${base()}/fullbodyiso/${encodeURIComponent(identifier)}?w=${width}`;
}
