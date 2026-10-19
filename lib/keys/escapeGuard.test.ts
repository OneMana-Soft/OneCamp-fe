import { readdirSync, readFileSync, existsSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"

// Everything that answers Escape on the page answers it through onEscape
// (lib/keys/onEscape), and the one Escape (lib/keys/escape) hears the press:
// one press, one thing, the innermost first, marked used. A keydown listener
// of its own on the window or the document acted beside the others,
// unmarked: with a toast showing, Esc closed what it was for and the toast as
// well (17 Oct, 21 of them). This holds that no component goes back to one: a
// keydown or keyup listener added to the window or the document may not read
// Escape, itself or through a key map it calls. The baseline is none.
//
// The one Escape is started once, by the root providers, and no page brings
// it: a page brings only what it registers with (lib/keys/onEscape, half a
// kilobyte), not the listener and its layer test, as each of fifty routes did
// when the tooltip brought them (17 Oct, 6 KB a route).

const ROOT = join(__dirname, "..", "..")
const DIRS = ["app", "components", "hooks", "lib", "services", "store", "context"]
const HOME = "lib/keys/escape.ts"

/** Every source file, without tests. */
function sources(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sources(path))
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name) && !/\.(test|spec)\.[jt]sx?$/.test(entry.name)) out.push(path)
  }
  return out
}

const parsed = new Map<string, ts.SourceFile>()
function parse(file: string, text?: string): ts.SourceFile {
  const key = text === undefined ? file : `${file}\0${text}`
  let sf = parsed.get(key)
  if (!sf) {
    sf = ts.createSourceFile(file, text ?? readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    parsed.set(key, sf)
  }
  return sf
}

/** Whether a node, or anything in it, is the string "Escape". */
function readsEscape(node: ts.Node): boolean {
  let found = false
  const visit = (n: ts.Node) => {
    if (found) return
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && n.text === "Escape") found = true
    else ts.forEachChild(n, visit)
  }
  visit(node)
  return found
}

/** What a name is declared as in a file: a function, or a variable's value. */
function declared(name: string, sf: ts.SourceFile): ts.Node | null {
  let found: ts.Node | null = null
  const visit = (n: ts.Node) => {
    if (found) return
    if (ts.isFunctionDeclaration(n) && n.name?.text === name) found = n
    else if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name && n.initializer) found = n.initializer
    else ts.forEachChild(n, visit)
  }
  visit(sf)
  return found
}

/** The function a listener argument names: written in place, or declared by that name in the file. */
function listenerBody(arg: ts.Expression, sf: ts.SourceFile): ts.Node | null {
  if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) return arg
  return ts.isIdentifier(arg) ? declared(arg.text, sf) : null
}

/** The files a source imports from, by the name each import binds. */
function importsOf(file: string, sf: ts.SourceFile, resolveFile: (from: string, spec: string) => string | null): Map<string, string> {
  const out = new Map<string, string>()
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier) || !st.importClause) continue
    const target = resolveFile(file, st.moduleSpecifier.text)
    if (!target) continue
    const { name, namedBindings } = st.importClause
    if (name) out.set(name.text, target)
    if (namedBindings && ts.isNamedImports(namedBindings)) for (const el of namedBindings.elements) out.set(el.name.text, target)
  }
  return out
}

/** A module specifier of this repository's (`@/…` or relative) as a file, or null for a package's. */
function resolveInRepo(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? join(ROOT, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null
  if (!base) return null
  const tries = /\.[mc]?[jt]sx?$/.test(base) ? [base] : [".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx"].map((ext) => base + ext)
  return tries.find((f) => existsSync(f)) ?? null
}

const TARGET = /^(window|document|globalThis|self|doc|(?:.+\.)?ownerDocument|(?:.+\.)?defaultView|document\.documentElement|document\.body)$/

/**
 * The keydown and keyup listeners on the window or the document in a file
 * that read Escape, themselves or through a function imported from a file
 * that does: "file:line".
 */
function escapeListeners(
  file: string,
  text?: string,
  deps: { resolve: (from: string, spec: string) => string | null; read: (path: string) => ts.SourceFile } = { resolve: resolveInRepo, read: (p) => parse(p) },
): string[] {
  const sf = parse(file, text)
  const imported = importsOf(file, sf, deps.resolve)
  const out: string[] = []
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "addEventListener" && n.arguments.length >= 2) {
      const target = n.expression.expression.getText(sf).replace(/\?/g, "")
      const type = n.arguments[0]
      const keyish = !ts.isStringLiteral(type) || type.text === "keydown" || type.text === "keyup"
      if (TARGET.test(target) && keyish) {
        const body = listenerBody(n.arguments[1], sf)
        let reads = !!body && readsEscape(body)
        if (!reads && body) {
          const calls: string[] = []
          const collect = (c: ts.Node) => {
            if (ts.isCallExpression(c) && ts.isIdentifier(c.expression)) calls.push(c.expression.text)
            ts.forEachChild(c, collect)
          }
          collect(body)
          // A key map in a module of its own: the function the listener
          // calls, as that module declares it.
          reads = calls.some((name) => {
            const from = imported.get(name)
            if (!from || relative(ROOT, from) === HOME) return false
            const fn = declared(name, deps.read(from))
            return !!fn && readsEscape(fn)
          })
        }
        if (reads) out.push(`${relative(ROOT, file)}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`)
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return out
}

describe("Escape on the page", () => {
  it("is answered through lib/keys/escape, never by a keydown listener of a component's own", () => {
    const found = DIRS.flatMap((d) => sources(join(ROOT, d)))
      .filter((f) => relative(ROOT, f) !== HOME)
      .flatMap((f) => {
        // Only a file that adds a key listener, or one by a name it doesn't
        // spell out, needs reading closely.
        const text = readFileSync(f, "utf8")
        if (!text.includes("addEventListener") || !/key(down|up)|addEventListener\(\s*[\w$]/.test(text)) return []
        return escapeListeners(f, text)
      })
    expect(found, "a window or document keydown listener reads Escape: use onEscape (lib/keys/onEscape)").toEqual([])
    // It reads some two thousand files and parses about sixty: under a
    // second here, and nothing in it waits on the clock, so a busy machine
    // gets room.
  }, 30_000)
})

describe("the one Escape", () => {
  // The files that import a module for what it does, not for its types only.
  const importersOf = (target: string) =>
    DIRS.flatMap((d) => sources(join(ROOT, d))).filter((f) => {
      const text = readFileSync(f, "utf8")
      if (!text.includes("lib/keys/escape") && !text.includes("./escape")) return false
      const sf = parse(f, text)
      return sf.statements.some(
        (st) =>
          ts.isImportDeclaration(st) &&
          ts.isStringLiteral(st.moduleSpecifier) &&
          !st.importClause?.isTypeOnly &&
          resolveInRepo(f, st.moduleSpecifier.text) === join(ROOT, target),
      )
    })

  it("is started by the root providers, for every page", () => {
    const providers = join(ROOT, "components", "providers", "ClientProviders.tsx")
    expect(importersOf(HOME).map((f) => relative(ROOT, f))).toEqual(["components/providers/ClientProviders.tsx"])
    expect(readFileSync(providers, "utf8")).toMatch(/useEffect\(\(\) => listenForEscape\(\), \[\]\)/)
  })
})

describe("the rule's reading", () => {
  const at = join(ROOT, "components", "zz-sample.tsx")
  const check = (code: string) => escapeListeners(at, code)

  it("finds a listener that reads Escape itself, written in place or by name", () => {
    expect(check(`useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close() }; window.addEventListener("keydown", onKey); }, [])`)).toHaveLength(1)
    expect(check(`document.addEventListener("keydown", (e) => { if (e.key !== 'Escape') return; close() })`)).toHaveLength(1)
    expect(check(`function onKey(e: KeyboardEvent) { switch (e.key) { case "Escape": back() } }\nwindow.addEventListener("keyup", onKey, true)`)).toHaveLength(1)
    expect(check(`const key = useCallback((e: KeyboardEvent) => { if (e.key === "Escape") stop() }, []); el.ownerDocument.addEventListener("keydown", key)`)).toHaveLength(1)
  })

  it("finds one that reads it through a key map", () => {
    // The inbox's keys and a list's keys mapped Escape ("back", "clear") in
    // a module of their own (inboxParts, lib/listKeys).
    const keys = parse(join(ROOT, "components", "zz-keys.ts"), `export function keyAction(e: KeyboardEvent) { switch (e.key) { case "Escape": return "back" } return null }`)
    const plain = parse(join(ROOT, "components", "zz-plain.ts"), `export function keyAction(e: KeyboardEvent) { return e.key === "j" ? "next" : null }`)
    const code = (from: string) => `import { keyAction } from "${from}"\nwindow.addEventListener("keydown", (e) => { if (keyAction(e) === "back") close() })`
    const deps = (map: ts.SourceFile) => ({ resolve: () => map.fileName, read: () => map })
    expect(escapeListeners(at, code("./zz-keys"), deps(keys))).toHaveLength(1)
    expect(escapeListeners(at, code("./zz-plain"), deps(plain))).toEqual([])
  })

  it("leaves alone a listener for other keys, one on an element, and Escape answered the shared way", () => {
    expect(check(`window.addEventListener("keydown", (e) => { if (e.key === "/") focusSearch() })`)).toEqual([])
    expect(check(`input.addEventListener("keydown", (e) => { if (e.key === "Escape") cancel() })`)).toEqual([])
    expect(check(`useEffect(() => (open ? onEscape("overlay", () => setOpen(false)) : undefined), [open])`)).toEqual([])
    expect(check(`window.addEventListener("pointerdown", (e) => { if (e.button === 0) close() })`)).toEqual([])
  })
})

// ─── What answers Escape itself ─────────────────────────────────────────
//
// A Radix layer (a dialog, a sheet, a popover, a menu, the shared drawer)
// hears Escape first, in the document, and closes. The one Escape hears it
// before that, in the window, and leaves a press from what answers Escape
// itself (data-escape-own) to it, used, in every layer at once: the layer
// stays for the next press (lib/keys/escape). No layer needs a line of its
// own for it, so what is held here is the mark, on every key handler that
// reads Escape ("Escape at what answers it", below).

/** The contents of Radix's layers, whose own key handlers aren't owners in them. */
const RADIX_LAYERS = new Set([
  "DialogContent", "DialogPrimitive.Content", "SheetContent", "SheetPrimitive.Content",
  "AlertDialogContent", "AlertDialogPrimitive.Content", "PopoverContent", "PopoverPrimitive.Content",
  "DrawerContent", "DrawerPrimitive.Content", "DropdownMenuContent", "DropdownMenuSubContent",
  "DropdownMenuPrimitive.Content", "DropdownMenuPrimitive.SubContent", "ContextMenuContent", "ContextMenuPrimitive.Content",
])

const relAt = (n: ts.Node, sf: ts.SourceFile) => `${relative(ROOT, sf.fileName)}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`
const tagOf = (el: ts.JsxOpeningLikeElement, sf: ts.SourceFile) => el.tagName.getText(sf)
const attributeOf = (el: ts.JsxOpeningLikeElement, sf: ts.SourceFile, name: string) =>
  el.attributes.properties.find((a): a is ts.JsxAttribute => ts.isJsxAttribute(a) && a.name.getText(sf) === name)
const valueOf = (a: ts.JsxAttribute | undefined) => (a?.initializer && ts.isJsxExpression(a.initializer) ? a.initializer.expression : undefined)

/** What a name stands for where it's used: the nearest declaration in scope, out to the file's. */
function inScope(name: string, from: ts.Node): ts.Node | null {
  for (let scope: ts.Node | undefined = from; scope; scope = scope.parent) {
    if (!ts.isBlock(scope) && !ts.isSourceFile(scope)) continue
    for (const st of scope.statements) {
      if (ts.isFunctionDeclaration(st) && st.name?.text === name) return st
      if (ts.isVariableStatement(st))
        for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.name.text === name && d.initializer) return d.initializer
    }
  }
  return null
}

/** An element's own key handler that reads Escape: written in place, by a name in scope, or through a function in scope it calls; null if none. */
function escapeHandlerOf(el: ts.JsxOpeningLikeElement, sf: ts.SourceFile): ts.Node | null {
  for (const key of ["onKeyDown", "onKeyDownCapture"]) {
    const value = valueOf(attributeOf(el, sf, key))
    const handler = value && ts.isIdentifier(value) ? inScope(value.text, el) : value
    if (!handler) continue
    if (readsEscape(handler)) return handler
    let reads = false
    const calls = (n: ts.Node) => {
      if (reads) return
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
        const fn = inScope(n.expression.text, el)
        if (fn && fn !== handler && readsEscape(fn)) reads = true
      }
      ts.forEachChild(n, calls)
    }
    calls(handler)
    if (reads) return handler
  }
  return null
}

// ─── Escape at what answers it ──────────────────────────────────────────
//
// What answers Escape itself (a rename put back, a search cleared, a run
// stopped) takes the press: the one Escape leaves a press from inside it to
// it (lib/keys/escape), and the page's layers (a list's selection, following
// someone, the front toast) hear nothing of it. Unmarked, a press it answered
// went on to them: a rename on the tables page put its name back, and the
// toast showing went with it (17 Oct). That holds for what says so: every
// element whose key handler reads Escape is marked data-escape-own, wherever
// it is, while it has something to do with the press. The baseline is none.

/**
 * The elements in a file whose key handler reads Escape and that don't say
 * they answer it, or that skip a press handed on to them by reading
 * defaultPrevented alone (a sheet over a narrow page hands every press on
 * marked so, and then nothing would answer it): "file:line: what's wrong".
 */
function unmarkedOwners(file: string, text?: string): string[] {
  const sf = parse(file, text)
  const out: string[] = []
  const visit = (n: ts.Node) => {
    if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && !RADIX_LAYERS.has(tagOf(n, sf))) {
      const handler = escapeHandlerOf(n, sf)
      if (handler && !attributeOf(n, sf, "data-escape-own")) out.push(`${relAt(n, sf)}: reads Escape, and isn't marked data-escape-own`)
      else if (handler) {
        const read = handler.getText(sf)
        if (/\bdefaultPrevented\b/.test(read) && !/\bescapeTaken\b/.test(read)) out.push(`${relAt(n, sf)}: skips a press handed on to it, reading defaultPrevented: ask escapeTaken (lib/keys/escapeOwn)`)
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return out
}

describe("Escape at what answers it", () => {
  it("is taken by it, and it says so", () => {
    const found = DIRS.flatMap((d) => sources(join(ROOT, d)))
      .filter((f) => f.endsWith(".tsx"))
      .flatMap((f) => {
        const text = readFileSync(f, "utf8")
        return /["']Escape["']/.test(text) ? unmarkedOwners(f, text) : []
      })
    expect(found, "a key handler reads Escape: mark its element data-escape-own (while it has something to do), and the one Escape leaves it the press").toEqual([])
  }, 60_000)
})

describe("the owner rule's reading", () => {
  const at = join(ROOT, "components", "zz-owner.tsx")
  const check = (code: string) => unmarkedOwners(at, code)

  it("finds a field that answers Escape and doesn't say so, written in place or by name", () => {
    expect(check(`<input onKeyDown={(e) => { if (e.key === "Escape") setRenaming(null) }} />`)).toHaveLength(1)
    expect(check(`function Row() { const keys = (e) => { if (e.key === "Escape") cancel() }; return <input onKeyDown={keys} /> }`)).toHaveLength(1)
    expect(check(`<div onKeyDownCapture={fieldKeyDown((e) => e.key === "Escape" && stop())} />`)).toHaveLength(1)
  })

  it("asks only the mark of a field in a layer the app draws round its children (a sheet of a surface's own)", () => {
    // SHADCN-AUDIT, 17 Oct: a ChromeSheet (MoveToDialog, OwnerControl) read as a
    // layer that closes first. The one Escape leaves an owner's press in every
    // layer, so the rule reads the field and not the layer, either way.
    expect(check(`<ChromeSheet open title="Move to">${'<input data-escape-own="" onKeyDown={(e) => { if (e.key === "Escape") setQuery("") }} />'}</ChromeSheet>`)).toEqual([])
    expect(check(`<ChromeSheet open title="Move to">${'<input onKeyDown={(e) => { if (e.key === "Escape") setQuery("") }} />'}</ChromeSheet>`)).toHaveLength(1)
  })

  it("finds one that says so but skips a press handed on to it", () => {
    expect(check(`<div data-escape-own="" onKeyDown={(e) => { if (e.key !== "Escape" || e.defaultPrevented) return; stop() }} />`)[0]).toMatch(/escapeTaken/)
    expect(check(`<div data-escape-own="" onKeyDown={(e) => { if (e.key !== "Escape" || escapeTaken(e.nativeEvent)) return; stop() }} />`)).toEqual([])
  })

  it("leaves alone one that says so, a layer's own keys, and keys that aren't Escape", () => {
    expect(check(`<input data-escape-own={dirty ? "" : undefined} onKeyDown={(e) => { if (e.key === "Escape") setName(saved) }} />`)).toEqual([])
    expect(check(`<PopoverContent onKeyDown={(e) => { if (e.key === "Escape") close() }} />`)).toEqual([])
    expect(check(`<input onKeyDown={(e) => { if (e.key === "Enter") save() }} />`)).toEqual([])
  })
})
