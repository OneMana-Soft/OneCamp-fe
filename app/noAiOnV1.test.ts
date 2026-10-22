import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

import ts from "typescript"
import { describe, expect, it } from "vitest"

/**
 * This branch is the AI-FREE edition, and it must not render AI.
 *
 * WHY THIS TEST EXISTS. It already went wrong. The board page rendered an AI
 * panel and every channel's member settings rendered "AI Teammates" and "AI
 * Budget", unconditionally, against a v1 backend that has no AI endpoints at all.
 * So the people who choose this edition precisely because their policy forbids AI
 * were shown AI controls that could only fail.
 *
 * edition.go predicted it in a comment: pair the wrong halves and "the workspace
 * installs, passes every health check, and shows a customer buttons that return
 * 404". Nothing enforced it, so it happened, and nothing would have caught it
 * happening again the next time a component is cherry-picked from the ai branch.
 *
 * The check reads imports as well as what is shown, because an import is what
 * puts a component in the bundle, and "not even in the build" is the claim made
 * to customers.
 *
 * WIDENED 22 Oct 2026. v1.60.1 shipped AI anyway: Translate on every message
 * (services/aiService), "Ask AI about this image" and "Summarise with AI" in the
 * attachment viewer, and a command palette whose every search posted /ai/search
 * (services/aiSearchService), each answered 501 by the AI-free server. The check
 * read only one-line imports whose last path segment held a capital "AI", so none
 * of them showed. Now every file the build can ship is parsed, and three things
 * fail:
 *   - an import, export-from, import() or require() of a module with the word
 *     "ai" in its path, in any case: services/aiService, lib/ai,
 *     components/ai/…, MyAIActivityFeed, a package named @ai-…;
 *   - a string holding an /ai/ endpoint;
 *   - "AI" as a word in a string or in JSX text: what a person would read.
 */

/** Every folder of code the build can ship. lib/testing is for tests only. */
const ROOTS = ["app", "components", "context", "hooks", "lib", "services", "store", "types"]
const TEST_ONLY = join("lib", "testing")

/** Findings that only look like AI, each with why: [file, finding, why]. */
const NOT_AI: Array<[file: string, finding: string, why: string]> = [
  ["lib/utils/format/getFriendlyFileExtension.ts", 'says "AI"', "the Illustrator file type (application/postscript)"],
  ["services/updatesService.ts", 'says "with AI"', "the updates card names the two editions"],
  ["services/updatesService.ts", 'says "without AI"', "the updates card names the two editions"],
]

/**
 * AI this line still held when the check was widened (22 Oct 2026): copy and
 * wiring carried over from the ai branch, each a leak to remove. The list only
 * shrinks: a removed leak fails until its entry goes too, so it can't come back.
 * The leaks the audit named (Translate, the attachment viewer's Ask AI, the
 * command palette's AI search, and the services behind them) are not on it.
 */
const LEFT_TO_REMOVE: Record<string, string[]> = {
  "app/app/settings/connectors/page.tsx": ['says "Connect your accounts so the AI can help across your tools."'],
  "components/admin/ArchiveRestoreDialog.tsx": ['says "Restoring also brings back what OneCamp AI remembered from t"'],
  "components/admin/ArchiveRunJobDialog.tsx": ['says "What OneCamp AI remembered from them (decisions, commitments"'],
  "components/admin/SystemCheckCard.tsx": ['says "AI"'],
  "components/admin/WorkflowEditDialog.tsx": ['says "The AI fills in the form below. You check it and pick the ch"'],
  "components/connectors/ConnectorsCard.tsx": ['says "The AI will no longer be able to access your"'],
  "components/docEditor/BlockSheet.tsx": ['says "Ask AI"'],
  "components/docEditor/registry/readers.ts": ['says "AI"'],
  "components/home/HomeLists.tsx": ['says "Ask AI"'],
  "components/livekit/VideoControls.tsx": ['says "Ask AI"', 'says "Hide OneCamp AI"', 'says "Ask AI"'],
  "components/minimal-tiptap/extensions/callout/components/callout-view.tsx": ['says "From AI"'],
  "components/minimal-tiptap/extensions/slash-command/slashCommand.tsx": [
    'says "AI"',
    'says "AI"',
    'says "AI"',
    'says "Ask AI to write “"',
  ],
  "components/navigationBar/mobile/mobileTopNavigationBarSecond.tsx": ['says "OneCamp AI"'],
  "components/projectUpdates/UpdateComposer.tsx": [
    'says "The AI isn\'t available right now"',
    'says "Undo the AI summary"',
    'says "Add an AI summary"',
  ],
  "components/rightPanel/rightPanelHeader.tsx": ['says "AI assistant"'],
  "components/shortcuts/ShortcutsDialog.tsx": ['says "Ask OneCamp AI"'],
  "components/table/ColumnMenu.tsx": ['says "Filled by AI"'],
  "components/table/RecordPanel.tsx": ['says "Written by a person, so AI leaves it be"'],
  "components/table/columnMenu/ColumnMenuBody.tsx": [
    'says "AI fill complete"',
    'says "Fill with AI…"',
    'says "Fill with AI"',
    'says "What AI should put in each cell"',
  ],
  "components/table/fields/FieldSettings.tsx": ['says "Rows added through the API, AI or a form must fill it in"'],
  "components/task/taskAssigneePicker.tsx": ['says "AI teammates"'],
  "components/textInput/composerTools.tsx": ['says "Draft with AI"'],
  "components/textInput/phoneComposerShell.tsx": ['says "Draft with AI"'],
  "components/ui/principalTag.tsx": ['says "AI agent"', 'says "AI agent: acts for the person who set it up"'],
  "components/views/DocView.tsx": ['says "Ask AI"'],
  "hooks/useMqttMessageHandler.ts": [
    'says "[MQTT] Failed to parse AI nudge message"',
    'says "[MQTT] Failed to parse AI pending action message"',
    'says "[MQTT] Failed to parse AI agent work message"',
  ],
  "lib/botCopy.ts": ['says "AI"', 'says "Chat with AI"', 'says "OneCamp AI"', 'says "AI teammate"'],
  "lib/codec/markdown.ts": ['says "AI"'],
  "lib/destinationHue.ts": ['calls "/app/ai"'],
  "lib/tables/history.ts": ['says "AI"'],
  "lib/utils/pageTitle.ts": ['says "OneCamp AI"'],
  "services/capabilityService.ts": ['says "Build AI agents"', 'says "Let members create AI agents that use tools to do work in th"'],
  "services/endpoints/docs.ts": ['calls "/ai/status"'],
  "services/endpoints/inbox.ts": ['calls "/ai/catch-up"'],
  "services/endpoints/projects.ts": ['calls "/ai/project-update/draft"', 'calls "/ai/goal-checkin/draft"'],
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) {
      if (p !== TEST_ONLY) walk(p, out)
    } else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p)
  }
  return out
}

/**
 * The words of a name, split at case changes, digits and punctuation:
 * "aiSearchService" is ai, search, service, and "MyAIFeed" is my, ai, feed.
 */
export function wordsOf(name: string): string[] {
  return (name.match(/[A-Z]+(?![a-z])|[A-Z]?[a-z]+|\d+/g) ?? []).map((w) => w.toLowerCase())
}

const AI_ENDPOINT = /(?:^|\/)ai\/|\/ai(?:\?|$)/
const AI_WORD = /\bAI\b/

/** Where a file brings in, calls or shows AI: "line: what", one per finding. */
export function aiIn(src: string, fileName = "x.tsx"): string[] {
  const kind = fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sf = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true, kind)
  const found: string[] = []
  const report = (n: ts.Node, what: string) => found.push(`${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}: ${what}`)
  const shown = (text: string) => text.trim().replace(/\s+/g, " ").slice(0, 60).trimEnd()
  const specifiers = new Set<ts.Node>()
  const visit = (n: ts.Node) => {
    let spec: ts.Expression | undefined
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier) spec = n.moduleSpecifier
    else if (ts.isCallExpression(n) && (n.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(n.expression) && n.expression.text === "require"))) spec = n.arguments[0]
    if (spec && ts.isStringLiteralLike(spec)) {
      specifiers.add(spec)
      if (wordsOf(spec.text).includes("ai")) report(spec, `imports "${spec.text}"`)
    }
    if ((ts.isStringLiteralLike(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) && !specifiers.has(n)) {
      if (AI_ENDPOINT.test(n.text)) report(n, `calls "${shown(n.text)}"`)
      else if (AI_WORD.test(n.text)) report(n, `says "${shown(n.text)}"`)
    }
    if (ts.isJsxText(n) && AI_WORD.test(n.text)) report(n, `says "${shown(n.text)}"`)
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return found
}

describe("the AI-free edition", () => {
  // Each finding without its line, so editing around one never moves it.
  const found = ROOTS.flatMap((root) => walk(root)).flatMap((file) => {
    const rel = file.replace(/\\/g, "/")
    return aiIn(readFileSync(file, "utf8"), file).map((hit) => {
      const cut = hit.indexOf(": ")
      return { rel, line: hit.slice(0, cut), what: hit.slice(cut + 2) }
    })
  })
  const left = new Map(Object.entries(LEFT_TO_REMOVE).map(([file, whats]) => [file, [...whats]]))
  const unlisted: string[] = []
  for (const { rel, line, what } of found) {
    if (NOT_AI.some(([file, finding]) => file === rel && finding === what)) continue
    const listed = left.get(rel) ?? []
    const at = listed.indexOf(what)
    if (at >= 0) listed.splice(at, 1)
    else unlisted.push(`${rel}:${line}: ${what}`)
  }

  it("brings in, calls and shows no AI beyond what is left to remove", () => {
    expect(
      unlisted,
      "AI reached the AI-free edition. It ships to customers whose policy forbids AI, " +
        "against a server with no AI endpoints (each answers 501), so it can only fail. " +
        "Remove it. If it only looks like AI, add it to NOT_AI with why.",
    ).toEqual([])
  })

  it("takes each removed leak off the list, so it can't come back", () => {
    expect([...left].flatMap(([file, whats]) => whats.map((what) => `${file}: ${what}`))).toEqual([])
  })

  it("keeps the not-AI list to findings that are there", () => {
    expect(NOT_AI.filter(([file, finding]) => !found.some((f) => f.rel === file && f.what === finding))).toEqual([])
  })
})

describe("what the AI-free check reads", () => {
  it("splits a name into its words", () => {
    expect(wordsOf("aiSearchService")).toEqual(["ai", "search", "service"])
    expect(wordsOf("@/components/ai/MyAIActivityFeed")).toEqual(["components", "ai", "my", "ai", "activity", "feed"])
    expect(wordsOf("DocAiTasks")).toEqual(["doc", "ai", "tasks"])
    expect(wordsOf("@/lib/http/loadFailure")).not.toContain("ai")
  })

  it("finds an AI module however it is brought in", () => {
    const src = [
      `import { useTranslateText } from "@/services/aiService"`,
      `import {\n  askAboutImage,\n  summarise,\n} from "@/lib/ai/analyze"`,
      `export { AiPanel } from "@/components/ai/AiPanel"`,
      `const Panel = dynamic(() => import("@/components/MyAIActivityFeed"))`,
      `const sdk = require("@ai-sdk/react")`,
    ].join("\n")
    expect(aiIn(src)).toEqual([
      `1: imports "@/services/aiService"`,
      `5: imports "@/lib/ai/analyze"`,
      `6: imports "@/components/ai/AiPanel"`,
      `7: imports "@/components/MyAIActivityFeed"`,
      `8: imports "@ai-sdk/react"`,
    ])
  })

  it("finds an /ai/ endpoint, written whole or around a value", () => {
    expect(aiIn(`const search = "/ai/search"\nconst url = \`\${base}/ai/translate?to=\${lang}\``)).toEqual([
      `1: calls "/ai/search"`,
      `2: calls "/ai/translate?to="`,
    ])
  })

  it("finds AI people would read, in strings and JSX text", () => {
    const src = `const tip = "Summarise with AI"\nconst view = <button aria-label="Ask AI about this image">Ask AI</button>`
    expect(aiIn(src)).toEqual([
      `1: says "Summarise with AI"`,
      `2: says "Ask AI about this image"`,
      `2: says "Ask AI"`,
    ])
  })

  it("leaves words that only hold the letters, names, keys and comments alone", () => {
    const src = [
      `import { useSaysLoadFailure } from "@/lib/http/loadFailure"`,
      `import { emailOf } from "@/lib/email"`,
      `// AI used to live here: /ai/search`,
      `const key = "AI_SEARCH", kind = "ai", mail = "MAIL", path = "/app/aim/details", said = "said"`,
    ].join("\n")
    expect(aiIn(src)).toEqual([])
  })
})

// The tables page offered "Describe a table and AI builds it" on this edition,
// with no gate, posting to a route the AI-free server answers with 501 (found
// 16 Oct 2026). Its import has no "AI" in its name, so the check above never
// saw it: this one reads what the page and the table service hold.
describe("the tables page", () => {
  it("offers no AI table builder on this edition", () => {
    const page = readFileSync(join(process.cwd(), "app/app/tables/page.tsx"), "utf8")
    for (const banned of ["generateTable", "data-ai-bar", "AI builds", "for AI to build"]) {
      expect(page.includes(banned), `app/app/tables/page.tsx holds "${banned}"`).toBe(false)
    }
    const service = readFileSync(join(process.cwd(), "services/tableService.ts"), "utf8")
    expect(service.includes("generateTable"), "services/tableService.ts still builds tables with AI").toBe(false)
  })
})
