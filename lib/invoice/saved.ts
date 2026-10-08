// Invoices a project's admins save (business/Invoice): numbered, with their
// lines as billed and a state. Money is in hundredths of the currency's unit,
// as the server keeps it; amounts and totals are the server's, worked out the
// way buildInvoice works them out. Pure.

import type { InvoiceLine } from "@/lib/invoice/invoice"

export type InvoiceStatus = "draft" | "sent" | "paid" | "void"

export interface InvoiceParty {
  name: string
  address: string
  tax_id?: string
  payment?: string
  email?: string
}

export interface SavedLine {
  description: string
  hours: number
  rate_cents: number
  amount_cents: number
}

export interface SavedInvoice {
  id: string
  project_id: string
  number: string
  status: InvoiceStatus
  issued_on: string
  due_on: string
  period_from?: string
  period_to?: string
  currency: string
  seller: InvoiceParty
  client: InvoiceParty
  lines: SavedLine[]
  subtotal_cents: number
  tax_percent: number
  tax_cents: number
  total_cents: number
  notes: string
  sent_at?: string
  paid_at?: string
  created_at: string
  updated_at: string
}

export interface InvoiceInput {
  number: string
  status?: "draft" | "sent"
  issued_on: string
  due_on: string
  period_from?: string
  period_to?: string
  currency: string
  seller: InvoiceParty
  client: InvoiceParty
  lines: { description: string; hours: number; rate_cents: number }[]
  tax_percent: number
  notes: string
}

/** Lines as the invoice page shows them, in the currency's units, from what was saved. */
export function linesOf(inv: SavedInvoice): InvoiceLine[] {
  return inv.lines.map((l) => ({ description: l.description, hours: l.hours, rate: l.rate_cents / 100, amount: l.amount_cents / 100 }))
}

/** Lines to save, from the invoice page's: rates in hundredths. */
export function linesToSave(lines: InvoiceLine[]): InvoiceInput["lines"] {
  return lines.map((l) => ({ description: l.description, hours: l.hours, rate_cents: Math.round(l.rate * 100) }))
}

export type ShownStatus = InvoiceStatus | "overdue"

/** An invoice's state as a reader sees it: a sent one past its due day is overdue. today is "YYYY-MM-DD". */
export function shownStatus(inv: Pick<SavedInvoice, "status" | "due_on">, today: string): ShownStatus {
  return inv.status === "sent" && inv.due_on < today ? "overdue" : inv.status
}

export const STATUS_LABEL: Record<ShownStatus, string> = { draft: "Draft", sent: "Sent", paid: "Paid", void: "Void", overdue: "Overdue" }

/** What's still owed across invoices, by currency: sent ones, overdue included. */
export function outstanding(invoices: Pick<SavedInvoice, "status" | "currency" | "total_cents">[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const inv of invoices) {
    if (inv.status === "sent") out[inv.currency] = (out[inv.currency] ?? 0) + inv.total_cents
  }
  return out
}
