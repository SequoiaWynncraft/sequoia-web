export interface LedgerColumn<Row> {
  key: string;
  label: string;
  numeric?: boolean;
  sortable?: boolean;
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
