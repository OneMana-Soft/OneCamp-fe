import { Skeleton } from "@/components/ui/skeleton"
import { TableCell, TableRow } from "@/components/ui/table"

/**
 * Placeholder rows for a table that is still loading, one cell per column.
 *
 * A single spinner cell spanning every column let the browser size the columns
 * from the header text alone, then resize them all when the real rows arrived:
 * the headers visibly slid sideways. Rows of cells give the table something to
 * lay out from the first paint.
 */
const WIDTHS = ["w-4/5", "w-3/5", "w-2/3", "w-1/2", "w-3/4"]

export function TableRowsSkeleton({ columns, rows = 5 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <TableRow key={r} aria-hidden="true">
          {Array.from({ length: columns }, (_, c) => (
            <TableCell key={c}>
              <Skeleton className={`h-4 ${WIDTHS[(r + c) % WIDTHS.length]}`} />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}
