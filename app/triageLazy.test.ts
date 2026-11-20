import { existsSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { chainOf, walk } from "../scripts/fluidity/reach.mjs"

// A project's Triage tab (linear-21 H3): its queue and its admin sheet are chunks of their own,
// fetched when the tab is opened or an admin opens the sheet. Neither reaches the shared core: the
// page hands them its HTTP client, its cache and the policies' path (hooks/useProjectPolicy's
// ProjectCalls) and the shared empty, error and loading states, as the Releases tab and the SLA
// dialog are handed theirs (app/releasesLazy.test, app/slaLazy.test). A core module either
// imported would join the chunk's group and re-cut the app shell's chunks on every route.
const CORE = [
  "lib/axiosInstance.ts",
  "hooks/useFetch.ts",
  "hooks/useClientConfig.ts",
  "hooks/use-toast.ts",
  "components/ui/error-state.tsx",
  "components/ui/empty-state.tsx",
  "components/ui/graphics/index.ts",
  "store/store.ts",
  "lib/swrMutate.ts",
  "services/workAccessService.ts",
]
const QUEUE = "components/work/triage/TriageQueue.tsx"
const SETTINGS = "components/work/triage/TriageSettings.tsx"
const ENTRY = "components/work/triage/TriageTab.tsx"
const FIRST_SCREENS = ["components/project/projectTaskDesktop.tsx", "components/project/projectListTabs.tsx", "components/project/ProjectToolButtons.tsx"]

const reach = (entries: string[], targets: string[]) => {
  const { files } = walk(entries) as { files: Map<string, string | null> }
  return targets.filter((p) => files.has(p)).map((p) => `${p}: ${chainOf(files, p)}`)
}

describe("the Triage tab's chunks", () => {
  it("are fetched when asked for: the project's first screens import neither", () => {
    expect([QUEUE, SETTINGS, ENTRY].every((f) => existsSync(f))).toBe(true)
    expect(reach(FIRST_SCREENS, [QUEUE, SETTINGS])).toEqual([])
  })

  it("reach none of the shared core", () => {
    expect(reach([QUEUE], CORE)).toEqual([])
    expect(reach([SETTINGS], CORE)).toEqual([])
  })

  it("are handed the page's calls: the queue by its entry, the sheet by the project's tools (admins only)", () => {
    expect(readFileSync(ENTRY, "utf8")).toMatch(/calls=\{calls\}/)
    const host = readFileSync("components/project/ProjectToolButtons.tsx", "utf8")
    expect(host).toMatch(/<TriageSettings projectId=\{projectId\} calls=\{calls\}/)
    // The tool is an admin's: it sits among the tools offered only to them.
    expect(host.slice(host.indexOf("...(isAdmin ? ["))).toMatch(/tool\("triage", "Triage"/)
  })

  // One loader, ProjectToolButtons' loadRuleDialogs: the tools and the tab draw the sheet from the rule dialogs' group.
  // An import() of its own would root a second group (app/slaLazy.test; w2/SIZE-L24W2H.txt: +94,541 gz).
  it("load the sheet through the rule dialogs' one loader", () => {
    const host = readFileSync("components/project/ProjectToolButtons.tsx", "utf8")
    const entry = readFileSync(ENTRY, "utf8")
    for (const f of [host, entry]) expect(f).toMatch(/dynamic\(\(\) => loadRuleDialogs\(\)\.then\(\(m\) => m\.TriageSettings\)/)
    expect(`${host}\n${entry}`).not.toMatch(/import\("@\/components\/work\/triage\/TriageSettings"\)/)
    // linear-21 H4: the group draws the sheet with the rules on arriving work beside it (TriageSheet).
    expect(readFileSync("components/project/projectRuleDialogs.ts", "utf8")).toMatch(/export \{ TriageSheet as TriageSettings \} from "@\/components\/work\/triage\/TriageSheet"/)
  })

  // linear-21 H4: the sheet opens the project's one rules dialog on arriving work, and hands the
  // settings the project's people through the key that dialog reads (one cache, one read), all in
  // the rule dialogs' group: no import() of its own, and the settings themselves stay core-free.
  it("open the rules on arriving work and the project's people inside the rule dialogs' group", () => {
    const sheet = readFileSync("components/work/triage/TriageSheet.tsx", "utf8")
    expect(sheet).not.toMatch(/import\(/)
    expect(sheet).toMatch(/<ProjectRulesDialog projectId=\{projectId\} arrival/)
    expect(sheet).toMatch(/\$\{GetEndpointUrl\.GetProjectMembers\}\/\$\{projectId\}/)
    expect(readFileSync("components/work/rules/ProjectRulesDialog.tsx", "utf8")).toMatch(/\$\{GetEndpointUrl\.GetProjectMembers\}\/\$\{projectId\}/)
    expect(reach(["components/work/rules/PeopleChips.tsx", "lib/work/triageRota.ts"], CORE)).toEqual([])
  })
})
