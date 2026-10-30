import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { areaOf, shellFiles } from "../scripts/endpoints/areas.mjs"

/**
 * services/endPoints.ts holds only what two or more feature areas use, or what
 * every page loads anyway (a file the layouts reach); each area's own
 * endpoints live in services/endpoints/<area>.ts, so a route loads only its
 * own area's (platform P-SPEED, 18 Oct 2026). Before the split the one file
 * was 40 KB on every route, and every package that added an endpoint to it
 * took bytes from routes it never touched: the call routes were left 44 B of
 * room. scripts/endpoints/areas.mjs says which area a file is.
 *
 * The rules, on every quick check:
 *   - endPoints.ts only shrinks (its bytes, below);
 *   - each of its members is used by two or more areas, or by the shell;
 *   - each area module's members are used by that area alone (a second area
 *     makes one shared), and by something.
 * A test reads whatever endpoints it likes: only the app's own files count.
 */

/** services/endPoints.ts's bytes after the split. Lower it when the file shrinks; it never rises. */
const ENDPOINTS_BYTES = 14_120

const SHARED = "services/endPoints.ts"
const AREA_DIR = "services/endpoints"
const ROOTS = ["app", "components", "hooks", "lib", "services", "store", "context", "types", "utils"]

function sources(dir: string, tests = false): string[] {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  return names.flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sources(path, tests)
    return /\.(t|j)sx?$/.test(name) && /\.test\.(t|j)sx?$/.test(name) === tests ? [path] : []
  })
}

/** A module's endpoint names, as "Enum.Member" and each exported const. */
function namesOf(file: string): { enums: string[]; keys: string[] } {
  const src = readFileSync(file, "utf8")
  const enums: string[] = []
  const keys: string[] = []
  for (const m of src.matchAll(/export enum (\w+)\s*\{([\s\S]*?)\n\}/g)) {
    enums.push(m[1])
    for (const member of m[2].matchAll(/^\s*(\w+)\s*=/gm)) keys.push(`${m[1]}.${member[1]}`)
  }
  for (const m of src.matchAll(/^export const (\w+)/gm)) keys.push(m[1])
  return { enums, keys }
}

const shared = namesOf(SHARED)
const areaModules = readdirSync(AREA_DIR)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => ({ area: f.replace(/\.ts$/, ""), file: `${AREA_DIR}/${f}`, ...namesOf(`${AREA_DIR}/${f}`) }))
const shell = await shellFiles(".")

/** Which areas' own files name each endpoint; and those a test names (a test keeps one alive, but places nothing). */
const usedBy = new Map<string, Set<string>>()
const testsName = new Set<string>()
{
  const enumNames = [...shared.enums, ...areaModules.flatMap((m) => m.enums)]
  const constNames = [...shared.keys, ...areaModules.flatMap((m) => m.keys)].filter((k) => !k.includes("."))
  const enumRe = new RegExp(String.raw`\b(${enumNames.join("|")})\.(\w+)`, "g")
  const constRe = constNames.length ? new RegExp(String.raw`\b(${constNames.join("|")})\b`, "g") : null
  const files = ROOTS.flatMap((r) => sources(r)).filter((f) => f !== SHARED && !f.startsWith(`${AREA_DIR}/`) && !f.startsWith("scripts/"))
  for (const file of files) {
    const src = readFileSync(file, "utf8")
    const area = areaOf(file, shell)
    const add = (key: string) => (usedBy.get(key) ?? usedBy.set(key, new Set()).get(key)!).add(area)
    for (const m of src.matchAll(enumRe)) add(`${m[1]}.${m[2]}`)
    if (constRe) for (const m of src.matchAll(constRe)) add(m[1])
  }
  for (const file of ROOTS.flatMap((r) => sources(r, true))) {
    const src = readFileSync(file, "utf8")
    for (const m of src.matchAll(enumRe)) testsName.add(`${m[1]}.${m[2]}`)
    if (constRe) for (const m of src.matchAll(constRe)) testsName.add(m[1])
  }
}

describe("the shared endpoints", () => {
  it("only shrink", () => {
    const bytes = statSync(SHARED).size
    expect(bytes, `${SHARED} is ${bytes} bytes (it may only shrink, from ${ENDPOINTS_BYTES}): put an area's own endpoint in ${AREA_DIR}/<area>.ts`).toBeLessThanOrEqual(ENDPOINTS_BYTES)
  })

  it("are each used by two areas or more, or by what every page loads", () => {
    const lonely = shared.keys.flatMap((key) => {
      const areas = usedBy.get(key) ?? new Set()
      if (areas.has("shell") || areas.size >= 2) return []
      if (areas.size === 0) return testsName.has(key) ? [] : [`${key} is used by nothing: delete it`]
      return [`${key} is used only by ${[...areas][0]}: move it to ${AREA_DIR}/${[...areas][0]}.ts`]
    })
    expect(lonely).toEqual([])
  })
})

describe("each area's endpoints", () => {
  it("are used by that area alone, and by something", () => {
    const wrong = areaModules.flatMap(({ area, file, keys }) =>
      keys.flatMap((key) => {
        const areas = usedBy.get(key) ?? new Set()
        if (areas.size === 0) return testsName.has(key) ? [] : [`${file}: ${key} is used by nothing: delete it`]
        const others = [...areas].filter((a) => a !== area)
        return others.length ? [`${file}: ${key} is used by ${others.join(", ")} too: move it to ${SHARED}`] : []
      }),
    )
    expect(wrong).toEqual([])
  })
})
