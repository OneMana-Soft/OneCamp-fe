import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"

import ts from "typescript"
import { describe, expect, it } from "vitest"

/**
 * A useSelector returns what the store holds, not something it makes.
 *
 * react-redux compares a selector's result with the last one by identity, and
 * runs it again on every change to the store. `state.x[id] || []` makes a new
 * array whenever the key is missing, so the component re-renders on every
 * dispatch, whatever changed: a keystroke in a composer (drafts live in the
 * store), a message arriving, the typing sweep. In the sidebar that was every
 * DM row. Fall back to a constant declared outside the component instead.
 *
 * Files that do it already are counted below, by the number of selectors;
 * each belongs to the screen that owns the file, and the counts may only go
 * down. Anything new fails.
 */

const BASELINE: Record<string, number> = {
  "app/app/channel/[channel-id]/[post-id]/page.tsx": 1,
  "app/app/chat/[chat-id]/[message-id]/page.tsx": 1,
  "app/app/chat/group/[chat-grp-id]/[message-id]/page.tsx": 1,
  "components/chat/chatUserList.tsx": 1,
  "components/dialog/updateUserStatusDialog.tsx": 1,
  "components/fileUpload/groupChatCommentFileUpload.tsx": 1,
}

const ROOT = process.cwd()
function files(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) files(p, out)
    else if (/\.tsx?$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) out.push(p)
  }
  return out
}

const unwrap = (n: ts.Expression): ts.Expression =>
  ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isTypeAssertionExpression(n) || ts.isSatisfiesExpression(n) ? unwrap(n.expression) : n

const isFresh = (n: ts.Expression) => {
  const e = unwrap(n)
  return ts.isArrayLiteralExpression(e) || ts.isObjectLiteralExpression(e)
}

/** Selectors in `src` that can return a value made on the spot. */
export function freshSelectors(src: string, fileName = "x.tsx"): number {
  const sf = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let count = 0
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "useSelector") {
      const fn = n.arguments[0]
      if (fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) {
        let fresh = false
        const results: ts.Expression[] = []
        if (ts.isArrowFunction(fn) && !ts.isBlock(fn.body)) results.push(fn.body)
        else
          ts.forEachChild(fn.body, function ret(c) {
            if (ts.isReturnStatement(c) && c.expression) results.push(c.expression)
            if (!ts.isFunctionLike(c)) ts.forEachChild(c, ret)
          })
        for (const r of results) {
          const e = unwrap(r)
          if (isFresh(e)) fresh = true
          if (ts.isBinaryExpression(e) && (e.operatorToken.kind === ts.SyntaxKind.BarBarToken || e.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) && isFresh(e.right)) fresh = true
          if (ts.isConditionalExpression(e) && (isFresh(e.whenTrue) || isFresh(e.whenFalse))) fresh = true
          if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression) && ["map", "filter", "slice", "concat", "reduce"].includes(e.expression.name.text)) fresh = true
        }
        if (fresh) count++
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return count
}

describe("store selectors", () => {
  it("return what the store holds, not a value made on the spot", () => {
    const over: string[] = []
    for (const file of ["app", "components", "hooks", "lib", "context"].flatMap((d) => files(join(ROOT, d)))) {
      const rel = relative(ROOT, file)
      const src = readFileSync(file, "utf8")
      if (!src.includes("useSelector")) continue
      const count = freshSelectors(src, rel)
      const allowed = BASELINE[rel] ?? 0
      if (count > allowed) over.push(`${rel}: ${count} (allowed ${allowed})`)
    }
    expect(over).toEqual([])
  })

  it("would catch one", () => {
    expect(freshSelectors(`useSelector((s) => s.users.usersStatus[id] || {})`)).toBe(1)
    expect(freshSelectors(`useSelector((s: RootState) => s.chat.chatMessages[id] ?? ([] as Chat[]))`)).toBe(1)
    expect(freshSelectors(`useSelector((s) => s.tasks.filter((t) => t.done))`)).toBe(1)
    expect(freshSelectors(`useSelector((s) => s.users.usersStatus[id] || NO_STATUS)`)).toBe(0)
    expect(freshSelectors(`useSelector((s) => (s.chat.chatMessages[id] || []).length)`)).toBe(0)
  })
})
