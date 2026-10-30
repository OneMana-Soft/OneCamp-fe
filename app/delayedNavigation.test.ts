import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync, statSync } from "fs"
import { join } from "path"

// A navigation made after a pause cancels the one the person started in the
// meantime: Next keeps only the latest (26 Oct 2026, My tasks lost a click on
// the sidebar to its list's 300 ms router.replace). A write to the address
// after a change goes through lib/navigation/addressLater, whose header has
// the rules. This refuses router.replace or router.push, history's
// replaceState or pushState, and inAddress inside a setTimeout,
// requestAnimationFrame, requestIdleCallback, debounce or throttle callback,
// or in an effect that runs on a debounced value, anywhere else. A move a
// page makes by itself a while later (GitHub's callback taking an admin on)
// goes through lib/navigation/moveLater: the person's own first press, key or
// Back ends it, as a push would cancel their move still on its way.
//
// addressLater's rules (it keeps a short header: its bytes count on every
// route that uses it):
// - write through history.replaceState (tabInAddress's inAddress), which Next
//   follows at once without asking the server: merge the keys, skip unchanged;
// - a press, Enter or Space, a chord (Back, the palette) or leaving the page
//   writes it at once, before the move it may start, so a later click always
//   wins and Back finds the change; typing, or a plain key that steps a
//   calendar's period (J), waits, so stepping through is one write;
// - a move the app makes itself (useAppRouter's push or replace: the go keys,
//   a command) writes it first (appRouter's waiting): a key that starts a move is
//   plain, so the write still waited, and landing after the move it
//   cancelled it;
// - Back or Forward, or another page, drops it.

// Each one left, with why it may stay or who is taking it out. One fixed
// fails here too, until it leaves this list.
const KNOWN: Record<string, string> = {
  "app/signup/page.tsx": "the welcome screen's own way on, after its pause: cleared on unmount, and the screen has no other link",
}

const ROOTS = ["app", "components", "hooks", "lib"]

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) sources(path, out)
    else if (/\.tsx?$/.test(name) && !/\.(test|spec)\./.test(name)) out.push(path)
  }
  return out
}

/** The source with its comments blanked and its strings kept, so code in a comment never counts. */
function code(s: string): string {
  let out = ""
  for (let k = 0; k < s.length; k++) {
    const c = s[k]
    if (c === "/" && (s[k + 1] === "/" || s[k + 1] === "*")) {
      const line = s[k + 1] === "/"
      const e = line ? s.indexOf("\n", k) : s.indexOf("*/", k + 2)
      const end = e < 0 ? s.length : line ? e : e + 2
      out += s.slice(k, end).replace(/[^\n]/g, " ")
      k = end - 1
    } else if (c === '"' || c === "'" || c === "`") {
      let j = k + 1
      while (j < s.length && s[j] !== c) j += s[j] === "\\" ? 2 : 1
      out += s.slice(k, j + 1)
      k = j
    } else out += c
  }
  return out
}

/** The call whose "(" is at i, up to its matching ")" (strings skipped). */
function callAt(s: string, i: number): string {
  let depth = 0
  for (let k = i; k < s.length; k++) {
    const c = s[k]
    if (c === '"' || c === "'" || c === "`") {
      k++
      while (k < s.length && s[k] !== c) k += s[k] === "\\" ? 2 : 1
    } else if (c === "(") depth++
    else if (c === ")" && --depth === 0) return s.slice(i, k + 1)
  }
  return s.slice(i)
}

/** The body of `const name = (…) => …` or `function name(…) {…}` in s, if it is there. */
function bodyOf(s: string, name: string): string {
  const at = s.search(new RegExp(`(?:const|let)\\s+${name}\\s*=|function\\s+${name}\\s*\\(`))
  if (at < 0) return ""
  const open = s.indexOf("{", at)
  const line = s.indexOf("\n", at)
  if (open < 0 || (line >= 0 && line < open && !/=>\s*$|\)\s*$/.test(s.slice(at, line)))) return s.slice(at, line < 0 ? undefined : line)
  let depth = 0
  for (let k = open; k < s.length; k++) {
    const c = s[k]
    if (c === '"' || c === "'" || c === "`") {
      k++
      while (k < s.length && s[k] !== c) k += s[k] === "\\" ? 2 : 1
    } else if (c === "{") depth++
    else if (c === "}" && --depth === 0) return s.slice(at, k + 1)
  }
  return s.slice(at)
}

const WRITE = /\brouter\.(?:replace|push)\s*\(|\bhistory\.(?:replace|push)State\s*\(|\b(?:tab)?[iI]nAddress\s*\(/
const TIMER = /\b(?:setTimeout|requestAnimationFrame|requestIdleCallback|debounce|throttle)\s*\(/g

/** Why a file navigates after a pause, if it does. */
function lateWrites(s: string): string[] {
  if (!WRITE.test(s)) return []
  const found: string[] = []
  for (const m of s.matchAll(TIMER)) {
    const call = callAt(s, m.index! + m[0].length - 1)
    // A callback passed by name: its own body.
    const named = call.match(/^\(\s*(\w+)\s*[,)]/)?.[1]
    const body = named ? bodyOf(s, named) : ""
    if (WRITE.test(call) || WRITE.test(body)) found.push(m[0].replace(/\s*\($/, ""))
  }
  const debounced = [...s.matchAll(/const\s+(\w+)\s*=\s*useDebounce\s*\(/g)].map((m) => m[1])
  for (const m of s.matchAll(/\buseEffect\s*\(/g)) {
    const call = callAt(s, m.index! + m[0].length - 1)
    const deps = call.match(/\[([^\]]*)\]\s*\)$/)?.[1] ?? ""
    if (WRITE.test(call) && (debounced.some((n) => new RegExp(`\\b${n}\\b`).test(deps)) || /\bdebounced\w*/i.test(deps))) found.push("an effect on a debounced value")
  }
  return found
}

describe("navigation after a pause", () => {
  it("goes through lib/navigation/addressLater, except the few named here", () => {
    const found: Record<string, string[]> = {}
    for (const root of ROOTS)
      for (const file of sources(root)) {
        const late = lateWrites(code(readFileSync(file, "utf8")))
        if (late.length) found[file] = late
      }
    expect(Object.keys(found).sort(), `router writes after a pause: ${JSON.stringify(found)}`).toEqual(Object.keys(KNOWN).sort())
  })

  it("sees a router write in a timer, a frame, a debounce and an effect on a debounced value, never one in a comment", () => {
    expect(lateWrites("setTimeout(() => router.push('/x'), 300)")).toEqual(["setTimeout"])
    expect(lateWrites("requestAnimationFrame(() => { if (a) router.replace(`/y?${q}`) })")).toEqual(["requestAnimationFrame"])
    expect(lateWrites("const go = debounce((v) => router.replace(v), 200)")).toEqual(["debounce"])
    expect(lateWrites("const q = useDebounce(text, 150)\nuseEffect(() => { router.replace('/s?q=' + q) }, [q, router])")).toEqual(["an effect on a debounced value"])
    expect(lateWrites(code("// setTimeout(() => router.push('/x'), 300)\nrouter.push('/now')"))).toEqual([])
    expect(lateWrites("setTimeout(() => setOpen(false), 300)\nconst go = () => router.push('/x')")).toEqual([])
    expect(lateWrites("const write = () => {\n  inAddress({ date: d })\n}\nconst t = setTimeout(write, 1000)")).toEqual(["setTimeout"])
    expect(lateWrites("setTimeout(() => history.replaceState(null, '', u), 50)")).toEqual(["setTimeout"])
  })
})
