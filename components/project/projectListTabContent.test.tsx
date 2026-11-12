import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import type { WorkAccess } from "@/lib/work/types"
import { pinTestClock } from "@/lib/testing/testClock"

// A project's Attachments tab on a phone (V-732): who may link a doc or board
// to the project is the project's Work Access, add_files (the server's
// canEditSource, NeedAddFiles), read from the project the computer reads.
// Anyone who can view the project sees what is linked.
const PROJECT = "5f11e5a0-0000-4000-8000-0000000000f2"
type Read = { data?: unknown; isLoading?: boolean; isError?: unknown }
let info: Read = {}
const project = (access: Partial<WorkAccess>) => ({ data: { data: { project_uuid: PROJECT, project_name: "Q4 launch", project_access: access } } })
const READER: Partial<WorkAccess> = { role: "viewer", view: true, comment: true, add_files: false }
const EDITOR: Partial<WorkAccess> = { role: "member", view: true, comment: true, create_tasks: true, add_files: true }

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("tab=attachments"), useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock("@/hooks/useFetch", () => ({
  // The server's three answers the tab draws from, by address; anything else loads.
  useFetch: (url: string) => {
    const read: Read = url.startsWith(`/project/info/${PROJECT}`)
      ? info
      : url.startsWith(`/project/attachments/${PROJECT}`)
        ? {
            data: { data: { project_attachments: [{ attachment_uuid: "f1", attachment_file_name: "brief.pdf", attachment_type: "document", attachment_size: 1024, attachment_created_at: "2026-11-01T10:00:00Z" }], ...(info.data as { data?: object } | undefined)?.data } },
            isLoading: false,
          }
        : url.startsWith(`/link/source/project/${PROJECT}`)
          ? { data: { data: { docs: [{ doc_uuid: "d1", doc_title: "Launch plan" }], boards: [] } }, isLoading: false }
          : { data: undefined, isLoading: true }
    return { ...read, mutate: vi.fn() }
  },
  useMediaFetch: () => ({ data: undefined }),
}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(async () => ({})), isSubmitting: false }) }))
vi.mock("@/hooks/useUploadFile", () => ({ useUploadFile: () => ({ makeRequestToUploadToProject: vi.fn() }) }))
vi.mock("@/lib/navigation/appRouter", () => ({ useAppRouter: () => ({ push: vi.fn() }) }))
vi.mock("react-redux", () => ({
  useDispatch: () => vi.fn(),
  useSelector: (pick: (s: unknown) => unknown) => pick({ projectAttachment: { projectAttachmentInputState: {} } }),
}))
// The rest of the phone's project, which this tab never draws.
vi.mock("@/components/project/projectTaskList", () => ({ ProjectTaskList: () => null }))
vi.mock("@/components/project/projectTaskKanban", () => ({ ProjectTaskKanban: () => null }))
vi.mock("@/components/project/timeline/ProjectTimeline", () => ({ ProjectTimeline: () => null }))
vi.mock("@/components/work/backlog/ProjectBacklog", () => ({ default: () => null }))
vi.mock("@/components/work/releases/ReleasesTab", () => ({ ReleasesTab: () => null }))
vi.mock("@/components/projectUpdates/ProjectUpdates", () => ({ ProjectUpdates: () => null }))
vi.mock("@/components/project/ProjectGlanceLine", () => ({ ProjectGlanceLine: () => null }))
vi.mock("@/components/project/ProjectToolButtons", () => ({ ProjectActionsMenu: () => null }))
vi.mock("@/components/projectUpdates/ProjectHealthChip", () => ({ ProjectHealthChip: () => null }))
vi.mock("@/components/goals/ProjectGoalChip", () => ({ ProjectGoalChip: () => null }))
vi.mock("@/components/project/ProjectLinksStrip", () => ({ ProjectLinksChip: () => null }))

const { ProjectListTabs } = await import("@/components/project/projectListTabs")

beforeAll(() => {
  Object.defineProperty(window, "innerWidth", { value: 390, configurable: true })
})
afterEach(() => {
  cleanup()
  info = {}
})

const linkControl = () => screen.queryByRole("button", { name: /Link a doc or board/ })

describe("a project's linked docs and boards on a phone, at 390 (V-732)", () => {
  // The files answer writes a date (app/testClock.test.ts): today is TEST_TODAY.
  pinTestClock()
  it("are listed for a read-only member, with nothing offered to link or unlink", () => {
    info = { ...project(READER), isLoading: false }
    render(<ProjectListTabs projectId={PROJECT} />)
    expect(screen.getByRole("heading", { name: /^Linked docs and boards/ })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Launch plan" })).toBeTruthy()
    expect(linkControl()).toBeNull()
    expect(screen.queryByRole("button", { name: "Unlink" })).toBeNull()
  })

  it("offer someone who may add files to the project the picker and Unlink", () => {
    info = { ...project(EDITOR), isLoading: false }
    render(<ProjectListTabs projectId={PROJECT} />)
    expect(screen.getByRole("button", { name: "Launch plan" })).toBeTruthy()
    expect(linkControl()).toBeTruthy()
    expect(screen.getByRole("button", { name: "Unlink" })).toBeTruthy()
  })

  it("offer nothing to link while what the reader may do is unknown: loading, or a failed read", () => {
    for (const unknown of [{ isLoading: true }, { isLoading: false, isError: new Error("offline") }] as Read[]) {
      info = unknown
      render(<ProjectListTabs projectId={PROJECT} />)
      expect(screen.getByRole("button", { name: "Launch plan" })).toBeTruthy()
      expect(linkControl()).toBeNull()
      cleanup()
    }
  })
})
