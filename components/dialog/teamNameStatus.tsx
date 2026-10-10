import { CheckCircle } from "@/lib/icons"

/** One line under a team's name field: the rule it breaks, or what the check found. */
export function TeamNameStatus({ id, error, checking, available, taken }: { id: string; error?: string; checking: boolean; available: boolean; taken: boolean }) {
  return (
    <p id={id} aria-live="polite" className="min-h-5 text-xs">
      {error ? (
        <span className="text-danger-ink">{error}</span>
      ) : taken ? (
        <span className="text-danger-ink">A team already has this name.</span>
      ) : available ? (
        <span className="inline-flex items-center gap-1 text-success-ink">
          <CheckCircle className="size-3.5" aria-hidden="true" />
          Name is available
        </span>
      ) : checking ? (
        <span className="text-muted-foreground">Checking the name…</span>
      ) : null}
    </p>
  )
}
