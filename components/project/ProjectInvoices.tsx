"use client"

// A project's saved invoices, in its time dialog: what was billed, what's
// paid, what's owed and what's late. Its admins only, as money is.

import { Badge } from "@/components/ui/badge"
import { useFetch } from "@/hooks/useFetch"
import { Loader2 } from "@/lib/icons"
import { serverMessage } from "@/lib/http/serverMessage"
import { formatCents } from "@/lib/rates"
import { STATUS_LABEL, outstanding, shownStatus, type SavedInvoice, type ShownStatus } from "@/lib/invoice/saved"
import { localDay } from "@/lib/utils/timeZone"
import { GetEndpointUrl } from "@/services/endPoints"

const BADGE: Record<ShownStatus, "secondary" | "outline" | "soft" | "destructive"> = {
  draft: "secondary",
  sent: "outline",
  paid: "soft",
  void: "outline",
  overdue: "destructive",
}

const shortDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })

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
        <h3 id="project-invoices" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Invoices</h3>
        {owed.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Owed: <span className="font-medium tabular-nums text-foreground">{owed.map(([c, cents]) => formatCents(cents, c)).join(" + ")}</span>
          </p>
        )}
      </div>
      {isLoading ? (
        <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-primary" /></div>
      ) : isError ? (
        <p className="text-sm text-destructive">{serverMessage(isError, "Couldn't load this project's invoices.")}</p>
      ) : invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground">None saved yet. Make an invoice from this range&apos;s time, then save it to keep track of whether it&apos;s paid.</p>
      ) : (
        <ul className="grid gap-1">
          {invoices.map((inv) => {
            const status = shownStatus(inv, today)
            return (
              <li key={inv.id}>
                <a
                  href={`/invoice/${projectId}?id=${inv.id}`}
                  target="_blank"
                  rel="noopener"
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2 text-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
                >
                  <span className="font-medium tabular-nums">{inv.number}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{inv.client.name || "No client named"}</span>
                  <span className={`tabular-nums ${status === "void" ? "text-muted-foreground line-through" : ""}`}>{formatCents(inv.total_cents, inv.currency)}</span>
                  <span className="text-xs text-muted-foreground">{status === "paid" || status === "void" ? `Issued ${shortDay(inv.issued_on)}` : `Due ${shortDay(inv.due_on)}`}</span>
                  <Badge variant={BADGE[status]} size="sm" caps className={status === "void" ? "text-muted-foreground" : undefined}>
                    {STATUS_LABEL[status]}
                  </Badge>
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
