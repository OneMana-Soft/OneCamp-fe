import { useId, useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PaperCard, PublicFrame } from "@/components/guest/PublicFrame"
import type { PublicSurface } from "@/components/public/MadeWithOneCamp"
import { Eye, EyeOff, Lock } from "@/lib/icons"

// A page's password and a room's passcode: one card, one form.
export function PublicCard({ surface = "published-page", tile, title, line, children, high, band }: { surface?: PublicSurface; tile: ReactNode; title: string; line: string; children?: ReactNode; high?: boolean; band?: boolean }) {
  return (
    // high: a card with a field sits in the top third on a phone, clear of the keyboard.
    <PublicFrame surface={surface} header={false} band={band} mainClassName={high ? "justify-start px-4 pb-10 pt-[12dvh] sm:justify-center sm:py-10" : "justify-center px-4 py-10"}>
      {/* Inside the 16px gutter at every width, so it keeps its corners on a phone too. */}
      <PaperCard className="flex max-w-[440px] flex-col gap-4 rounded-[16px] p-6 sm:p-8">
        {tile}
        <div className="flex flex-col gap-1">
          <h1 className="text-[1.375rem] font-semibold leading-tight tracking-tight text-ink">{title}</h1>
          <p className="text-ui text-ink-2 text-pretty">{line}</p>
        </div>
        {children}
      </PaperCard>
    </PublicFrame>
  )
}

export const LockTile = () => (
  <span aria-hidden="true" data-unlock-tile="" className="inline-grid size-10 shrink-0 place-items-center rounded-lg bg-sunken text-ink-2 ring-1 ring-inset ring-line [&>svg]:size-5">
    <Lock />
  </span>
)

/** onSubmit answers what to say, or nothing once it opened. */
export function SecretForm({ label, action, autoComplete, onSubmit }: { label: string; action: string; autoComplete: string; onSubmit: (secret: string) => Promise<string | undefined> }) {
  const [secret, setSecret] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shown, setShown] = useState(false)
  const id = useId()
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!secret || busy) return
        setBusy(true)
        setError(null)
        const failed = await onSubmit(secret)
        if (failed === undefined) return
        setBusy(false)
        setError(failed)
      }}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-ui-sm font-medium text-ink">
          {label}
        </label>
        <div className="relative">
          <Input
            id={id}
            type={shown ? "text" : "password"}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}e` : undefined}
            autoComplete={autoComplete}
            autoFocus
            className="pr-11"
          />
          <button
            type="button"
            onClick={() => setShown((v) => !v)}
            aria-label={`${shown ? "Hide" : "Show"} the ${label.toLowerCase()}`}
            aria-pressed={shown}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-md text-ink-3 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
          >
            {shown ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
          </button>
        </div>
      </div>
      {error ? (
        <p id={`${id}e`} role="alert" className="text-ui-sm text-danger-ink">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={!secret} busy={busy}>
        {action}
      </Button>
    </form>
  )
}
