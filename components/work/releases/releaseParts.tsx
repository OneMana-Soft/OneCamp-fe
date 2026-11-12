"use client"

// The Releases tab's parts that its list and its sheet share (./ProjectReleases,
// where the why is): the read through the page's client, a release's state and
// a stage's last word.

import * as React from "react"
import { Server, Wrench } from "@/lib/icons"
import { stageLine, stageTone, type Release, type ReleaseStage } from "@/lib/work/releases"

// What was last read, by path, while the page lives.
const kept = new Map<string, unknown>()

/**
 * A read through the page's client: what was kept for its path at once, then
 * the server's; again when the window is shown again, and on again(). A read
 * that fails keeps what is on screen and says failed. keep() takes a write's
 * answer as the read's, with no read again.
 */
export function useKeptRead<T>(path: string | null, load: () => Promise<T>) {
  const [data, setData] = React.useState<T | undefined>(() => (path ? (kept.get(path) as T | undefined) : undefined))
  const [failed, setFailed] = React.useState(false)
  const [shown, setShown] = React.useState(path)
  if (shown !== path) {
    setShown(path)
    setData(path ? (kept.get(path) as T | undefined) : undefined)
    setFailed(false)
  }
  const again = React.useCallback(async () => {
    if (!path) return
    try {
      const got = await load()
      kept.set(path, got)
      setData(got)
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [path, load])
  const keep = React.useCallback(
    (got: T) => {
      if (path) kept.set(path, got)
      setData(got)
      setFailed(false)
    },
    [path],
  )
  React.useEffect(() => {
    void again()
    const onShow = () => document.visibilityState === "visible" && void again()
    window.addEventListener("focus", onShow)
    document.addEventListener("visibilitychange", onShow)
    return () => {
      window.removeEventListener("focus", onShow)
      document.removeEventListener("visibilitychange", onShow)
    }
  }, [again])
  return { data, failed, again, keep }
}

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
