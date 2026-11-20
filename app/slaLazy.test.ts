import { existsSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { chainOf, walk } from "../scripts/fluidity/reach.mjs"

// A project's SLAs on its list and board (linear-24 W1). The rows' chip, the
// Filter's SLA list and the SLA's words are chunks of their own: a row mounts
// the chip only for a task the server sent an SLA for, and the toolbar loads
// the list once its reader may filter by SLA. Neither reaches the shared core,
// which would re-cut every route's chunks (app/releasesLazy.test).
const CORE = [
  "lib/axiosInstance.ts",
  "hooks/useFetch.ts",
  "hooks/useClientConfig.ts",
  "hooks/use-toast.ts",
  "components/ui/error-state.tsx",
  "components/ui/empty-state.tsx",
  "components/ui/graphics/index.ts",
  "store/store.ts",
]
const CHIP = "components/task/SlaChip.tsx"
const FACET = "components/task/slaFacet.tsx"
const WORDS = "lib/work/sla.ts"

const reach = (entries: string[], targets: string[]) => {
  const { files } = walk(entries) as { files: Map<string, string | null> }
  return targets.filter((p) => files.has(p)).map((p) => `${p}: ${chainOf(files, p)}`)
}

describe("SLAs on a list's rows and toolbar", () => {
  it("are chunks the rows, cards and toolbar don't import", () => {
    expect([CHIP, FACET, WORDS].every((f) => existsSync(f))).toBe(true)
    const firstScreens = ["components/task/GroupedTaskList.tsx", "components/task/taskListTask.tsx", "components/task/WorkToolbar.tsx", "components/kanbanComponents/Item/Item.tsx"]
    expect(reach(firstScreens, [CHIP, FACET, WORDS])).toEqual([])
  })

  it("reach none of the shared core", () => {
    expect(reach([CHIP], CORE)).toEqual([])
    expect(reach([FACET], CORE)).toEqual([])
  })
})

// A project's SLA settings (linear-24 W2) and who can change its tasks are
// dialogs of their own, fetched when a project admin opens one. Their chunks
// import none of the shared core: the project's page hands them its HTTP
// client, its cache and the policies' path (hooks/useProjectPolicy's
// ProjectCalls), the way the Releases tab gets its client (app/releasesLazy.test).
// A core module either imported would join the dialog's chunk group and re-cut
// the app shell's chunks on every route (V-1049; w2/REGROUP-L24W2D.txt: the
// edge was ProjectToolButtons => ProjectSlaDialog).
const DIALOGS = ["components/project/ProjectSlaDialog.tsx", "components/project/ProjectAccessDialog.tsx"]
const HANDED = ["lib/swrMutate.ts", "services/workAccessService.ts"]
const HOST = "components/project/ProjectToolButtons.tsx"

describe("the project's SLA settings dialog", () => {
  it("reaches none of the shared core, nor does the policy hook it shares: the page hands them in", () => {
    expect(DIALOGS.every((f) => existsSync(f))).toBe(true)
    expect(reach([DIALOGS[0]], [...CORE, ...HANDED])).toEqual([])
    // Who can change tasks keeps the words it showed before W2 (services/workAccessService); its policy's read
    // and write, shared with the SLAs' (hooks/useProjectPolicy), are the page's.
    expect(reach(["hooks/useProjectPolicy.ts"], [...CORE, ...HANDED])).toEqual([])
  })

  it("are handed the page's calls by the project's tools", () => {
    const host = readFileSync(HOST, "utf8")
    expect(host).toMatch(/<ProjectSlaDialog projectId=\{projectId\} calls=\{calls\}/)
    expect(host).toMatch(/<ProjectAccessDialog projectId=\{projectId\} calls=\{calls\}/)
  })

  // Its week editor reaches TimeField and date-fns' parse. Rooting a lazy group of its own, the dialog gave those a
  // new group signature and the task page's editor chunks re-paired (+94,541 gz, w2/SIZE-L24W2H.txt); the rules
  // dialog's group already reaches them, so the two load, and warm, through one module.
  it("loads with the rules dialog, through one module and one lazy group", () => {
    const host = readFileSync(HOST, "utf8")
    const RULES = "components/project/projectRuleDialogs.ts"
    expect(host).not.toMatch(/import\("@\/components\/(project\/ProjectSlaDialog|work\/rules\/ProjectRulesDialog)"\)/)
    // One import() of the module, in one loader: the dialogs and the warm-up all call it. An import() inside dynamic()
    // and a second outside it were two group roots for one file (w2/CANDIDATES-L24W2H.txt, a2).
    expect(host.match(/import\("@\/components\/project\/projectRuleDialogs"\)/g)).toHaveLength(1)
    expect(host).toMatch(/const loadRuleDialogs = \(\) => import\("@\/components\/project\/projectRuleDialogs"\)/)
    expect(host).toMatch(/dynamic\(\(\) => loadRuleDialogs\(\)\.then\(\(m\) => m\.ProjectSlaDialog\)/)
    expect(host).toMatch(/dynamic\(\(\) => loadRuleDialogs\(\)\.then\(\(m\) => m\.ProjectRulesDialog\)/)
    expect(host).toMatch(/void loadRuleDialogs\(\)/)
    expect(reach([RULES], [DIALOGS[0], "components/work/rules/ProjectRulesDialog.tsx"]).length).toBe(2)
  })
})
