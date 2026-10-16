import { describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "fs"
import path from "path"

// What a visitor's first screen downloads. A new visitor waited 8 to 9
// seconds for Home, a good part of it on code Home never runs: the editor
// (ProseMirror, Yjs, code highlighting) came in through the thread panel in
// the app's layout, and the MQTT client through the realtime provider. They
// load when they're needed now. This walks the static imports from the
// layouts and Home (a dynamic import() starts a chunk of its own, so it isn't
// followed) and fails, naming the chain, if one of them is reached again.

const HEAVY = ["@tiptap/", "prosemirror-", "yjs", "y-prosemirror", "lowlight", "highlight.js", "mqtt", "framer-motion", "livekit-client", "@livekit/"]
const ENTRIES = ["app/layout.tsx", "app/app/layout.tsx", "app/app/home/page.tsx"]

const importRe = /^\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gm

function resolve(spec: string, from: string): string | null {
  let base: string
  if (spec.startsWith("@/")) base = spec.slice(2)
  else if (spec.startsWith(".")) base = path.join(path.dirname(from), spec)
  else return null
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (existsSync(c) && !c.endsWith("/") && /\.(t|j)sx?$/.test(c)) return c
  }
  return null
}

function heavyReach(entries: string[]): string[] {
  const parent = new Map<string, string | null>(entries.map((e) => [e, null]))
  const queue = [...entries]
  const found: string[] = []
  const chain = (f: string | null): string => {
    const out: string[] = []
    while (f) {
      out.push(f)
      f = parent.get(f) ?? null
    }
    return out.join(" <- ")
  }
  while (queue.length) {
    const file = queue.shift()!
    const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
    for (const m of src.matchAll(importRe)) {
      const spec = m[1]
      const lib = HEAVY.find((h) => spec === h.replace(/\/$/, "") || spec.startsWith(h))
      if (lib) found.push(`${spec}: ${chain(file)}`)
      const next = resolve(spec, file)
      if (next && !parent.has(next)) {
        parent.set(next, file)
        queue.push(next)
      }
    }
  }
  return found
}

describe("a visitor's first screen", () => {
  it("doesn't download the editor, the realtime client or an animation library", () => {
    expect(heavyReach(ENTRIES)).toEqual([])
  })

  it("would see one: the composer, walked from, brings the editor", () => {
    expect(heavyReach(["components/textInput/textInput.tsx"]).some((r) => r.startsWith("@tiptap/"))).toBe(true)
  })
})

// A project's first screen (design v3 work wave, 11 Oct): its route's script
// grew from 299 to 380 KB when the board, timeline, updates, files, the
// phone's page and the project's dialogs all rode in with the list. Each is
// a chunk of its own now, loaded when its tab or dialog opens. This walks
// the route's static imports and fails if one of them is reached again, and
// holds the source the route pulls in under a ceiling that may only go down.
const PROJECT_ROUTE = "app/app/project/[project-id]/page.tsx"
const PROJECT_LAZY = [
  "components/project/projectTaskKanban.tsx",
  "components/kanbanComponents/TaskBoard.tsx",
  "components/project/timeline/ProjectTimeline.tsx",
  "components/projectUpdates/ProjectUpdates.tsx",
  "components/project/ProjectAttachments.tsx",
  "components/project/projectListTabs.tsx",
  "components/project/ProjectStatusesDialog.tsx",
  "components/project/ProjectFieldsDialog.tsx",
  "components/project/ProjectFormsDialog.tsx",
  "components/project/ProjectShareDialog.tsx",
  "components/project/ProjectTimeDialog.tsx",
  "components/project/ProjectRatesDialog.tsx",
  "components/projectTemplates/SaveAsTemplateDialog.tsx",
  "components/task/cycleBurndownDialog.tsx",
  "components/charts/SvgChart.tsx",
  "components/task/taskCreateForm.tsx",
  // The timeline's layout and the workload's sums: a list's writes need only
  // a date reader and the workload's address (lib/tasks/taskDate,
  // lib/workloadKey), and the two came in whole, 37 KB, through useTaskUpdate.
  "lib/timeline.ts",
  "lib/workload.ts",
  // The number reader: a field's value is read where it is typed, in the task
  // panel (lib/tasks/fieldInput), never where a list shows it (17d, 16 Oct:
  // through lib/tasks/fields it took the route 1,160 B over its ceiling).
  "lib/format/number.ts",
]
/** Bytes of source the project route reaches by static import: 1.61 MB before the split, 0.95 MB after. */
const PROJECT_ROUTE_SOURCE_CEILING = 980_000

function reach(entry: string): Map<string, string | null> {
  const parent = new Map<string, string | null>([[entry, null]])
  const queue = [entry]
  while (queue.length) {
    const file = queue.shift()!
    const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
    for (const m of src.matchAll(importRe)) {
      const next = resolve(m[1], file)
      if (next && !parent.has(next)) {
        parent.set(next, file)
        queue.push(next)
      }
    }
  }
  return parent
}

describe("a project's first screen", () => {
  const reached = reach(PROJECT_ROUTE)
  it("loads the list only: other tabs, the phone's page and the dialogs are chunks of their own", () => {
    expect(PROJECT_LAZY.filter((f) => reached.has(f))).toEqual([])
  })

  it("keeps the source it pulls in under its ceiling", () => {
    let bytes = 0
    for (const f of reached.keys()) bytes += readFileSync(f).length
    expect(bytes, `the project route reaches ${bytes} bytes of source (ceiling ${PROJECT_ROUTE_SOURCE_CEILING})`).toBeLessThanOrEqual(PROJECT_ROUTE_SOURCE_CEILING)
  })
})
