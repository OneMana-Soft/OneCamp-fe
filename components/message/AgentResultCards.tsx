"use client"

// AgentResultCards — a generic, future-proof presentation layer that turns the
// structured results an AI teammate posts (today: a GitHub pull request, an
// "open a PR" compare link, or a pushed branch; tomorrow: GitLab MRs, a deploy
// preview, a CI run, a created doc/table/dashboard…) into clean, Notion-style
// cards, instead of a bare underlined URL buried in a sentence.
//
// Design for longevity + safety:
//   - EXTENSIBLE BY REGISTRY. A new result type is ONE registered provider
//     (registerResultProvider) — no change to any message component. The wiring
//     in every message surface is a single <AgentResultCards text={…} />.
//   - ADDITIVE ONLY. Renders BELOW the normal message body; never replaces or
//     mutates the rich-text render. Renders nothing when no provider matches, so
//     it is a zero-cost, invisible addition to every other message.
//   - BOT-SCOPED by the caller (only rendered for is_bot messages), so a human
//     pasting a link is unaffected.
//   - PURE + BOUNDED. Providers are pure functions over the raw message string
//     (works whether a URL is inside an <a href> or plain text); results are
//     de-duped, ordered, and capped, and a throwing provider can never break the
//     message. Safe to run on every render.

import React from "react"
import { GitBranch, GitPullRequest, GitMerge, ExternalLink } from "@/lib/icons"

// ── Public model ────────────────────────────────────────────────────────────

// The small set of visual treatments a card can request. Kept as a closed union
// (not arbitrary classes) so every provider stays on-brand and consistent.
export type ResultCardIcon = "pr" | "merge" | "branch" | "external"
export type ResultCardAccent = "success" | "primary" | "muted"

// ResultCard is the provider-agnostic descriptor the chrome renders. `key` is a
// stable de-dupe id (usually the href). `priority` orders cards (lower first).
export interface ResultCard {
  key: string
  href: string
  icon: ResultCardIcon
  accent: ResultCardAccent
  title: string
  subtitle?: string
  cta?: string
  priority: number
}

// A provider inspects the raw (HTML or plain-text) message body and returns any
// result cards it recognizes. MUST be pure, fast, and never throw for bad input
// (extractResultCards guards, but providers should still be defensive).
export type ResultCardProvider = (raw: string) => ResultCard[]

// ── Registry (the single extension point) ─────────────────────────────────────

const providers: ResultCardProvider[] = []

// registerResultProvider adds a provider to the global registry. Adding a new
// agent result type is exactly this one call (see the built-ins at the bottom):
// no message component ever changes. Append-only + module-scoped.
export function registerResultProvider(p: ResultCardProvider): void {
  if (typeof p === "function") providers.push(p)
}

// extractResultCards runs every registered provider over the message, de-dupes
// by key (first match wins), orders by priority, and caps the count. Bounded +
// resilient (a throwing provider is skipped), so it's safe on every render.
export function extractResultCards(raw: string, max = 4): ResultCard[] {
  if (!raw) return []
  const byKey = new Map<string, ResultCard>()
  for (const provider of providers) {
    let cards: ResultCard[]
    try {
      cards = provider(raw) || []
    } catch {
      cards = []
    }
    for (const c of cards) {
      if (!c || !c.href || !c.key || byKey.has(c.key)) continue
      byKey.set(c.key, c)
    }
  }
  return Array.from(byKey.values())
    .sort((a, b) => a.priority - b.priority)
    .slice(0, Math.max(0, max))
}

// ── Chrome (one consistent look for every provider) ───────────────────────────

const ICONS: Record<ResultCardIcon, React.ComponentType<{ className?: string }>> = {
  pr: GitPullRequest,
  merge: GitMerge,
  branch: GitBranch,
  external: ExternalLink,
}

const ACCENTS: Record<ResultCardAccent, string> = {
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  primary: "bg-primary/10 text-primary",
  muted: "bg-muted text-muted-foreground",
}

function ResultCardChrome({ card }: { card: ResultCard }) {
  const Icon = ICONS[card.icon] || ExternalLink
  return (
    <a
      href={card.href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="group/rc flex items-center gap-2.5 rounded-lg border border-border/70 bg-card/40 px-3 py-2 transition-colors hover:border-border hover:bg-accent/40 min-w-0"
    >
      <span className={"flex h-7 w-7 shrink-0 items-center justify-center rounded-md " + (ACCENTS[card.accent] || ACCENTS.muted)}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium leading-tight text-foreground">{card.title}</span>
        {card.subtitle ? (
          <span className="block truncate font-mono text-[11px] leading-tight text-muted-foreground">{card.subtitle}</span>
        ) : null}
      </span>
      <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors group-hover/rc:text-foreground">
        {card.cta ? <span className="hidden sm:inline">{card.cta}</span> : null}
        <ExternalLink className="h-3.5 w-3.5" />
      </span>
    </a>
  )
}

// AgentResultCards renders one card per recognized result in the (bot) message,
// or nothing when there's nothing to show.
export function AgentResultCards({ text, max, className }: { text: string; max?: number; className?: string }) {
  const cards = React.useMemo(() => extractResultCards(text || "", max), [text, max])
  if (cards.length === 0) return null
  return (
    <div className={"mt-1.5 flex flex-col gap-1.5 " + (className || "")}>
      {cards.map((c) => (
        <ResultCardChrome key={c.key} card={c} />
      ))}
    </div>
  )
}

// ── Built-in providers ────────────────────────────────────────────────────────
// VCS pull/merge-request results. Host-agnostic by design so GitHub, GitHub
// Enterprise, and self-hosted GitLab all work out of the box (matching the
// server-side link builders, which target the workspace's own git host).

// Strip the query GitHub/GitLab append to compare links ("main...feat?expand=1")
// for a cleaner branch/ref label.
function cleanRef(ref: string): string {
  const q = ref.indexOf("?")
  return q >= 0 ? ref.slice(0, q) : ref
}

// GitHub / GitHub Enterprise — host contains "github". Path shapes:
//   /owner/repo/pull/<n>           → pull request
//   /owner/repo/compare/<…>        → open a PR
//   /owner/repo/pull/new/<branch>  → open a PR
//   /owner/repo/tree/<branch>      → branch
function githubProvider(raw: string): ResultCard[] {
  if (raw.indexOf("github") === -1) return []
  const host = "([\\w.-]*github[\\w.-]*)"
  const out: ResultCard[] = []
  const reposWithPR = new Set<string>()
  const seenOpenRepo = new Set<string>()

  const scan = (re: RegExp, fn: (m: RegExpExecArray) => void) => {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(raw)) !== null) fn(m)
  }

  scan(new RegExp(`https:\\/\\/${host}\\/([\\w.-]+)\\/([\\w.-]+)\\/pull\\/(\\d+)`, "g"), (m) => {
    const repo = `${m[2]}/${m[3]}`
    reposWithPR.add(repo)
    out.push({ key: m[0], href: m[0], icon: "pr", accent: "success", title: "Pull request", subtitle: `${repo}#${m[4]}`, cta: "View PR", priority: 0 })
  })
  const addOpen = (re: RegExp) =>
    scan(re, (m) => {
      const repo = `${m[2]}/${m[3]}`
      if (reposWithPR.has(repo) || seenOpenRepo.has(repo)) return
      seenOpenRepo.add(repo)
      out.push({ key: m[0], href: m[0], icon: "pr", accent: "primary", title: "Open a pull request", subtitle: `${repo} · ${cleanRef(m[4])}`, cta: "Open PR", priority: 1 })
    })
  addOpen(new RegExp(`https:\\/\\/${host}\\/([\\w.-]+)\\/([\\w.-]+)\\/compare\\/([^\\s"'<>)]+)`, "g"))
  addOpen(new RegExp(`https:\\/\\/${host}\\/([\\w.-]+)\\/([\\w.-]+)\\/pull\\/new\\/([^\\s"'<>)]+)`, "g"))
  scan(new RegExp(`https:\\/\\/${host}\\/([\\w.-]+)\\/([\\w.-]+)\\/tree\\/([^\\s"'<>)]+)`, "g"), (m) => {
    const repo = `${m[2]}/${m[3]}`
    if (reposWithPR.has(repo) || seenOpenRepo.has(repo)) return
    out.push({ key: m[0], href: m[0], icon: "branch", accent: "muted", title: "Branch", subtitle: `${repo} · ${cleanRef(m[4])}`, cta: "View branch", priority: 2 })
  })
  return out
}

// GitLab (incl. self-hosted) — the "/-/" segment is GitLab-specific, so we match
// any host. Project path may include subgroups. Shapes:
//   /group/repo/-/merge_requests/<n>    → merge request
//   /group/repo/-/merge_requests/new…   → open an MR
//   /group/repo/-/compare/<…>           → open an MR
//   /group/repo/-/tree/<branch>         → branch
function gitlabProvider(raw: string): ResultCard[] {
  if (raw.indexOf("/-/") === -1) return []
  const out: ResultCard[] = []
  const reposWithMR = new Set<string>()
  const seenOpenRepo = new Set<string>()
  const scan = (re: RegExp, fn: (m: RegExpExecArray) => void) => {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(raw)) !== null) fn(m)
  }
  // proj = host + project path (may contain subgroups), captured minimally.
  scan(/https:\/\/([^\s"'<>]+?)\/-\/merge_requests\/(\d+)/g, (m) => {
    reposWithMR.add(m[1])
    out.push({ key: m[0], href: m[0], icon: "merge", accent: "success", title: "Merge request", subtitle: `${m[1].replace(/^[^/]+\//, "")}!${m[2]}`, cta: "View MR", priority: 0 })
  })
  const addOpen = (re: RegExp) =>
    scan(re, (m) => {
      if (reposWithMR.has(m[1]) || seenOpenRepo.has(m[1])) return
      seenOpenRepo.add(m[1])
      out.push({ key: m[0], href: m[0], icon: "merge", accent: "primary", title: "Open a merge request", subtitle: m[1].replace(/^[^/]+\//, ""), cta: "Open MR", priority: 1 })
    })
  addOpen(/https:\/\/([^\s"'<>]+?)\/-\/merge_requests\/new[^\s"'<>)]*/g)
  addOpen(/https:\/\/([^\s"'<>]+?)\/-\/compare\/([^\s"'<>)]+)/g)
  scan(/https:\/\/([^\s"'<>]+?)\/-\/tree\/([^\s"'<>)]+)/g, (m) => {
    if (reposWithMR.has(m[1]) || seenOpenRepo.has(m[1])) return
    out.push({ key: m[0], href: m[0], icon: "branch", accent: "muted", title: "Branch", subtitle: `${m[1].replace(/^[^/]+\//, "")} · ${cleanRef(m[2])}`, cta: "View branch", priority: 2 })
  })
  return out
}

registerResultProvider(githubProvider)
registerResultProvider(gitlabProvider)

export default AgentResultCards
