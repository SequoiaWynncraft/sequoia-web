export const RAID_ICON_BASE = "https://api.seqwawa.com/assets/raid-icons/";

export interface RaidIcon {
  file: string;
  label: string;
}

export const RAID_ICONS: RaidIcon[] = [
  { file: "raid_icon_tcc_transparent.png", label: "TCC" },
  { file: "raid_icon_tcc_bg.png", label: "TCC tile" },
  { file: "raid_icon_notg_transparent.png", label: "NOTG" },
  { file: "raid_icon_notg_bg.png", label: "NOTG tile" },
  { file: "raid_icon_nol_transparent.png", label: "NOL" },
  { file: "raid_icon_nol_bg.png", label: "NOL tile" },
  { file: "raid_icon_tna_transparent.png", label: "TNA" },
  { file: "raid_icon_tna_bg.png", label: "TNA tile" },
  { file: "raid_icon_wtp_transparent.png", label: "TWP" },
  { file: "raid_icon_wtp_bg.png", label: "TWP tile" },
  { file: "raid_icon_nol-notg-tna-tcc.png", label: "Four raids" },
  { file: "raid_icon_nol-notg-tna-tcc-wtp.png", label: "Five raids" },
  { file: "raid_icon_annihilation_bg.png", label: "Anni" },
];

export function raidIconUrl(file: string): string {
  return RAID_ICON_BASE + file;
}
