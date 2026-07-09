export interface LedgerColumn<Row> {
  key: string;
  label: string;
  numeric?: boolean;
  sortable?: boolean;
  /** Render cell text in the pixel display face — for player/guild names. */
  nameStyle?: boolean;
  /** Small color square in the column header (chart series identity). */
  headerColor?: string;
  value: (row: Row) => string;
  sortValue?: (row: Row) => number | string | null;
  color?: (row: Row) => string | null;
  secondary?: (row: Row) => string | null;
  href?: (row: Row) => string | null;
  /** Image URL rendered as a small avatar before the cell text. */
  avatar?: (row: Row) => string | null;
}
