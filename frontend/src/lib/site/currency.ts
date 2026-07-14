export type CurrencyUnit = "E" | "EB" | "LE";

export interface CurrencyAsset {
  key: string;
  label: string;
  unit: CurrencyUnit;
  url: string;
}

export const CURRENCY_ASSETS = {
  emerald: {
    key: "misc.emerald",
    label: "Emerald",
    unit: "E",
    url: "https://assets.seqwawa.com/v1/2cf1339840fa4bd7042a53490a4fc1a5b46487fc8b14f89fedb9c2c97795eada/emerald.webp",
  },
  emeraldBlock: {
    key: "misc.emerald_block",
    label: "Emerald block",
    unit: "EB",
    url: "https://assets.seqwawa.com/v1/c73f3f7f6203f840138c72b1f63e1c5a47d69169dc49626b727aa2facc8ee638/emerald_block.webp",
  },
  liquidEmerald: {
    key: "misc.experience_bottle",
    label: "Liquid emerald",
    unit: "LE",
    url: "https://assets.seqwawa.com/v1/7668d3f1ed1604f0b1c8924d90d4249b845abd3147965ce01b318d0d93b7e999/experience_bottle.webp",
  },
} as const satisfies Record<string, CurrencyAsset>;

export const CURRENCY_ASSET_BY_UNIT: Record<CurrencyUnit, CurrencyAsset> = {
  E: CURRENCY_ASSETS.emerald,
  EB: CURRENCY_ASSETS.emeraldBlock,
  LE: CURRENCY_ASSETS.liquidEmerald,
};
