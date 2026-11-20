import { createRequire } from "node:module"
import { readFileSync, realpathSync } from "node:fs"
import path from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"
import type { AppState } from "@excalidraw/excalidraw/types"

// Escape on a board (miro-28). Excalidraw's finalize took every Escape pressed in it, even with nothing to finish (its
// keyTest; Excalidraw's key handler then stops the press), so the page's one Escape (lib/keys/escape) never heard a
// press made after one on the canvas: the slides stayed on, the sticky tool stayed in hand and following someone went
// on. The repo's patch (patches/@excalidraw__excalidraw@0.18.1.patch) has finalize take Escape only while Excalidraw
// has something of its own to finish; any other press goes on, unstopped, to the page. Asked here of finalize as
// installed, in both of Excalidraw's builds (dev: tests and next dev; prod: next build). The dev build has the rule in
// finalize's own object; the prod build as a statement after the module's last line (its lines run to 161 KB), which
// is why the module is parsed here: a line the patch put inside a string or a function would not count. An upgrade
// that drops the patch, or moves the line, fails the idle case. In a browser: boardSlides.spec, Escape from the board
// ends the slides.

const root = realpathSync(path.dirname(path.dirname(path.dirname(createRequire(import.meta.url).resolve("@excalidraw/excalidraw")))))

// The patch writes this line into each build's index.js next to its rule. A node_modules installed without the patch
// (an older install copied in, as an archive copy's may be) fails on it first, by the patch's name, and not on an idle
// Escape below as if finalize had drifted.
const PATCH = "patches/@excalidraw__excalidraw@0.18.1.patch"
const PATCHED = "OneCamp (miro-28)"

type KeyTest = (event: Pick<KeyboardEvent, "key">, appState: AppState) => boolean

const propName = (p: ts.ObjectLiteralElementLike) => (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) ? p.name.text : undefined)

/** finalize's keyTest as one build of the installed package runs it: the last `<finalize>.keyTest = …` at the module's
 *  top level, else the keyTest in finalize's own object (the action manager reads it from that object on each key). */
function finalizeKeyTest(build: "dev" | "prod"): KeyTest {
  const index = path.join(root, "dist", build, "index.js")
  const src = readFileSync(index, "utf8")
  expect(
    src.includes(PATCHED),
    `Excalidraw's ${build} build (${index}) is installed without the repo's ${PATCH} (no "${PATCHED}" line): this ` +
      "node_modules came from another install. Reinstall it from the lockfile: pnpm install --frozen-lockfile",
  ).toBe(true)
  const file = ts.createSourceFile("index.js", src, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS)
  let action: string | undefined
  let rule: ts.Expression | undefined
  for (const stmt of file.statements) {
    if (ts.isVariableStatement(stmt)) {
      for (const { name, initializer: init } of stmt.declarationList.declarations) {
        const fields = init && ts.isCallExpression(init) && init.arguments[0]
        if (!ts.isIdentifier(name) || !fields || !ts.isObjectLiteralExpression(fields)) continue
        const named = fields.properties.find((p) => propName(p) === "name") as ts.PropertyAssignment | undefined
        if (!named || !ts.isStringLiteral(named.initializer) || named.initializer.text !== "finalize") continue
        action = name.text
        rule = (fields.properties.find((p) => propName(p) === "keyTest") as ts.PropertyAssignment | undefined)?.initializer
      }
    } else if (action && ts.isExpressionStatement(stmt) && ts.isBinaryExpression(stmt.expression)) {
      const { left, operatorToken, right } = stmt.expression
      const set = operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(left)
      if (set && ts.isIdentifier(left.expression) && left.expression.text === action && left.name.text === "keyTest") rule = right
    }
  }
  if (!rule) throw new Error(`no finalize keyTest in Excalidraw's ${build} build`)
  const expr = rule.getText(file)
  const keys = /(\w+)\.ESCAPE/.exec(expr)?.[1]
  return (keys ? new Function(keys, `return (${expr})`)({ ESCAPE: "Escape", ENTER: "Enter" }) : new Function(`return (${expr})`)()) as KeyTest
}

const IDLE = {
  selectedElementIds: {},
  activeTool: { type: "selection" },
  newElement: null,
  multiElement: null,
  editingLinearElement: null,
  editingTextElement: null,
  croppingElementId: null,
  activeEmbeddable: null,
  openMenu: null,
  openPopup: null,
  openSidebar: null,
  openDialog: null,
  contextMenu: null,
} as unknown as AppState
const state = (s: object) => ({ ...IDLE, ...s }) as AppState
const ESC = { key: "Escape" }

for (const build of ["dev", "prod"] as const) {
  describe(`Escape on a board (Excalidraw's ${build} build)`, () => {
    const takes = finalizeKeyTest(build)

    it("goes on to the page while Excalidraw has nothing of its own to finish", () => {
      expect(takes(ESC, IDLE)).toBe(false)
      // A selection Excalidraw kept as unselected entries, and a card the pointer is over, are nothing to finish.
      expect(takes(ESC, state({ selectedElementIds: { a: false } }))).toBe(false)
      expect(takes(ESC, state({ activeEmbeddable: { element: {}, state: "hover" } }))).toBe(false)
    })

    it("stays Excalidraw's while it has something of its own to finish", () => {
      const own = [
        { selectedElementIds: { a: true } },
        { activeTool: { type: "rectangle" } },
        { activeTool: { type: "hand" } },
        { multiElement: {} },
        { editingLinearElement: {} },
        { editingTextElement: {} },
        { croppingElementId: "a" },
        { activeEmbeddable: { element: {}, state: "active" } },
        { openMenu: "canvas" },
        { openPopup: "elementStroke" },
        { openSidebar: { name: "default" } },
        { openDialog: { name: "help" } },
        { contextMenu: {} },
      ]
      for (const s of own) expect(takes(ESC, state(s)), JSON.stringify(s)).toBe(true)
    })

    it("finishes a line drawn point by point with Enter, and takes no other Enter, as before", () => {
      expect(takes({ key: "Enter" }, state({ multiElement: {} }))).toBe(true)
      expect(takes({ key: "Enter" }, IDLE)).toBe(false)
    })
  })
}
