import { readSystemLine } from "@/lib/conversation/systemLine"

/**
 * Runs of joins and leaves (chat B28): lines that people joined or left a
 * channel, each within ten minutes of the one before and nothing between
 * them, are drawn as one line at the run's first ("Maya, Jonas and 3 others
 * joined. Sam left."), the others hidden. The names are the server's own words
 * ("Maya joined."), so nobody is named twice or differently. Pure.
 *
 * A channel's lines (business/Conversation channelLines.go) are
 * channel.joined, .left, .added, .removed, .renamed, .topic, .private,
 * .public, .archived and .restored; each draws as its words.
 */

const RUN_GAP_MS = 10 * 60 * 1000
const JOINED = "channel.joined"
const LEFT = "channel.left"

/** A message in order: a system line carries its facts. */
export interface RunCandidate {
  id: string
  at: string
  text: string
  system?: string
}

export interface LineRuns {
  /** The run's first line's words, for each run of two or more. */
  words: Map<string, string>
  /** The other lines of each run. */
  hidden: Set<string>
}

const nameOf = (text: string, verb: string) =>
  text.replace(/<[^>]*>/g, "").trim().replace(new RegExp(` ${verb}\\.$`), "")

function list(names: string[]): string {
  if (names.length <= 2) return names.join(" and ")
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`
  const more = names.length - 3
  return `${names.slice(0, 3).join(", ")} and ${more} ${more === 1 ? "other" : "others"}`
}

export function collapseLineRuns(items: readonly RunCandidate[]): LineRuns {
  const out: LineRuns = { words: new Map(), hidden: new Set() }
  let run: { id: string; at: number; kind: string; text: string }[] = []
  const close = () => {
    if (run.length > 1) {
      const joined = run.filter((r) => r.kind === JOINED).map((r) => nameOf(r.text, "joined"))
      const left = run.filter((r) => r.kind === LEFT).map((r) => nameOf(r.text, "left"))
      const parts = [joined.length ? `${list(joined)} joined.` : "", left.length ? `${list(left)} left.` : ""].filter(Boolean)
      out.words.set(run[0].id, `<p>${parts.join(" ")}</p>`)
      for (const r of run.slice(1)) out.hidden.add(r.id)
    }
    run = []
  }
  for (const item of items) {
    const kind = readSystemLine(item.system)?.kind
    const t = Date.parse(item.at)
    if ((kind === JOINED || kind === LEFT) && !Number.isNaN(t)) {
      if (run.length && t - run[run.length - 1].at > RUN_GAP_MS) close()
      run.push({ id: item.id, at: t, kind, text: item.text })
    } else {
      close()
    }
  }
  close()
  return out
}
