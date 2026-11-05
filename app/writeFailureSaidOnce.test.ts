import { readFileSync } from "node:fs"
import { dirname, join, normalize } from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"
import { sourceFiles } from "@/lib/testing/sourceFiles"

/*
 * A failed write is said once (V-397). The request interceptor hands every
 * failed write to lib/http/writeFailure, whose toast waits one task: a row
 * that says the failure on screen claims it in that time, and the toast stays
 * quiet. useSaveStatus claims for every settings row. Any other caller that
 * says the failure claims it too: in place in its own words (a dialog's line,
 * a card's problem, a test's result), or in an error toast of its own
 * ("Couldn't remove Deploys" says more than the shared "Already changed").
 * Each of those catches claims the failure, with saidHere(e, fallback) for
 * the server's words (lib/http/saidHere) or saysWriteFailure(e) beside words
 * of its own, before it awaits anything: the toast's task may run at the
 * first await. The claim lives in the card that says it, so the shared core
 * (hooks/use-toast, the interceptor) carries nothing for it.
 *
 * Unclaimed, the failure was said twice: in the dialog, and by a toast over
 * the dialog's next step (at 390 it lay over the row's actions), or in two
 * stacked toasts. The 3 Nov sweep found 13 such cards by script
 * (logs/platform-104/double-report-sweep); this guard is the real list. It
 * reads every catch in app/, components/, hooks/ and lib/ by its syntax tree,
 * a try's or a promise's .catch(fn): code that makes a write without
 * OWN_ERRORS (an axios post, put, patch or delete, itself or two calls down,
 * through this file's functions or what it imports), and a catch that says
 * the failure: a setter given apiErrorMessage(e) or reasonOf(e), a setter of
 * an error, a problem or a failure, an error toast (destructive, or the error
 * tone), or a toast in the error's words.
 *
 * Not read: a write behind a function passed in (run(fn)), and a .catch
 * given a named function.
 */

type Read = (path: string) => string | undefined
type Found = { offenders: string[]; claimed: string[] }

const QUIET = /\bOWN_ERRORS\b|\bsuppressErrorToast\b/
const CLIENTS = new Set(["axiosInstance", "http", "axios"])
const WRITES = new Set(["post", "put", "patch", "delete"])
const WORDS = new Set(["apiErrorMessage", "reasonOf", "saidHere"])
const CLAIMS = new Set(["saidHere", "saysWriteFailure"])
const ERROR_SETTER = /^set\w*(?:Error|Problem|Fail)/
const ERROR_TOAST = /\bvariant:\s*"destructive"|\btone:\s*"error"/
const DEPTH = 3

const descendants = (node: ts.Node, out: ts.Node[] = []): ts.Node[] => {
  node.forEachChild((child) => {
    out.push(child)
    descendants(child, out)
  })
  return out
}
const calls = (node: ts.Node) => descendants(node).filter(ts.isCallExpression)
const calleeName = (call: ts.CallExpression) => (ts.isIdentifier(call.expression) ? call.expression.text : undefined)
const namesError = (call: ts.CallExpression, v: string) => {
  const first = call.arguments[0]
  return !!first && ts.isIdentifier(first) && first.text === v
}

function scanWriteSayers(files: string[], read: Read): Found {
  const parsed = new Map<string, ts.SourceFile | null>()
  const source = (path: string) => {
    if (!parsed.has(path)) {
      const text = read(path)
      parsed.set(path, text === undefined ? null : ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS))
    }
    return parsed.get(path) ?? null
  }
  const resolve = (spec: string, from: string) => {
    const base = spec.startsWith("@/") ? spec.slice(2) : spec.startsWith(".") ? normalize(join(dirname(from), spec)) : null
    if (base === null) return null
    return [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find((c) => read(c) !== undefined) ?? null
  }
  // The functions a file declares, at any depth: name -> body. useCallback's function counts as the const's.
  const declared = new Map<string, Map<string, ts.Node>>()
  const functionsOf = (path: string) => {
    if (!declared.has(path)) {
      const found = new Map<string, ts.Node>()
      const sf = source(path)
      for (const n of sf ? descendants(sf) : []) {
        if (ts.isFunctionDeclaration(n) && n.name && n.body && !found.has(n.name.text)) found.set(n.name.text, n.body)
        if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && !found.has(n.name.text)) {
          let init: ts.Expression = n.initializer
          if (ts.isCallExpression(init) && calleeName(init) === "useCallback" && init.arguments[0]) init = init.arguments[0]
          if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) found.set(n.name.text, init.body)
        }
      }
      declared.set(path, found)
    }
    return declared.get(path)!
  }
  // What a file imports by name: local name -> [module path, its name there].
  const importsOf = (path: string) => {
    const out = new Map<string, [string, string]>()
    const sf = source(path)
    for (const st of sf?.statements ?? []) {
      if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue
      const bindings = st.importClause?.namedBindings
      if (!bindings || !ts.isNamedImports(bindings) || st.importClause?.isTypeOnly) continue
      const target = resolve(st.moduleSpecifier.text, path)
      if (target) for (const el of bindings.elements) out.set(el.name.text, [target, (el.propertyName ?? el.name).text])
    }
    return out
  }
  // The configs a file makes with the flag (usePost's `config`), by name.
  const quietConfigs = new Map<string, Set<string>>()
  const quietConfigsOf = (path: string) => {
    if (!quietConfigs.has(path)) {
      const sf = source(path)
      const names = (sf ? descendants(sf) : []).filter(ts.isVariableDeclaration).filter((n) => ts.isIdentifier(n.name) && !!n.initializer && QUIET.test(n.initializer.getText()))
      quietConfigs.set(path, new Set(names.map((n) => (n.name as ts.Identifier).text)))
    }
    return quietConfigs.get(path)!
  }
  // A call whose request says its own failure: an argument with the flag, or a config the file made with it.
  const quiet = (call: ts.CallExpression, path: string) =>
    call.arguments.some((a) => QUIET.test(a.getText()) || (ts.isIdentifier(a) && quietConfigsOf(path).has(a.text)))
  const where = (path: string, node: ts.Node) => `${path}:${node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1}`
  // The first write without OWN_ERRORS that running `node` makes, itself or DEPTH calls down: "path:line".
  const loud = (path: string, node: ts.Node, depth: number, seen: Set<string>): string | null => {
    for (const call of calls(node)) {
      const callee = call.expression
      if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && CLIENTS.has(callee.expression.text) && WRITES.has(callee.name.text)) {
        if (!quiet(call, path)) return where(path, call)
        continue
      }
      const name = calleeName(call)
      if (!name || depth >= DEPTH || quiet(call, path)) continue
      const local = functionsOf(path).get(name)
      const imported = local ? undefined : importsOf(path).get(name)
      const [file, fn, body] = local ? [path, name, local] : imported ? [imported[0], imported[1], functionsOf(imported[0]).get(imported[1])] : []
      if (!file || !fn || !body || seen.has(`${file}#${fn}`)) continue
      seen.add(`${file}#${fn}`)
      const found = loud(file, body, depth + 1, seen)
      if (found) return found
    }
    return null
  }

  const offenders: string[] = []
  const claimed: string[] = []
  for (const path of files) {
    const text = read(path)
    if (!text || !/\bcatch\b/.test(text)) continue
    const sf = source(path)
    // A try's catch, or a promise's .catch(fn): the code that may write, and the block that says it.
    const sayers: Array<{ tryBlock: ts.Node; v: string; block: ts.Node }> = []
    for (const n of sf ? descendants(sf) : []) {
      if (ts.isTryStatement(n) && n.catchClause) {
        const decl = n.catchClause.variableDeclaration
        sayers.push({ tryBlock: n.tryBlock, v: decl && ts.isIdentifier(decl.name) ? decl.name.text : "", block: n.catchClause.block })
      } else if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "catch") {
        const fn = n.arguments[0]
        if (!fn || !(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) continue
        const param = fn.parameters[0]
        // The promise's own call is a descendant of `X.catch`, not of X.
        sayers.push({ tryBlock: n.expression, v: param && ts.isIdentifier(param.name) ? param.name.text : "", block: fn.body })
      }
    }
    for (const t of sayers) {
      const { v, block } = t
      const said = (c: ts.CallExpression) => calls(c).some((inner) => WORDS.has(calleeName(inner) ?? "") && namesError(inner, v))
      // An arrow's expression body may be the saying call itself.
      const own = ts.isCallExpression(block) ? [block, ...calls(block)] : calls(block)
      const says = own.find((c) => {
        const name = calleeName(c)
        if (name === "toast") return c.arguments.some((a) => ERROR_TOAST.test(a.getText())) || said(c)
        if (!name || !/^set[A-Z]/.test(name)) return false
        return ERROR_SETTER.test(name) || said(c)
      })
      if (!says) continue
      const write = loud(path, t.tryBlock, 0, new Set())
      if (!write) continue
      const claim = v ? own.find((c) => CLAIMS.has(calleeName(c) ?? "") && namesError(c, v)) : undefined
      const firstAwait = descendants(block).find(ts.isAwaitExpression)
      if (claim && (!firstAwait || claim.getStart() < firstAwait.getStart())) {
        claimed.push(where(path, says))
        continue
      }
      offenders.push(
        `${where(path, says)} says a failed write in place (${write}) and doesn't claim it: ` +
          (v ? `use saidHere(${v}, …) for its words, or saysWriteFailure(${v}) beside your own, before any await` : "give the catch its error, then claim it"),
      )
    }
  }
  return { offenders, claimed }
}

describe("a failed write said by its caller claims it, so no toast says it again", () => {
  it("reads a catch's state and toasts, a promise's .catch, its try's writes two calls down, the flag, and the order of the claim", () => {
    const files: Record<string, string> = {
      "services/notes.ts": `import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
        export async function saveNote(x: unknown) { await axiosInstance.post("/notes", x) }
        export const saveQuietly = async (x: unknown) => { await axiosInstance.put("/notes", x, OWN_ERRORS) }
        export async function saveTwice(x: unknown) { await saveNote(x) }`,
      "components/unclaimed.tsx": `import { saveNote as save } from "@/services/notes"
        async function go(setError: (s: string) => void) { try { await save(1) } catch (e) { setError(apiErrorMessage(e, "No")) } }`,
      "components/claimed.tsx": `import { saveTwice } from "../services/notes"
        async function go(setResult: (s: unknown) => void) { try { await saveTwice(1) } catch (e) { setResult({ ok: false, why: saidHere(e, "No") }) } }`,
      "components/ownWords.tsx": `import { saveNote } from "@/services/notes"
        async function go(setProblem: (s: string) => void) { try { await saveNote(1) } catch (err) { saysWriteFailure(err); setProblem("No") } }`,
      "components/quietWrite.tsx": `import { saveQuietly } from "@/services/notes"
        async function go(setError: (s: string) => void) { try { await saveQuietly(1) } catch (e) { setError(apiErrorMessage(e)) } }`,
      "components/flagPassed.tsx": `const QUIET = { suppressErrorToast: true }
        async function go(setError: (s: string) => void) { try { await axiosInstance.delete("/x", QUIET) } catch (e) { setError(apiErrorMessage(e)) } }`,
      "components/lateClaim.tsx": `import { saveNote } from "@/services/notes"
        async function go(setError: (s: string) => void, again: () => Promise<void>) { try { await saveNote(1) } catch (e) { await again(); setError(saidHere(e)) } }`,
      "components/toastOnly.tsx": `import { saveNote } from "@/services/notes"
        async function go() { try { await saveNote(1) } catch (e) { toast({ title: "No", description: apiErrorMessage(e) }) } }`,
      "components/ownToast.tsx": `import { saveNote } from "@/services/notes"
        async function go() { try { await saveNote(1) } catch { toast({ title: "Couldn't save the note", variant: "destructive" }) } }`,
      "components/ownToastClaimed.tsx": `import { saveNote } from "@/services/notes"
        async function go() { try { await saveNote(1) } catch (e) { toast({ title: "Couldn't save", description: saidHere(e, "Try again."), tone: "error" }) } }`,
      "components/promiseCatch.tsx": `const go = () => axiosInstance.post("/p", {}).catch((err) => toast({ title: "Couldn't post", variant: "destructive" }))
        const fine = () => axiosInstance.put("/q", {}).catch((err) => { saysWriteFailure(err); toast({ title: "Couldn't put", tone: "error" }) })`,
      "components/notAFailure.tsx": `import { saveNote } from "@/services/notes"
        async function go() { try { await saveNote(1) } catch { toast({ title: "Kept your draft on this device" }) } }`,
      "components/noBinding.tsx": `const send = useCallback(async () => { await axiosInstance.patch("/y", {}) }, [])
        async function go(setSendError: (s: string) => void) { try { await send() } catch { setSendError("Not sent") } }`,
      "components/aRead.tsx": `async function go(setError: (s: string) => void) { try { await axiosInstance.get("/z") } catch (e) { setError(apiErrorMessage(e)) } }`,
    }
    const { offenders, claimed } = scanWriteSayers(Object.keys(files), (p) => files[p])
    expect(offenders.map((o) => o.split(" ")[0])).toEqual([
      "components/unclaimed.tsx:2",
      "components/lateClaim.tsx:2",
      "components/toastOnly.tsx:2",
      "components/ownToast.tsx:2",
      "components/promiseCatch.tsx:1",
      "components/noBinding.tsx:2",
    ])
    expect(offenders[0]).toContain("(services/notes.ts:2)")
    expect(offenders[3]).toContain("give the catch its error")
    expect(offenders[4]).toContain("(components/promiseCatch.tsx:1)")
    expect(claimed).toEqual(["components/claimed.tsx:2", "components/ownWords.tsx:2", "components/ownToastClaimed.tsx:2", "components/promiseCatch.tsx:2"])
  })

  it("holds across the app: every catch that says a failed write claims it", () => {
    const read: Read = (p) => {
      try {
        return readFileSync(p, "utf8")
      } catch {
        return undefined
      }
    }
    const { offenders, claimed } = scanWriteSayers(sourceFiles(["app", "components", "hooks", "lib"], /\.tsx?$/), read)
    expect(offenders).toEqual([])
    // The scan reaches them: 133 on 3 Nov (31 in place: docs' share, move and lock, the AI providers' tests, Slack's
    // bridge, ...; 102 in a toast of their own: the admin and AI cards, docs' cover and trash, uploads, ...).
    expect(claimed.length).toBeGreaterThanOrEqual(133)
  })
})
