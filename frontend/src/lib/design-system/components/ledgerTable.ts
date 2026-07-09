export interface LedgerColumn<Row> {
  key: string;
  label: string;
  numeric?: boolean;
  sortable?: boolean;
  value: (row: Row) => string;
  sortValue?: (row: Row) => number | string | null;
  color?: (row: Row) => string | null;
  secondary?: (row: Row) => string | null;
  href?: (row: Row) => string | null;
}
