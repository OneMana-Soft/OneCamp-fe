import { afterEach, describe, expect, it, vi } from "vitest"

const calls: string[] = []
let answers: Array<{ data: unknown }> = []
vi.mock("@/lib/axiosInstance", () => {
  const next = async (method: string, url: string) => {
    calls.push(`${method} ${url}`)
    const a = answers.shift()
    if (!a) throw new Error("no answer")
    return a
  }
  return {
    default: { post: (url: string) => next("POST", url), get: (url: string) => next("GET", url) },
    OWN_ERRORS: { suppressErrorToast: true },
  }
})
vi.mock("@/lib/swrMutate", () => ({ appMutate: vi.fn() }))

const { draftProjectPlan } = await import("./useProjectTemplates")
const plan = { name: "Launch", tasks: [{ name: "Plan" }] }
const draft = (state: string, extra = {}) => ({ data: { data: { id: "d1", state, ...extra } } })

afterEach(() => {
  vi.useRealTimers()
  calls.length = 0
  answers = []
})

describe("drafting a plan", () => {
  it("asks for the draft until it's done", async () => {
    vi.useFakeTimers()
    answers = [draft("drafting"), draft("drafting"), draft("done", { template: plan })]
    const got = draftProjectPlan("Launch the app in six weeks")
    await vi.advanceTimersByTimeAsync(5000)
    await expect(got).resolves.toEqual(plan)
    expect(calls).toEqual(["POST /ai/project-template/draft", "GET /ai/project-template/draft/d1", "GET /ai/project-template/draft/d1"])
  })

  it("gives the server's reason when the draft fails", async () => {
    answers = [draft("failed", { msg: "The AI took too long to draft the plan." })]
    await expect(draftProjectPlan("Plan the offsite")).rejects.toThrow("The AI took too long to draft the plan.")
  })

  it("stops asking when it's called off", async () => {
    vi.useFakeTimers()
    answers = [draft("drafting")]
    const c = new AbortController()
    const got = draftProjectPlan("Plan the offsite", c.signal)
    const outcome = got.catch((e) => e)
    await vi.advanceTimersByTimeAsync(100)
    c.abort()
    expect((await outcome).name).toBe("AbortError")
    expect(calls).toEqual(["POST /ai/project-template/draft"])
  })
})
