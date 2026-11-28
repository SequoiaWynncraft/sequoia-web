import { NMSR_BASE_URL } from "#lib/config/public.js";

function base(): string {
  return NMSR_BASE_URL.replace(/\/+$/, "");
}

export function nmsrFace(identifier: string, size = 32): string {
  return `${base()}/face/${encodeURIComponent(identifier)}?w=${size}`;
}

export function nmsrFrontBust(identifier: string, width = 96): string {
  return `${base()}/frontbust/${encodeURIComponent(identifier)}?w=${width}`;
}

export function nmsrFullBodyIso(identifier: string, width = 280): string {
  return `${base()}/fullbodyiso/${encodeURIComponent(identifier)}?w=${width}`;
}
