import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"

// Next 16.3 writes AGENTS.md and CLAUDE.md into the project's root on
// `next dev` when it detects an AI coding agent, a block of instructions
// for the agent that asks to be committed with its work
// (node_modules/next/dist/server/lib/generate-agent-files.js), unless
// next.config says `agentRules: false`. A CLAUDE.md at a worktree's root is
// read as instructions by every agent working there, and either file could
// go into a commit with other work (17 Oct 2026, the Next 16.3.8 upgrade).
// The config keeps Next from writing them, and .gitignore keeps the two
// names at the root out of git (the skills' own AGENTS.md, under .claude,
// are tracked on purpose).

const ROOT = join(__dirname, "..")

/** The object next.config.ts exports, as written. */
function exportedConfig(): ts.ObjectLiteralExpression | null {
  const sf = ts.createSourceFile("next.config.ts", readFileSync(join(ROOT, "next.config.ts"), "utf8"), ts.ScriptTarget.Latest, true)
  const exported = sf.statements.find(ts.isExportAssignment)
  if (!exported) return null
  let value: ts.Expression = exported.expression
  if (ts.isIdentifier(value)) {
    const name = value.text
    for (const st of sf.statements)
      if (ts.isVariableStatement(st))
        for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.name.text === name && d.initializer) value = d.initializer
  }
  while (ts.isSatisfiesExpression(value) || ts.isAsExpression(value) || ts.isParenthesizedExpression(value)) value = value.expression
  return ts.isObjectLiteralExpression(value) ? value : null
}

describe("next dev's files for AI agents", () => {
  it("are never written: next.config turns agentRules off", () => {
    const config = exportedConfig()
    expect(config, "next.config.ts exports its config object").not.toBeNull()
    const agentRules = config!.properties.find((p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && p.name.getText() === "agentRules")
    expect(agentRules?.initializer.kind, "next.config.ts: agentRules: false").toBe(ts.SyntaxKind.FalseKeyword)
  })

  it("are read off by that name in the Next this repo runs", () => {
    // Renamed in a later Next, the key would be an unknown option and the
    // files would come back on the next `next dev`.
    const start = createRequire(join(ROOT, "package.json")).resolve("next/dist/server/lib/start-server.js")
    expect(readFileSync(start, "utf8")).toMatch(/\.agentRules !== false/)
  })

  it("are never committed: .gitignore names both at the root", () => {
    const ignored = readFileSync(join(ROOT, ".gitignore"), "utf8").split(/\r?\n/).map((line) => line.trim())
    expect(ignored).toContain("/AGENTS.md")
    expect(ignored).toContain("/CLAUDE.md")
  })
})
