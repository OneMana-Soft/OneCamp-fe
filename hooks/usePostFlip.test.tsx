import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { readFileSync } from "node:fs"
import { sourceFiles } from "@/lib/testing/sourceFiles"

vi.mock("@/hooks/use-toast", () => {
  const toast = vi.fn()
  return { useToast: () => ({ toast }) }
})
// Every request waits until the test answers or fails it, so a caller that
// asks again on its own shows up as a count, and one that would ask forever
// stops at the first ask nobody answers.
type Ask = { url: string; answer: (data: unknown) => void; fail: () => void }
const asks: Ask[] = []
const send = (url: string) =>
  new Promise((resolve, reject) => asks.push({ url, answer: (data) => resolve({ data: { data } }), fail: () => reject(new Error("down")) }))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { get: (url: string) => send(url), post: (url: string) => send(url) } }))

const { usePost } = await import("@/hooks/usePost")

afterEach(() => {
  cleanup()
  asks.length = 0
})

/** Answers every request out now, and lets what each answer sets render. */
async function answerAll(data: unknown = { v: "answered" }) {
  await act(async () => {
    for (const a of asks.splice(0)) a.answer(data)
  })
}

// V-791: usePost's object used to change identity whenever isSubmitting
// flipped, so anything keyed on the whole `post` ran again when its own
// request went out and again when it came back.
describe("usePost across a request's isSubmitting flip", () => {
  it("keeps one identity through true and back to false, and reads isSubmitting current at render", async () => {
    const { result } = renderHook(() => usePost())
    const first = result.current
    let out: Promise<unknown> = Promise.resolve()
    act(() => {
      out = result.current.makeRequest({ apiEndpoint: "/v791/guard", payload: {} })
    })
    expect(result.current.isSubmitting).toBe(true)
    expect(result.current).toBe(first)
    await answerAll()
    await act(async () => void (await out))
    expect(result.current.isSubmitting).toBe(false)
    expect(result.current).toBe(first)
    expect(result.current.makeRequest).toBe(first.makeRequest)
  })
})

/** A handler guarded the way myTaskList, projectTaskList, taskCommentComposer and the admin cards guard theirs, drawing isSubmitting. */
function Guarded() {
  const post = usePost()
  const go = () => {
    if (post.isSubmitting) return
    void post.makeRequest({ apiEndpoint: "/v791/guarded", payload: {} }).catch(() => {})
  }
  return (
    <button onClick={go} aria-busy={post.isSubmitting}>
      go
    </button>
  )
}

// isSubmitting is a getter over a ref that makeRequest sets, and the state
// beside it still redraws the caller: the guard holds within one frame, the
// caller shows the request while it is out, and a failed request lets go.
describe("a caller guarded on post.isSubmitting", () => {
  it("sends one request for two clicks in the same frame", async () => {
    render(<Guarded />)
    const button = screen.getByText("go")
    act(() => {
      button.click()
      button.click()
    })
    expect(asks).toHaveLength(1)
    await answerAll()
  })

  it("redraws busy while its request is out, and idle once it is answered", async () => {
    render(<Guarded />)
    act(() => screen.getByText("go").click())
    expect(screen.getByText("go").getAttribute("aria-busy")).toBe("true")
    await answerAll()
    expect(screen.getByText("go").getAttribute("aria-busy")).toBe("false")
  })

  it("lets go after a failed request: it redraws idle and the next click sends", async () => {
    render(<Guarded />)
    act(() => screen.getByText("go").click())
    await act(async () => {
      for (const a of asks.splice(0)) a.fail()
    })
    expect(screen.getByText("go").getAttribute("aria-busy")).toBe("false")
    act(() => screen.getByText("go").click())
    expect(asks).toHaveLength(1)
    await answerAll()
  })
})

describe("callers keyed on the whole post ask once for one ask", () => {
  it("an effect keyed on post", async () => {
    function Caller() {
      const post = usePost()
      useEffect(() => {
        void post.makeRequest({ apiEndpoint: "/v791/keyed", payload: {} })
      }, [post])
      return null
    }
    render(<Caller />)
    const firstOut = asks.length
    await answerAll()
    expect({ firstOut, total: firstOut + asks.length }).toEqual({ firstOut: 1, total: 1 })
  })

  it("an effect keyed on post and other deps", async () => {
    function Caller({ q }: { q: string }) {
      const post = usePost()
      useEffect(() => {
        void post.makeRequest({ apiEndpoint: "/v791/keyed-plus", payload: { q } })
      }, [post, q])
      return null
    }
    render(<Caller q="roadmap" />)
    const firstOut = asks.length
    await answerAll()
    expect({ firstOut, total: firstOut + asks.length }).toEqual({ firstOut: 1, total: 1 })
  })

  // GitHubIssueSearchDialog's shape: the effect is keyed on a callback, and the
  // callback on post, so each answer made a new callback that searched again.
  it("an effect keyed on a callback that is keyed on post", async () => {
    function Caller({ q }: { q: string }) {
      const post = usePost()
      const [found, setFound] = useState("")
      const search = useCallback(async () => {
        const r = await post.makeRequest<object, { v: string }>({ apiEndpoint: "/v791/hop", payload: { q } })
        setFound(r?.v ?? "")
      }, [post, q])
      useEffect(() => {
        void search()
      }, [search])
      return <p>{found}</p>
    }
    render(<Caller q="login bug" />)
    const firstOut = asks.length
    await answerAll()
    expect({ firstOut, total: firstOut + asks.length }).toEqual({ firstOut: 1, total: 1 })
    expect(screen.getByText("answered")).toBeTruthy()
  })

  // PlanWeek's shape (calendar, before 9853ab852): one ask per try, its answer
  // set as state, an answer to a dropped ask ignored. Each flip dropped the ask
  // out and asked again, so the drawer never showed an answer.
  it("an ask whose answer sets state (PlanWeek)", async () => {
    function Caller() {
      const post = usePost()
      const [tries] = useState(0)
      const [plan, setPlan] = useState<string | null>(null)
      useEffect(() => {
        let live = true
        post.makeRequest<object, { v: string }>({ apiEndpoint: "/v791/plan", payload: { tries } }).then((p) => {
          if (live) setPlan(p?.v ?? "none")
        })
        return () => void (live = false)
      }, [post, tries])
      return <p>{plan ?? "planning"}</p>
    }
    render(<Caller />)
    const firstOut = asks.length
    await answerAll()
    expect({ firstOut, total: firstOut + asks.length }).toEqual({ firstOut: 1, total: 1 })
    expect(screen.getByText("answered")).toBeTruthy()
  })

  // chatUserList's shape: a debounced search memoised on post, cancelled when
  // it is replaced. A flip replaced it, so a search typed while an earlier one
  // was out was cancelled and never sent.
  it("a debounced search memoised on post sends what was typed while a request was out", async () => {
    const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)))
    function Caller() {
      const post = usePost()
      const search = useMemo(() => {
        let timer: ReturnType<typeof setTimeout> | undefined
        const run = (text: string) => {
          clearTimeout(timer)
          timer = setTimeout(() => void post.makeRequest({ apiEndpoint: "/v791/search", payload: { text } }), 20)
        }
        run.cancel = () => clearTimeout(timer)
        return run
      }, [post])
      useEffect(() => search.cancel, [search])
      return <input aria-label="Search people" onChange={(e) => search(e.target.value)} />
    }
    render(<Caller />)
    const box = screen.getByLabelText("Search people")
    fireEvent.change(box, { target: { value: "an" } })
    await wait(60)
    const firstOut = asks.length
    fireEvent.change(box, { target: { value: "ana" } })
    await answerAll()
    await wait(60)
    expect({ firstOut, second: asks.length }).toEqual({ firstOut: 1, second: 1 })
  })
})

// The other side of one object for the hook's life: nothing memoised on the
// whole `post` sees isSubmitting flip. So over the tree, a whole usePost()
// result goes to a child or a context only where the prop takes makeRequest
// alone (tsc then proves the child never reads isSubmitting), and a useMemo on
// it that reads isSubmitting names post.isSubmitting in its deps.
describe("a whole usePost() result and its isSubmitting, over the tree", () => {
  // "<file> <attr>={<binding>}": the file that types the prop it lands in.
  const TAKES_MAKE_REQUEST_ONLY: Record<string, string> = {
    "components/calendar/calendarApp.tsx post={post}": "components/calendar/planWeek.tsx",
  }
  const callers = sourceFiles(["app", "components", "hooks", "lib", "services"], /\.tsx?$/).flatMap((file) => {
    const src = readFileSync(file, "utf8")
    const names = [...src.matchAll(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*usePost\(\)/g)].map((m) => m[1])
    return names.length ? [{ file, src, names: [...new Set(names)] }] : []
  })
  const word = (name: string) => `(?<![\\w$.])${name}(?![\\w$.?(])`

  it("finds the callers it guards", () => {
    expect(callers.length).toBeGreaterThan(50)
  })

  it("hands a child or a context the whole result only where the prop takes makeRequest alone", () => {
    const wrong: string[] = []
    for (const { file, src, names } of callers) {
      for (const name of names) {
        const handed = new RegExp(`([\\w$]+)=\\{\\s*(?:${name}|\\{[^{}]*${word(name)}[^{}]*\\})\\s*\\}`, "g")
        for (const m of src.matchAll(handed)) {
          const key = `${file} ${m[1]}={${name}}`
          const typedIn = TAKES_MAKE_REQUEST_ONLY[key]
          const takes = new RegExp(`${m[1]}\\??:\\s*Pick<ReturnType<typeof usePost>,\\s*"makeRequest">`)
          if (!typedIn || !takes.test(readFileSync(typedIn, "utf8"))) wrong.push(key)
        }
      }
    }
    expect(wrong).toEqual([])
  })

  it("names post.isSubmitting in the deps of a useMemo on the whole result that reads it", () => {
    const wrong: string[] = []
    for (const { file, src, names } of callers) {
      for (const at of src.matchAll(/useMemo\s*\(/g)) {
        let depth = 0
        let end = at.index! + at[0].length - 1
        for (; end < src.length; end++) {
          if (src[end] === "(") depth++
          else if (src[end] === ")" && --depth === 0) break
        }
        const call = src.slice(at.index!, end + 1)
        const deps = call.match(/,\s*\[([^\[\]]*)\]\s*,?\s*\)$/)?.[1] ?? ""
        for (const name of names) {
          const keyedOnWhole = new RegExp(word(name)).test(deps)
          const readsFlag = call.includes(`${name}.isSubmitting`) && !deps.includes(`${name}.isSubmitting`)
          if (keyedOnWhole && readsFlag) wrong.push(`${file}:${src.slice(0, at.index).split("\n").length} useMemo on ${name}`)
        }
      }
    }
    expect(wrong).toEqual([])
  })
})
