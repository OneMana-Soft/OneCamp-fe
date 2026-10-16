import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Every chunk the work area loads on demand waits in a Suspense boundary of
 * its own.
 *
 * next/dynamic only wraps its component in Suspense when it is given a
 * `loading` component or `ssr: false`. Without either, a dialog's chunk
 * suspended up to the nearest boundary there was, the route's loading.tsx:
 * the whole project page flashed to its skeleton, and React, showing the page
 * again, re-ran its layout effects, which cleared the task list's store slot
 * with nothing to refill it. On 11 Oct, opening a project's Forms, Time,
 * Share, Save as a template, a cycle's burndown, Statuses or Fields left the
 * list behind it a skeleton until a reload.
 */
const ROOTS = [
  "components/task",
  "components/project",
  "components/myTask",
  "components/goals",
  "components/reports",
  "components/projectUpdates",
  "components/projectTemplates",
  "app/app/project",
  "app/app/myTask",
  "app/app/task",
  "app/app/goals",
  "app/invoice",
  "components/views/ProjectView.tsx",
]

function files(path: string): string[] {
  if (statSync(path).isFile()) return [path]
  return readdirSync(path).flatMap((name) => files(join(path, name)))
}

/** Each `dynamic(...)` call's full text, its parentheses balanced. */
function dynamicCalls(src: string): string[] {
  const calls: string[] = []
  let at = src.indexOf("dynamic(")
  while (at !== -1) {
    let depth = 0
    let end = at + "dynamic".length
    for (; end < src.length; end++) {
      if (src[end] === "(") depth++
      else if (src[end] === ")" && --depth === 0) break
    }
    calls.push(src.slice(at, end + 1))
    at = src.indexOf("dynamic(", end)
  }
  return calls
}

const sources = ROOTS.flatMap(files).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))

describe("the work area's lazy chunks", () => {
  it("finds the files and the calls it checks", () => {
    expect(sources.length).toBeGreaterThan(50)
    expect(sources.flatMap((f) => dynamicCalls(readFileSync(f, "utf8"))).length).toBeGreaterThan(5)
  })

  for (const file of sources) {
    const calls = dynamicCalls(readFileSync(file, "utf8"))
    if (!calls.length) continue
    it(`${file} gives every next/dynamic chunk its own Suspense boundary`, () => {
      for (const call of calls) expect(call, call).toMatch(/loading\s*:|ssr\s*:\s*false/)
    })
  }

  it("clears the shared task lists once per project, never on a layout effect's re-run", () => {
    for (const file of ["components/project/projectTaskTable.tsx", "components/myTask/myTaskTable.tsx", "components/project/projectTaskList.tsx", "components/myTask/myTaskList.tsx"]) {
      const src = readFileSync(file, "utf8")
      expect(src, file).toMatch(/useLayoutOnce\(/)
      expect(src, file).not.toMatch(/useLayoutEffect\(\(\) => \{[^}]*clear(TaskListVisibleInfo|MyTask|ProjectTask)\(/)
    }
  })
})
