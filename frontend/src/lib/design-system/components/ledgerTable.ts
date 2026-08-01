import type { Snippet } from "svelte";

export interface LedgerColumn<Row> {
  key: string;
  label: string;
  numeric?: boolean;
  sortable?: boolean;
  /** Render cell text in the pixel display face — for player/guild names. */
  nameStyle?: boolean;
  /** Small color square in the column header (chart series identity). */
  headerColor?: string;
  /** Cell text; omit only when `cell` renders the whole cell. */
  value?: (row: Row) => string;
  sortValue?: (row: Row) => number | string | null;
  /** CSS color for the primary cell text. */
  valueColor?: (row: Row) => string | null;
  color?: (row: Row) => string | null;
  secondary?: (row: Row) => string | null;
  /** CSS color for the secondary text - rank-aware labels pass rankColor(). */
  secondaryColor?: (row: Row) => string | null;
  href?: (row: Row) => string | null;
  /** Image URL rendered as a small avatar before the cell text. */
  avatar?: (row: Row) => string | null;
  /** Alt text / hover tooltip for the avatar image. */
  avatarAlt?: (row: Row) => string | null;
  /** Small pixel-art icon rendered after the cell text; alt doubles as the tooltip. */
  icon?: (row: Row) => { src: string; alt: string } | null;
  /**
   * Renders the entire cell - inputs, buttons, anything - replacing the
   * text/link/avatar treatment. Pair with `sortable: false` unless a
   * `sortValue` gives the column an order.
   */
  cell?: Snippet<[Row]>;
}
