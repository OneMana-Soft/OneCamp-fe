"use client"

/**
 * Adding a calendar by its address (calendar B8): public holidays by
 * country, or any address another calendar publishes (a team's calendar in
 * another tool, someone's secret link). The server reads it before it is
 * added, so an address that isn't a calendar says why here and nothing is
 * made; its events then show with yours, change only where it is published,
 * and are read again every 15 minutes. A chunk of its own, opened from the
 * Calendars panel or a phone's calendar options; the shared dialog, a sheet
 * on a phone.
 */

import * as React from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { OverlayBody } from "@/components/ui/overlay"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { HOLIDAY_CALENDARS, looksLikeAddress, subscribe, type Subscription } from "@/lib/calendar/subscriptions"
import { apiErrorMessage } from "@/lib/utils/apiError"

type Way = "holidays" | "address"

export default function SubscribeDialog({ onAdded, onClose }: { onAdded: (s: Subscription) => void; onClose: () => void }) {
  const [way, setWay] = React.useState<Way>("holidays")
  const [country, setCountry] = React.useState(HOLIDAY_CALENDARS[0].country)
  const [address, setAddress] = React.useState("")
  const [name, setName] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")
  const [tried, setTried] = React.useState(false)

  const chosen = way === "holidays" ? HOLIDAY_CALENDARS.find((h) => h.country === country)?.address ?? "" : address.trim()
  const unreadable = way === "address" && tried && !looksLikeAddress(address)
  // What's wrong with an address is said on its field, where its help was.
  const addressError = unreadable ? "Paste an address that starts with https://, http:// or webcal://." : way === "address" ? error : ""

  const add = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setTried(true)
    if (busy || (way === "address" && !looksLikeAddress(address))) return
    setBusy(true)
    setError("")
    try {
      onAdded(await subscribe(chosen, way === "address" ? name.trim() : ""))
    } catch (err) {
      setError(apiErrorMessage(err, "The calendar couldn't be added. Try again."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md" data-subscribe-dialog="">
        <form onSubmit={(e) => void add(e)} className="flex min-h-0 flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Add a calendar</DialogTitle>
            <DialogDescription>
              Its events show with yours and change only where it&apos;s published. OneCamp reads it again every 15 minutes.
            </DialogDescription>
          </DialogHeader>
          <OverlayBody className="grid gap-4">
            <SegmentedControl<Way>
              className="justify-self-start"
              aria-label="Add"
              value={way}
              onValueChange={(w) => {
                setWay(w)
                setError("")
              }}
              disabled={busy}
              options={[
                { value: "holidays", label: "Public holidays" },
                { value: "address", label: "By its address" },
              ]}
            />
            {way === "holidays" ? (
              <Field label="Country" help="The public holidays Google publishes for it.">
                <Select value={country} onValueChange={setCountry} disabled={busy}>
                  <SelectTrigger data-holiday-country="">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {HOLIDAY_CALENDARS.map((h) => (
                      <SelectItem key={h.country} value={h.country}>
                        {h.country}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : (
              <>
                <Field
                  label="Address"
                  help={addressError ? undefined : "It ends in .ics, or starts with webcal://. OneCamp keeps it encrypted and never shows it again."}
                  error={addressError || undefined}
                >
                  <Input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="https://… or webcal://…"
                    inputMode="url"
                    autoComplete="off"
                    spellCheck={false}
                    disabled={busy}
                    autoFocus
                    className="font-mono text-meta"
                  />
                </Field>
                <Field label="Name" help="Leave it empty to use the calendar's own.">
                  <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="As the calendar names itself" disabled={busy} />
                </Field>
              </>
            )}
            {error && way === "holidays" ? (
              <p role="alert" className="text-meta text-danger-ink">
                {error}
              </p>
            ) : null}
          </OverlayBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" busy={busy}>
              Add calendar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
