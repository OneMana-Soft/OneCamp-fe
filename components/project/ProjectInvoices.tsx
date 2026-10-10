"use client"

// A project's saved invoices, in its time dialog: what was billed, what's
// paid, what's owed and what's late. Its admins only, as money is.

import { shortDate } from "@/lib/utils/date/shortDate"
import { useFetch } from "@/hooks/useFetch"
import { Loader2 } from "@/lib/icons"
import { serverMessage } from "@/lib/http/serverMessage"
import { formatCents } from "@/lib/rates"
import { STATUS_LABEL, outstanding, shownStatus, type SavedInvoice, type ShownStatus } from "@/lib/invoice/saved"
import { localDay } from "@/lib/utils/timeZone"
import { GetEndpointUrl } from "@/services/endPoints"

// A status as a dot and its word, like a task's: the uppercase badges (DRAFT,
// PAID in a tint, OVERDUE in a red fill) shouted in a list of three rows.
const DOT: Record<ShownStatus, string> = {
  draft: "bg-muted-foreground",
  sent: "bg-info",
  paid: "bg-success",
  void: "bg-faint-foreground",
  overdue: "bg-destructive",
}

const shortDay = (iso: string) => shortDate(new Date(`${iso}T00:00:00`))

export function ProjectInvoices({ projectId }: { projectId: string }) {
  const { data, isLoading, isError } = useFetch<{ data: { invoices: SavedInvoice[]; next_number: string } }>(
    `${GetEndpointUrl.ProjectInvoices}/${projectId}/invoices`,
  )
  const invoices = data?.data?.invoices ?? []
  const today = localDay()
  const owed = Object.entries(outstanding(invoices))

  return (
    <section className="grid gap-2" aria-labelledby="project-invoices">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="project-invoices" className="text-sm font-medium text-foreground">Invoices</h3>
        {owed.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Owed: <span className="font-medium tabular-nums text-foreground">{owed.map(([c, cents]) => formatCents(cents, c)).join(" + ")}</span>
          </p>
        )}
      </div>
      {isLoading ? (
        <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : isError ? (
        <p className="text-sm text-danger-ink">{serverMessage(isError, "Couldn't load this project's invoices.")}</p>
      ) : invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground">None saved yet. Make an invoice from this range&apos;s time, then save it to keep track of whether it&apos;s paid.</p>
      ) : (
        <ul className="divide-y border-y">
          {invoices.map((inv) => {
            const status = shownStatus(inv, today)
            return (
              <li key={inv.id}>
                <a
                  href={`/invoice/${projectId}?id=${inv.id}`}
                  target="_blank"
                  rel="noopener"
                  // Columns line up row to row: number, client, amount on the
                  // right in tabular figures, the date, the status.
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5 px-1 py-2 text-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 sm:grid-cols-[4.5rem_minmax(0,1fr)_7rem_6.5rem_5rem]"
                >
                  <span className="font-medium tabular-nums">{inv.number}</span>
                  <span className="min-w-0 truncate text-muted-foreground" title={inv.client.name || undefined}>{inv.client.name || "No client named"}</span>
                  <span className={`text-right tabular-nums ${status === "void" ? "text-muted-foreground line-through" : ""}`}>{formatCents(inv.total_cents, inv.currency)}</span>
                  <span className="col-start-2 text-xs tabular-nums text-muted-foreground sm:col-start-auto sm:text-right">{status === "paid" || status === "void" ? `Issued ${shortDay(inv.issued_on)}` : `Due ${shortDay(inv.due_on)}`}</span>
                  <span className={`inline-flex items-center justify-end gap-1.5 text-xs ${status === "overdue" ? "font-medium text-danger-ink" : "text-foreground"}`}>
                    <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[status]}`} />
                    {STATUS_LABEL[status]}
                  </span>
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
