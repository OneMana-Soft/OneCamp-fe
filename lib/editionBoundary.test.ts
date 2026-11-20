import { describe, expect, it } from "vitest"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import ts from "typescript"

/**
 * Files every edition carries import only what every edition has. The public
 * repo's edition without AI has no lib/utils/userDisplayName and no
 * lib/utils/composerPlaceholder (the composers' check is in
 * composerPlaceholders.test.ts), and a new file in a folder the public repo
 * lacks is left behind when the web app is ported there. Each case below
 * would have broken that build.
 */
const ROOT = join(__dirname, "..")
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")

/**
 * AI-only files that sit in folders every edition carries: the AI-free public
 * line leaves each out when it ports the folder. A new one joins this list.
 */
const AI_ONLY = [
  "components/ui/graphics/AiMark.tsx",
  "components/ui/graphics/aiMark.test.tsx",
  "app/aiMarkGuard.test.ts",
  "app/aiMark.baseline.json",
  "e2e/aiMark.spec.ts",
  "lib/aiNames.ts",
  "lib/glossaryAi.ts",
  "lib/glossaryAi.test.ts",
  "app/glossaryAi.baseline.json",
  // Mind maps (miro-15): Expand with AI is the AI edition's add-on to the shared bar (lib/addOns/mindMap.ts).
  "components/board/mindMapAI.tsx",
  "lib/board/boardAI.ts",
  "e2e/boardMindMapAI.spec.ts",
]
/** The edition: the AI-free public line has no components/ai. */
const AI_EDITION = existsSync(join(ROOT, "components/ai"))

/**
 * What the AI-only files present say about the edition: the AI edition has
 * every one, so a rename can't leave the list stale; the AI-free line has
 * none, so a port that copied a shared folder whole fails here.
 */
function aiOnlyProblems(present: ReadonlySet<string>, aiEdition: boolean): string[] {
  return aiEdition
    ? AI_ONLY.filter((f) => !present.has(f)).map((f) => `${f} is gone: rename it in AI_ONLY, or take it off`)
    : AI_ONLY.filter((f) => present.has(f)).map((f) => `${f} is AI-only, and this is the AI-free line: leave it out`)
}

describe("files every edition carries", () => {
  it.each(["components/dialog/otherUserProfileDialog.tsx", "components/profile/mobileOtherUserProfile.tsx"])(
    "%s names a person by lib/personName, not the AI edition's helper",
    (file) => {
      const src = read(file)
      expect(src).toMatch(/displayNameOf\(/)
      expect(src).not.toMatch(/@\/lib\/utils\/userDisplayName/)
    },
  )

  it.each([
    "components/dialog/editProfileDailog.tsx",
    "components/profile/ProfileSettingsSections.tsx",
    "components/profile/ProfilePage.tsx",
    "components/notifications/NotificationPreferencesCard.tsx",
    "components/notifications/ReadReceiptsCard.tsx",
  ])("%s takes the settings parts from components/ui, a folder every edition has", (file) => {
    const src = read(file)
    expect(src).toMatch(/from "@\/components\/ui\/settingsSection"/)
    expect(src).not.toMatch(/@\/components\/settings\//)
  })

  it("keeps no components/settings folder, which the public repo does not have", () => {
    expect(existsSync(join(ROOT, "components/settings"))).toBe(false)
  })
})

/**
 * The playful layer's graphics (identity marks, tiles, motifs, spot
 * illustrations) and the helpers they rest on are drawn by both editions and
 * by the demo build alike, so they import nothing that only one of them has:
 * nothing from the AI edition, and nothing demo-only.
 */
describe("the playful layer is edition-neutral", () => {
  const FORBIDDEN = [
    /@\/components\/ai\b/,
    /@\/lib\/ai\b/,
    /demo(Funnel|Destination|Splash|Guide|Wins)|Demo(Guide|LeadPrompt|Wins|SharedNote)/,
  ]
  const files = [
    ...readdirSync(join(ROOT, "components/ui/graphics"), { recursive: true })
      .map(String)
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
      .map((f) => `components/ui/graphics/${f}`)
      .filter((f) => !AI_ONLY.includes(f)),
    "lib/campHue.ts",
    "lib/utils/getAvatarColor.ts",
  ]

  it("found the graphics to check", () => {
    expect(files).toContain("components/ui/graphics/IdentityMark.tsx")
  })

  it.each(files)("%s imports nothing AI or demo-only", (file) => {
    const imports = [...read(file).matchAll(/from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1] ?? m[2])
    const bad = imports.filter((spec) => FORBIDDEN.some((re) => re.test(spec)))
    expect(bad, `${file} imports ${bad.join(", ")}`).toEqual([])
  })
})

/**
 * The AI's words, as a person, a screen reader or a selector meets them: the
 * token AI (OneCamp AI, and AiMark, data-ai-mark or "[data-ai-mark]" split
 * into words) and, where this edition has lib/aiNames.ts, the AI's names there
 * as whole phrases, case as written. Strings, JSX text and names are read;
 * comments are not, as a neutral file may say what it keeps out ("nothing here
 * imports the AI edition"). So "avatar-agent", "hue-agent" or "said" is no AI word.
 */
const NAMES_FILE = "lib/aiNames.ts"
const parse = (file: string, src: string) =>
  ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
const aiNames = existsSync(join(ROOT, NAMES_FILE))
  ? (() => {
      const out: string[] = []
      const visit = (node: ts.Node) => {
        if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.initializer)) out.push(node.initializer.text)
        ts.forEachChild(node, visit)
      }
      visit(parse(NAMES_FILE, read(NAMES_FILE)))
      return out
    })()
  : []
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const NAMES = aiNames.map((name) => new RegExp(`(^|\\W)${escape(name)}(\\W|$)`))
const words = (text: string) =>
  text
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z\d]+/)
const saysAi = (text: string) => words(text).some((w) => /^ai$/i.test(w)) || NAMES.some((re) => re.test(text))

/** The AI words one file says, as "line: text". */
function aiWords(file: string, src: string): string[] {
  const sf = parse(file, src)
  const out: string[] = []
  const visit = (node: ts.Node) => {
    const text = ts.isJsxText(node) || ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node) || ts.isIdentifier(node) ? node.text : null
    if (text !== null && saysAi(text)) out.push(`${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}: ${JSON.stringify(text.trim().slice(0, 60))}`)
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

/**
 * The AI-free public line ports the shared folders whole, so a file there that
 * speaks of the AI would carry AI words to it.
 */
describe("the shared graphics say no AI word", () => {
  const graphics = readdirSync(join(ROOT, "components/ui/graphics"), { recursive: true })
    .map(String)
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) => `components/ui/graphics/${f}`)

  it("knows an AI word from a neighbour's", () => {
    expect(aiWords("x.tsx", '<span data-ai-mark="" aria-label="OneCamp AI">{label}</span>').length).toBe(2)
    expect(aiWords("x.tsx", "export function AiMark() {}\nconst AI_HUE = 1")).toEqual(['1: "AiMark"', '2: "AI_HUE"'])
    expect(aiWords("x.tsx", '// OneCamp AI: nothing here imports the AI edition\nconst c = cn("avatar-agent hue-agent", said, maintain, "Faces")')).toEqual([])
  })

  it.each(graphics.filter((f) => !AI_ONLY.includes(f)))("%s says no AI word in its strings, text or names", (file) => {
    const said = aiWords(file, read(file))
    expect(said, `${file} says ${said.join(", ")}: an AI-only file joins AI_ONLY, which the AI-free line leaves out`).toEqual([])
  })
})

/**
 * Mind maps (miro-15): the bar, the layout and the fold every edition carries. Expand with AI comes to the bar as the
 * AI edition's add-on (lib/addOns/mindMap.ts), from an AI-only file; a port carries these files whole.
 */
describe("the shared mind map files say no AI word", () => {
  it.each(["components/board/mindMapBar.tsx", "lib/board/mindMap.ts", "lib/board/mindMapTree.ts"])("%s says no AI word in its strings, text or names", (file) => {
    const said = aiWords(file, read(file))
    expect(said, `${file} says ${said.join(", ")}: the AI edition's control is an add-on in an AI-only file, which joins AI_ONLY`).toEqual([])
  })
})

/**
 * The glossary every edition carries: lib/glossary.ts holds the shared words,
 * and the AI edition's words sit in an AI-only file beside it.
 */
describe("the shared glossary says no AI word", () => {
  it("lib/glossary.ts says no AI word in its strings, text or names", () => {
    const said = aiWords("lib/glossary.ts", read("lib/glossary.ts"))
    expect(said, `lib/glossary.ts says ${said.join(", ")}: an AI-edition row belongs in an AI-only file, which joins AI_ONLY`).toEqual([])
  })
})

/**
 * A row marked for the AI edition makes its file AI-only: the AI-free line
 * ports lib/ whole, so a lib/ file holding one sits in AI_ONLY, which that
 * port leaves out. The pattern needs a quote right after the colon, so this
 * file's own text never matches it.
 */
const AI_ROW = /\bedition["']?\s*:\s*["']ai["']/

/** The files with a row marked for the AI edition that `aiOnly` leaves in every edition. */
function aiRowsOutside(files: readonly (readonly [string, string])[], aiOnly: readonly string[] = AI_ONLY): string[] {
  return files.filter(([file, src]) => !aiOnly.includes(file) && AI_ROW.test(src)).map(([file]) => file)
}

describe("lib/ files with AI-edition rows are AI-only", () => {
  const lib = readdirSync(join(ROOT, "lib"), { recursive: true })
    .map(String)
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) => `lib/${f}`)

  it("knows a marked row, whatever its quotes, and keeps a file in AI_ONLY out", () => {
    const row = `{ term: "X", edition` + `: "ai" }`
    const files = [
      ["lib/x.ts", row],
      ["lib/y.ts", row.replace(/"/g, "'")],
      ["lib/z.ts", 'const edition = "ai"\nconst e = { edition: aiEdition }'],
    ] as const
    expect(aiRowsOutside(files, [])).toEqual(["lib/x.ts", "lib/y.ts"])
    expect(aiRowsOutside(files, ["lib/x.ts", "lib/y.ts"])).toEqual([])
    expect(AI_ROW.test(read("lib/editionBoundary.test.ts")), "the pattern matches its own text").toBe(false)
  })

  it("found lib/'s files to check", () => {
    expect(lib).toContain("lib/glossary.ts")
  })

  it("no lib/ file outside AI_ONLY holds a row marked for the AI edition", () => {
    const outside = aiRowsOutside(lib.map((f) => [f, read(f)] as const))
    expect(outside, `${outside.join(", ")}: move the AI rows to an AI-only file and add it to AI_ONLY`).toEqual([])
  })
})

describe("AI-only files follow the edition", () => {
  it(`this tree, the ${AI_EDITION ? "AI edition" : "AI-free line"}, holds ${AI_EDITION ? "every" : "none"} of them`, () => {
    expect(aiOnlyProblems(new Set(AI_ONLY.filter((f) => existsSync(join(ROOT, f)))), AI_EDITION)).toEqual([])
  })

  it("an AI-free line that ported AiMark fails, and so does an AI edition that lost one", () => {
    expect(aiOnlyProblems(new Set(["components/ui/graphics/AiMark.tsx"]), false)).toEqual([
      "components/ui/graphics/AiMark.tsx is AI-only, and this is the AI-free line: leave it out",
    ])
    expect(aiOnlyProblems(new Set(), false)).toEqual([])
    expect(aiOnlyProblems(new Set(AI_ONLY), true)).toEqual([])
    expect(aiOnlyProblems(new Set(AI_ONLY.filter((f) => f !== "e2e/aiMark.spec.ts")), true)).toEqual([
      "e2e/aiMark.spec.ts is gone: rename it in AI_ONLY, or take it off",
    ])
  })
})
