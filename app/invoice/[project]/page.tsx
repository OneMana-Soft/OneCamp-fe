"use client"

// An invoice from a project's billable time. Fill in your details and the
// client's on the left; the invoice on the right is what prints. "Print or
// save as PDF" uses the browser's own dialog, so the PDF is made on your
// machine. Your business details and each project's client details are
// remembered in this browser.
//
// Saved, an invoice keeps its number and its lines as billed (business/Invoice),
// and is opened again with ?id=. A draft can still be changed or deleted;
// once sent it stays as sent, and is marked paid, taken back, or voided.

import { use, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import axiosInstance from "@/lib/axiosInstance"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { CheckCircle2, Loader2, Printer, Save, Send, Trash2, Undo2 } from "@/lib/icons"
import { serverMessage } from "@/lib/http/serverMessage"
import { CURRENCIES, buildInvoice, money, round2, suggestNumber, type InvoiceTotals, type LineBy } from "@/lib/invoice/invoice"
import { STATUS_LABEL, linesOf, linesToSave, shownStatus, type InvoiceInput, type SavedInvoice } from "@/lib/invoice/saved"
import { formatHours, presetRange, type TimeReport } from "@/lib/tasks/time"
import { GetEndpointUrl } from "@/services/endPoints"
import { localDay } from "@/lib/utils/timeZone"

interface Seller { name: string; address: string; taxId: string; payment: string }
interface ClientSide { name: string; address: string; rate: string; currency: string; taxPercent: string; by: LineBy }

const SELLER_KEY = "oc_invoice_seller"
const clientKey = (projectId: string) => `oc_invoice_client_${projectId}`

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback
  } catch {
    return fallback
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage blocked: the invoice still works for this visit */
  }
}

const longDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })

export default function InvoicePage({ params }: { params: Promise<{ project: string }> }) {
  const { project } = use(params)
  const search = useSearchParams()
  const router = useRouter()
  const { toast } = useToast()
  const savedId = search.get("id")
  const range = useMemo(() => {
    const from = search.get("from"), to = search.get("to")
    if (from && to) return { from: new Date(from), to: new Date(to) }
    return presetRange("last-month", new Date())
  }, [search])
  const invoices = `${GetEndpointUrl.ProjectInvoices}/${project}/invoices`

  const [report, setReport] = useState<TimeReport | null>(null)
  const [saved, setSaved] = useState<SavedInvoice | null>(null)
  const [projectName, setProjectName] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const [seller, setSeller] = useState<Seller>({ name: "", address: "", taxId: "", payment: "" })
  const [client, setClient] = useState<ClientSide>({ name: "", address: "", rate: "", currency: "INR", taxPercent: "0", by: "task" })
  const today = new Date()
  const [number, setNumber] = useState("")
  const [issued, setIssued] = useState(localDay(today))
  const [due, setDue] = useState(localDay(new Date(today.getTime() + 15 * 864e5)))
  const [notes, setNotes] = useState("")

  useEffect(() => {
    setSeller(load(SELLER_KEY, seller))
    setClient(load(clientKey(project), client))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once per project
  }, [project])
  // Only a new invoice teaches the browser its details: opening an old one
  // mustn't put back what you've changed since.
  useEffect(() => {
    if (!savedId) save(SELLER_KEY, seller)
  }, [seller, savedId])
  useEffect(() => {
    if (!savedId) save(clientKey(project), client)
  }, [project, client, savedId])

  // What a saved invoice says, in the fields on the left.
  const show = (inv: SavedInvoice) => {
    setSaved(inv)
    setNumber(inv.number)
    setIssued(inv.issued_on)
    setDue(inv.due_on)
    setNotes(inv.notes)
    setSeller({ name: inv.seller.name, address: inv.seller.address, taxId: inv.seller.tax_id ?? "", payment: inv.seller.payment ?? "" })
    setClient((c) => ({ ...c, name: inv.client.name, address: inv.client.address, currency: inv.currency, taxPercent: String(inv.tax_percent) }))
  }

  useEffect(() => {
    let cancelled = false
    const info = axiosInstance.get(`${GetEndpointUrl.GetProjectInfo}/${project}`)
    if (savedId) {
      // A saved invoice: its own lines, as billed.
      Promise.all([axiosInstance.get(`${invoices}/${savedId}`), info])
        .then(([inv, p]) => {
          if (cancelled) return
          show(inv.data.data as SavedInvoice)
          setProjectName(p.data?.data?.project_name ?? "")
        })
        .catch((e) => !cancelled && setError(serverMessage(e, "Couldn't open this invoice. It may have been deleted.")))
      return () => {
        cancelled = true
      }
    }
    // A new one: the time it bills, and the next number.
    const q = `from=${encodeURIComponent(range.from.toISOString())}&to=${encodeURIComponent(range.to.toISOString())}`
    Promise.all([
      axiosInstance.get(`${GetEndpointUrl.ProjectTime}/${project}/time?${q}`),
      info,
      axiosInstance.get(invoices).catch(() => null),
    ])
      .then(([time, p, list]) => {
        if (cancelled) return
        setSaved(null)
        setReport(time.data.data as TimeReport)
        const name = p.data?.data?.project_name ?? ""
        setProjectName(name)
        setNumber((n) => n || list?.data?.data?.next_number || suggestNumber(name, range.from))
      })
      .catch((e) => !cancelled && setError(serverMessage(e, "Couldn't load this project's time. Sign in and try again.")))
    return () => {
      cancelled = true
    }
  }, [project, range, savedId, invoices])

  const draft = !saved || saved.status === "draft"
  const invoice = useMemo((): InvoiceTotals | null => {
    const taxPercent = Number(client.taxPercent)
    if (saved) {
      const lines = linesOf(saved)
      const hours = round2(lines.reduce((s, l) => s + l.hours, 0))
      if (saved.status !== "draft") {
        return { lines, hours, subtotal: saved.subtotal_cents / 100, tax: saved.tax_cents / 100, total: saved.total_cents / 100 }
      }
      // A draft's tax can still change; its lines can't.
      const subtotal = saved.subtotal_cents / 100
      const tax = Number.isFinite(taxPercent) && taxPercent > 0 ? round2((subtotal * taxPercent) / 100) : 0
      return { lines, hours, subtotal, tax, total: round2(subtotal + tax) }
    }
    return report ? buildInvoice(report, { by: client.by, rate: Number(client.rate), taxPercent }) : null
  }, [saved, report, client.by, client.rate, client.taxPercent])
  // At the project's rates (no rate typed here), the invoice is in the
  // project's currency; the currency saved for a typed rate stays as it was.
  const byProject = !saved && !!report?.currency && report.amount_cents !== undefined && !client.rate.trim()
  const currency = saved ? saved.currency : byProject ? report!.currency! : client.currency
  const fmt = money(currency)
  const periodFrom = saved?.period_from ? new Date(saved.period_from) : range.from
  const periodTo = saved?.period_to ? new Date(saved.period_to) : range.to
  const lastDay = new Date(periodTo.getTime() - 1)
  const status = saved ? shownStatus(saved, localDay()) : null

  const body = (as?: "draft" | "sent"): InvoiceInput => ({
    number,
    status: as,
    issued_on: issued,
    due_on: due,
    period_from: periodFrom.toISOString(),
    period_to: periodTo.toISOString(),
    currency,
    seller: { name: seller.name, address: seller.address, tax_id: seller.taxId, payment: seller.payment },
    client: { name: client.name, address: client.address },
    lines: linesToSave(invoice?.lines ?? []),
    tax_percent: Number(client.taxPercent) || 0,
    notes,
  })

  // One change to the saved invoice: what it is now shows, or why not.
  const act = async (done: string, failed: string, change: () => Promise<SavedInvoice | null>) => {
    setBusy(true)
    try {
      const inv = await change()
      if (inv) show(inv)
      toast({ title: done })
    } catch (e) {
      toast({ title: failed, description: serverMessage(e), variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }
  const create = (as: "draft" | "sent") =>
    act(as === "sent" ? "Saved, and marked sent" : "Saved as a draft", "The invoice wasn't saved", async () => {
      const inv = (await axiosInstance.post(invoices, body(as))).data.data as SavedInvoice
      router.replace(`/invoice/${project}?id=${inv.id}`)
      return inv
    })
  const update = () =>
    act("Draft saved", "The draft wasn't saved", async () => (await axiosInstance.post(`${invoices}/${saved!.id}`, body())).data.data as SavedInvoice)
  const mark = (to: SavedInvoice["status"], done: string) =>
    act(done, "That didn't change", async () => (await axiosInstance.post(`${invoices}/${saved!.id}/status`, { status: to })).data.data as SavedInvoice)
  const remove = () =>
    act("Draft deleted", "The draft wasn't deleted", async () => {
      await axiosInstance.post(`${invoices}/${saved!.id}/delete`)
      const q = `from=${encodeURIComponent(periodFrom.toISOString())}&to=${encodeURIComponent(periodTo.toISOString())}`
      setSaved(null)
      setNumber("")
      router.replace(`/invoice/${project}?${q}`)
      return null
    })

  if (error) return <Centered><p className="text-sm text-destructive">{error}</p></Centered>
  if (!invoice || (!saved && !report)) return <Centered><Loader2 className="h-6 w-6 animate-spin text-primary" /></Centered>

  return (
    <main className="h-dvh overflow-y-auto bg-muted/30 print:h-auto print:overflow-visible print:bg-white">
      <div className="mx-auto grid max-w-6xl gap-6 p-4 lg:grid-cols-[22rem_1fr] print:block print:max-w-none print:p-0">
        <aside className="grid content-start gap-5 print:hidden">
          <div className="grid gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold">Invoice for {projectName}</h1>
              {status && <Badge variant={status === "overdue" ? "destructive" : status === "paid" ? "soft" : "secondary"} size="sm" caps>{STATUS_LABEL[status]}</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">
              {saved
                ? `Billed time from ${periodFrom.toLocaleDateString()} to ${lastDay.toLocaleDateString()}: ${invoice.hours.toFixed(2)} hours.`
                : `Billable time from ${range.from.toLocaleDateString()} to ${lastDay.toLocaleDateString()}: ${formatHours(report!.billable_seconds)} hours.`}
            </p>
            {saved && saved.status !== "draft" && (
              <p className="text-xs text-muted-foreground">
                {saved.status === "void" ? "Void: kept so its number is never used again." : "Sent invoices stay as they were sent. Void this one and make a new one to change it."}
              </p>
            )}
          </div>

          {!saved && (
            <Group title="Rate">
              <div className="grid grid-cols-[1fr_7rem] gap-2">
                <Field label="Hourly rate"><Input inputMode="decimal" value={client.rate} onChange={(e) => setClient({ ...client, rate: e.target.value })} placeholder={report!.amount_cents !== undefined ? "Project's rates" : "2000"} /></Field>
                <Field label="Currency">
                  <Select value={currency} onValueChange={(v) => setClient({ ...client, currency: v })} disabled={byProject}>
                    <SelectTrigger aria-label="Currency"><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
              </div>
              {report!.amount_cents !== undefined && (
                <p className="text-xs text-muted-foreground">
                  {client.rate.trim()
                    ? "Everything bills at the rate typed here. Clear it to use the project's rates."
                    : "Each person bills at their rate on this project. Type one rate here to bill everything at it instead."}
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Field label="Tax %"><Input inputMode="decimal" value={client.taxPercent} onChange={(e) => setClient({ ...client, taxPercent: e.target.value })} /></Field>
                <Field label="One line per">
                  <Select value={client.by} onValueChange={(v) => setClient({ ...client, by: v as LineBy })}>
                    <SelectTrigger aria-label="One line per"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="task">Task</SelectItem>
                      <SelectItem value="person">Person</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </Group>
          )}
          {saved && draft && (
            <Group title="Tax">
              <Field label="Tax %"><Input inputMode="decimal" value={client.taxPercent} onChange={(e) => setClient({ ...client, taxPercent: e.target.value })} /></Field>
            </Group>
          )}

          <fieldset disabled={!draft || busy} className="grid gap-5">
            <Group title="Bill to">
              <Field label="Client"><Input value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} placeholder="Acme Ltd" /></Field>
              <Field label="Address"><Textarea rows={3} value={client.address} onChange={(e) => setClient({ ...client, address: e.target.value })} /></Field>
            </Group>

            <Group title={saved ? "From" : "From (remembered in this browser)"}>
              <Field label="Your business"><Input value={seller.name} onChange={(e) => setSeller({ ...seller, name: e.target.value })} /></Field>
              <Field label="Address"><Textarea rows={3} value={seller.address} onChange={(e) => setSeller({ ...seller, address: e.target.value })} /></Field>
              <Field label="Tax ID (GSTIN, VAT…)"><Input value={seller.taxId} onChange={(e) => setSeller({ ...seller, taxId: e.target.value })} /></Field>
              <Field label="How to pay"><Textarea rows={3} value={seller.payment} onChange={(e) => setSeller({ ...seller, payment: e.target.value })} placeholder="Bank, account number, IFSC or UPI ID" /></Field>
            </Group>

            <Group title="Invoice">
              <Field label="Number"><Input value={number} onChange={(e) => setNumber(e.target.value)} /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Issued"><Input type="date" value={issued} onChange={(e) => setIssued(e.target.value)} /></Field>
                <Field label="Due"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
              </div>
              <Field label="Notes"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Thank you for your business." /></Field>
            </Group>
          </fieldset>

          <div className="grid gap-2" role="group" aria-label="Invoice actions">
            {!saved && (
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => void create("draft")} disabled={busy || invoice.lines.length === 0} className="gap-2">
                  <Save className="h-4 w-4" />
                  Save draft
                </Button>
                <Button variant="outline" onClick={() => void create("sent")} disabled={busy || invoice.lines.length === 0} className="gap-2">
                  <Send className="h-4 w-4" />
                  Save as sent
                </Button>
              </div>
            )}
            {saved?.status === "draft" && (
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => void update()} disabled={busy} className="gap-2">
                  <Save className="h-4 w-4" />
                  Save draft
                </Button>
                <Button variant="outline" onClick={() => void mark("sent", "Marked sent")} disabled={busy} className="gap-2">
                  <Send className="h-4 w-4" />
                  Mark sent
                </Button>
                <Button variant="ghost" onClick={() => void remove()} disabled={busy} className="col-span-2 gap-2 text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                  Delete draft
                </Button>
              </div>
            )}
            {saved?.status === "sent" && (
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => void mark("paid", "Marked paid")} disabled={busy} className="col-span-2 gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Mark paid
                </Button>
                <Button variant="outline" onClick={() => void mark("draft", "Back to a draft")} disabled={busy} className="gap-2">
                  <Undo2 className="h-4 w-4" />
                  Back to draft
                </Button>
                <Button variant="ghost" onClick={() => void mark("void", "Voided")} disabled={busy} className="text-destructive hover:text-destructive">
                  Void
                </Button>
              </div>
            )}
            {saved?.status === "paid" && (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => void mark("sent", "Marked unpaid")} disabled={busy} className="gap-2">
                  <Undo2 className="h-4 w-4" />
                  Mark unpaid
                </Button>
                <Button variant="ghost" onClick={() => void mark("void", "Voided")} disabled={busy} className="text-destructive hover:text-destructive">
                  Void
                </Button>
              </div>
            )}
            <Button variant={saved ? "outline" : "secondary"} onClick={() => window.print()} disabled={invoice.lines.length === 0} className="gap-2">
              <Printer className="h-4 w-4" />
              Print or save as PDF
            </Button>
            {invoice.lines.length === 0 && <p className="text-xs text-muted-foreground">No billable time in this range.</p>}
          </div>
        </aside>

        <article aria-label="Invoice" className="invoice-paper rounded-lg border bg-card p-8 text-sm text-card-foreground shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
          <header className="flex flex-wrap justify-between gap-6">
            <div className="grid gap-0.5">
              <p className="text-lg font-semibold">{seller.name || "Your business"}</p>
              {seller.address && <p className="whitespace-pre-line text-muted-foreground">{seller.address}</p>}
              {seller.taxId && <p className="text-muted-foreground">Tax ID: {seller.taxId}</p>}
            </div>
            <div className="grid gap-0.5 text-right">
              <p className="text-2xl font-semibold tracking-tight">{saved?.status === "void" ? "Invoice (void)" : "Invoice"}</p>
              <p className="tabular-nums">{number}</p>
              <p className="text-muted-foreground">Issued {longDay(issued)}</p>
              <p className="text-muted-foreground">Due {longDay(due)}</p>
              {saved?.status === "paid" && saved.paid_at && <p className="font-medium">Paid {longDay(localDay(new Date(saved.paid_at)))}</p>}
            </div>
          </header>

          <section className="mt-8 grid gap-0.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Bill to</p>
            <p className="font-medium">{client.name || "Client"}</p>
            {client.address && <p className="whitespace-pre-line text-muted-foreground">{client.address}</p>}
            <p className="mt-2 text-muted-foreground">
              {projectName}: work from {periodFrom.toLocaleDateString()} to {lastDay.toLocaleDateString()}
            </p>
          </section>

          <div className="mt-8 overflow-x-auto">
            <table className="w-full border-collapse tabular-nums">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 font-medium">{saved ? "Work" : client.by === "task" ? "Task" : "Person"}</th>
                  <th className="py-2 text-right font-medium">Hours</th>
                  <th className="py-2 text-right font-medium">Rate</th>
                  <th className="py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map((l, i) => (
                  <tr key={`${i}:${l.description}`} className="border-b">
                    <td className="py-2 pr-4">{l.description}</td>
                    <td className="py-2 text-right">{l.hours.toFixed(2)}</td>
                    <td className="py-2 text-right">{fmt(l.rate)}</td>
                    <td className="py-2 text-right">{fmt(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td colSpan={3} className="pt-4 text-right text-muted-foreground">Subtotal</td><td className="pt-4 text-right">{fmt(invoice.subtotal)}</td></tr>
                {invoice.tax > 0 && (
                  <tr><td colSpan={3} className="pt-1 text-right text-muted-foreground">Tax ({Number(client.taxPercent)}%)</td><td className="pt-1 text-right">{fmt(invoice.tax)}</td></tr>
                )}
                <tr><td colSpan={3} className="pt-2 text-right font-semibold">Total</td><td className="pt-2 text-right text-base font-semibold">{fmt(invoice.total)}</td></tr>
              </tfoot>
            </table>
          </div>

          {(seller.payment || notes) && (
            <footer className="mt-10 grid gap-4 border-t pt-6">
              {seller.payment && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">How to pay</p>
                  <p className="mt-1 whitespace-pre-line">{seller.payment}</p>
                </div>
              )}
              {notes && <p className="whitespace-pre-line text-muted-foreground">{notes}</p>}
            </footer>
          )}
        </article>
      </div>
    </main>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="grid gap-2 rounded-lg border bg-card p-3">
      <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</legend>
      {children}
    </fieldset>
  )
}

/** A label that wraps its input, so the input is named by it. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-screen items-center justify-center bg-background p-4 text-center">{children}</main>
}
