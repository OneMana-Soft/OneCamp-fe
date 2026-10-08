"use client"

// An invoice from a project's billable time. Fill in your details and the
// client's on the left; the invoice on the right is what prints. "Print or
// save as PDF" uses the browser's own dialog, so the PDF is made on your
// machine. Your business details and each project's client details are
// remembered in this browser.

import { use, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import axiosInstance from "@/lib/axiosInstance"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Printer } from "@/lib/icons"
import { serverMessage } from "@/lib/http/serverMessage"
import { CURRENCIES, buildInvoice, money, suggestNumber, type LineBy } from "@/lib/invoice/invoice"
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
  const range = useMemo(() => {
    const from = search.get("from"), to = search.get("to")
    if (from && to) return { from: new Date(from), to: new Date(to) }
    return presetRange("last-month", new Date())
  }, [search])

  const [report, setReport] = useState<TimeReport | null>(null)
  const [projectName, setProjectName] = useState("")
  const [error, setError] = useState("")

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
  useEffect(() => save(SELLER_KEY, seller), [seller])
  useEffect(() => save(clientKey(project), client), [project, client])

  useEffect(() => {
    let cancelled = false
    const q = `from=${encodeURIComponent(range.from.toISOString())}&to=${encodeURIComponent(range.to.toISOString())}`
    Promise.all([
      axiosInstance.get(`${GetEndpointUrl.ProjectTime}/${project}/time?${q}`),
      axiosInstance.get(`${GetEndpointUrl.GetProjectInfo}/${project}`),
    ])
      .then(([time, info]) => {
        if (cancelled) return
        setReport(time.data.data as TimeReport)
        const name = info.data?.data?.project_name ?? ""
        setProjectName(name)
        setNumber((n) => n || suggestNumber(name, range.from))
      })
      .catch((e) => !cancelled && setError(serverMessage(e, "Couldn't load this project's time. Sign in and try again.")))
    return () => {
      cancelled = true
    }
  }, [project, range])

  const invoice = useMemo(
    () => (report ? buildInvoice(report, { by: client.by, rate: Number(client.rate), taxPercent: Number(client.taxPercent) }) : null),
    [report, client.by, client.rate, client.taxPercent],
  )
  // At the project's rates (no rate typed here), the invoice is in the
  // project's currency; the currency saved for a typed rate stays as it was.
  const byProject = !!report?.currency && report.amount_cents !== undefined && !client.rate.trim()
  const currency = byProject ? report!.currency! : client.currency
  const fmt = money(currency)
  const lastDay = new Date(range.to.getTime() - 1)

  if (error) return <Centered><p className="text-sm text-destructive">{error}</p></Centered>
  if (!report || !invoice) return <Centered><Loader2 className="h-6 w-6 animate-spin text-primary" /></Centered>

  return (
    <main className="h-dvh overflow-y-auto bg-muted/30 print:h-auto print:overflow-visible print:bg-white">
      <div className="mx-auto grid max-w-6xl gap-6 p-4 lg:grid-cols-[22rem_1fr] print:block print:max-w-none print:p-0">
        <aside className="grid content-start gap-5 print:hidden">
          <div>
            <h1 className="text-lg font-semibold">Invoice for {projectName}</h1>
            <p className="text-sm text-muted-foreground">
              Billable time from {range.from.toLocaleDateString()} to {lastDay.toLocaleDateString()}: {formatHours(report.billable_seconds)} hours.
            </p>
          </div>

          <Group title="Rate">
            <div className="grid grid-cols-[1fr_7rem] gap-2">
              <Field label="Hourly rate"><Input inputMode="decimal" value={client.rate} onChange={(e) => setClient({ ...client, rate: e.target.value })} placeholder={report.amount_cents !== undefined ? "Project's rates" : "2000"} /></Field>
              <Field label="Currency">
                <Select value={currency} onValueChange={(v) => setClient({ ...client, currency: v })} disabled={byProject}>
                  <SelectTrigger aria-label="Currency"><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </div>
            {report.amount_cents !== undefined && (
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

          <Group title="Bill to">
            <Field label="Client"><Input value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} placeholder="Acme Ltd" /></Field>
            <Field label="Address"><Textarea rows={3} value={client.address} onChange={(e) => setClient({ ...client, address: e.target.value })} /></Field>
          </Group>

          <Group title="From (remembered in this browser)">
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

          <Button onClick={() => window.print()} disabled={invoice.lines.length === 0} className="gap-2">
            <Printer className="h-4 w-4" />
            Print or save as PDF
          </Button>
          {invoice.lines.length === 0 && <p className="text-xs text-muted-foreground">No billable time in this range.</p>}
        </aside>

        <article aria-label="Invoice" className="invoice-paper rounded-lg border bg-card p-8 text-sm text-card-foreground shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
          <header className="flex flex-wrap justify-between gap-6">
            <div className="grid gap-0.5">
              <p className="text-lg font-semibold">{seller.name || "Your business"}</p>
              {seller.address && <p className="whitespace-pre-line text-muted-foreground">{seller.address}</p>}
              {seller.taxId && <p className="text-muted-foreground">Tax ID: {seller.taxId}</p>}
            </div>
            <div className="grid gap-0.5 text-right">
              <p className="text-2xl font-semibold tracking-tight">Invoice</p>
              <p className="tabular-nums">{number}</p>
              <p className="text-muted-foreground">Issued {longDay(issued)}</p>
              <p className="text-muted-foreground">Due {longDay(due)}</p>
            </div>
          </header>

          <section className="mt-8 grid gap-0.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Bill to</p>
            <p className="font-medium">{client.name || "Client"}</p>
            {client.address && <p className="whitespace-pre-line text-muted-foreground">{client.address}</p>}
            <p className="mt-2 text-muted-foreground">
              {projectName}: work from {range.from.toLocaleDateString()} to {lastDay.toLocaleDateString()}
            </p>
          </section>

          <div className="mt-8 overflow-x-auto">
            <table className="w-full border-collapse tabular-nums">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 font-medium">{client.by === "task" ? "Task" : "Person"}</th>
                  <th className="py-2 text-right font-medium">Hours</th>
                  <th className="py-2 text-right font-medium">Rate</th>
                  <th className="py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map((l) => (
                  <tr key={l.description} className="border-b">
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
