"use client"

// The Releases tab's parts that its list and its sheet share (./ProjectReleases,
// where the why is): the read through the page's client (lib/lazy/useKeptRead),
// a release's state and a stage's last word.

import { Server, Wrench } from "@/lib/icons"
import { stageLine, stageTone, type Release, type ReleaseStage } from "@/lib/work/releases"

export { useKeptRead } from "@/lib/lazy/useKeptRead"

/** Planned or Released, as a soft pill in its state's tint, so it reads apart from the pipeline's words beside it. */
export function StatePill({ release }: { release: Pick<Release, "state"> }) {
  const out = release.state === "released"
  return (
    <span
      data-release-state={release.state}
      className={`inline-flex h-5 shrink-0 items-center rounded-[6px] px-2 text-meta font-medium ${out ? "bg-camp-moss-tint text-camp-moss-ink" : "bg-camp-sky-tint text-camp-sky-ink"}`}
    >
      {out ? "Released" : "Planned"}
    </span>
  )
}

const GLYPH_INK: Record<ReturnType<typeof stageTone>, string> = { ok: "text-success-ink", failed: "text-danger-ink", running: "text-warning-ink" }

/** One stage's last word: its kind's glyph in how it stands, then its line ("CI passed", "Staging deploying"). */
export function StageChip({ stage }: { stage: ReleaseStage }) {
  const Icon = stage.kind === "deploy" ? Server : Wrench
  const tone = stageTone(stage.status)
  return (
    <span data-stage-chip={tone} className="inline-flex min-w-0 max-w-[14rem] items-center gap-1 text-meta text-foreground">
      <Icon className={`size-3.5 shrink-0 ${GLYPH_INK[tone]}`} aria-hidden />
      <span className="truncate">{stageLine(stage)}</span>
    </span>
  )
}
