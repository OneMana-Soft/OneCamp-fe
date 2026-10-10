"use client"

// What a project's time is billed at: one currency, an hourly rate for
// everyone, and a rate of their own for anyone who differs. Its admins set it;
// the time report and invoices then say what the billable time comes to.

import { displayNameOf } from "@/lib/personName"
import { useEffect, useMemo, useRef, useState } from "react"
import axiosInstance from "@/lib/axiosInstance"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useFetch } from "@/hooks/useFetch"
import { useToast } from "@/hooks/use-toast"
import { Loader2 } from "@/lib/icons"
import { CURRENCIES, centsOf, fromCents, type ProjectRates } from "@/lib/rates"
import { GetEndpointUrl } from "@/services/endPoints"
import type { ProjectInfoRawInterface } from "@/types/project"

export function ProjectRatesDialog({
  projectId,
  open,
  onOpenChange,
  onSaved,
}: {
  projectId: string
  open: boolean
  onOpenChange: (o: boolean) => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const url = `${GetEndpointUrl.ProjectRates}/${projectId}/rates`
  const rates = useFetch<{ data: ProjectRates }>(open ? url : "")
  const members = useFetch<ProjectInfoRawInterface>(open ? `${GetEndpointUrl.GetProjectMembers}/${projectId}` : "")
  const [currency, setCurrency] = useState("USD")
  const [everyone, setEveryone] = useState("")
  const [own, setOwn] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState("")

  // The form starts from what's saved, once per opening: a read again in the
  // background (back to the tab) must not wipe what someone is typing.
  const saved = rates.data?.data
  const filled = useRef(false)
  useEffect(() => {
    if (!open) filled.current = false
  }, [open])
  useEffect(() => {
    if (!saved || filled.current) return
    filled.current = true
    if (saved.set) setCurrency(saved.currency ?? "USD")
    setEveryone(saved.set ? fromCents(saved.default_rate_cents) : "")
    setOwn(Object.fromEntries(saved.people.map((p) => [p.user_uuid, fromCents(p.rate_cents)])))
  }, [saved])

  // Everyone on the project, by name, and anyone with a rate who has since
  // left: their rate still prices the time they logged, so it stays.
  const people = useMemo(() => {
    const seen = new Set<string>()
    const now = (members.data?.data?.project_members ?? [])
      .filter((u) => u.user_uuid && !u.is_bot && !seen.has(u.user_uuid) && seen.add(u.user_uuid))
      .map((u) => ({ id: u.user_uuid, name: displayNameOf(u) || "A member", left: false }))
    const gone = (saved?.people ?? [])
      .filter((p) => !seen.has(p.user_uuid))
      .map((p) => ({ id: p.user_uuid, name: "Someone no longer on the project", left: true }))
    return [...now, ...gone]
  }, [members.data, saved])

  const save = async () => {
    if (everyone.trim() === "") return setProblem("Give the rate for everyone. Use 0 if their time isn't billed.")
    const base = centsOf(everyone)
    if (base === null) return setProblem("The rate for everyone isn't an amount of money, like 85 or 85.50.")
    const list: { user_uuid: string; rate_cents: number }[] = []
    for (const p of people) {
      const v = (own[p.id] ?? "").trim()
      if (v === "") continue
      const cents = centsOf(v)
      if (cents === null) return setProblem(`${p.left ? "A former member" : p.name}'s rate isn't an amount of money, like 85 or 85.50.`)
      list.push({ user_uuid: p.id, rate_cents: cents })
    }
    setProblem("")
    setBusy(true)
    try {
      await axiosInstance.post(url, { currency, default_rate_cents: base, people: list })
      await rates.mutate()
      toast({ title: "Rates saved", description: "The time report and invoices now use them." })
      onSaved()
      onOpenChange(false)
    } catch {
      // The server's message is shown already.
    } finally {
      setBusy(false)
    }
  }

  const stop = async () => {
    setBusy(true)
    try {
      await axiosInstance.post(`${url}/delete`, {})
      await rates.mutate()
      toast({ title: "Billing stopped", description: "The time report shows hours only." })
      onSaved()
      onOpenChange(false)
    } catch {
      // The server's message is shown already.
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Rates</DialogTitle>
          <DialogDescription>
            What this project&apos;s billable time is charged at, per hour. Only the project&apos;s admins see rates and money.
          </DialogDescription>
        </DialogHeader>
        {rates.isLoading || members.isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <form
            className="grid gap-5"
            onSubmit={(e) => {
              e.preventDefault()
              void save()
            }}
          >
            <div className="grid grid-cols-[1fr_8rem] gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="rate-everyone">Everyone, per hour</Label>
                <Input id="rate-everyone" inputMode="decimal" value={everyone} placeholder="e.g. 85" required onChange={(e) => setEveryone(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="h-9" aria-label="Currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {people.length > 0 && (
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm font-medium">People with a rate of their own</legend>
                <p className="text-xs text-muted-foreground">Leave a rate empty and they bill at the rate for everyone.</p>
                <ul className="grid gap-2">
                  {people.map((p) => (
                    <li key={p.id} className="grid grid-cols-[1fr_8rem] items-center gap-3">
                      <Label htmlFor={`rate-${p.id}`} className={p.left ? "truncate font-normal italic text-muted-foreground" : "truncate font-normal"}>
                        {p.name}
                      </Label>
                      <Input
                        id={`rate-${p.id}`}
                        inputMode="decimal"
                        value={own[p.id] ?? ""}
                        placeholder={everyone.trim() ? `${everyone.trim()}, as everyone` : "As everyone"}
                        onChange={(e) => setOwn({ ...own, [p.id]: e.target.value })}
                      />
                    </li>
                  ))}
                </ul>
              </fieldset>
            )}
            {problem && (
              <p role="alert" className="text-sm text-danger-ink">
                {problem}
              </p>
            )}
            <DialogFooter className="gap-2 sm:justify-between">
              {saved?.set ? (
                <Button type="button" variant="ghost" className="text-danger-ink" onClick={() => void stop()} disabled={busy}>
                  Stop billing this project
                </Button>
              ) : (
                <span />
              )}
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Save rates
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
