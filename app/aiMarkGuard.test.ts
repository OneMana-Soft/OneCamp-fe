import { readFileSync } from "node:fs"

import ts from "typescript"
import { describe, expect, it } from "vitest"

import { copyFiles, parse } from "@/lib/testing/copyStrings"
import { type Counts, STALE_FAILS, WRITING, compare, readBaseline, tally, writeBaseline } from "@/lib/testing/ratchet"

/**
 * One mark, one name for the AI (UX-PROGRAM foundation 2). The sparkles icon
 * reads as "favourite" or "magic" to people (NN/g, 2024); the AI's mark is the
 * agent square (AiMark, components/ui/graphics/AiMark.tsx), the same square
 * breathing beside words while it works, and inside a control motifs' Spark
 * (components/ui/graphics/motifs.tsx). Four rules, each a per-file ratchet in
 * app/aiMark.baseline.json that only goes down as the areas move:
 *
 *   sparkles: no lucide Sparkles, Sparkle or WandSparkles, imported or re-exported;
 *   spinner:  no spinner on an AI surface (components/ai, activity, inbox, the DM
 *             composer's extras): the AI waits with <AiMark breathing />;
 *   square:   the agent gradient (avatar-agent) is drawn by AiMark, and by an
 *             agent's own face (PrincipalAvatar), nowhere else;
 *   spark:    the four-point spark (motifs' SPARK_PATH, or its path text) is
 *             drawn in components/ui/graphics alone; elsewhere it is <Spark />
 *             or <AiMark />. One per use, in sources outside that folder.
 *
 * `node scripts/ds/baselines.mjs app/aiMarkGuard.test.ts` lowers it.
 */

const BASELINE = "app/aiMark.baseline.json"
const RULES = ["sparkles", "spinner", "square", "spark"] as const

const SPARKLES = /^(Wand)?Sparkles?(Icon)?$/
const LOADERS = /^(Loader|Loader2|LoaderCircle|LoaderPinwheel)(Icon)?$/
const AI_SURFACES = ["components/ai/", "components/activity/", "components/inbox/", "components/chat/DmComposerExtras.tsx"]
const SQUARE_DRAWN_BY = new Set(["components/ui/graphics/AiMark.tsx", "components/ui/graphics/PrincipalAvatar.tsx"])
const SPARK_DRAWN_IN = "components/ui/graphics/"
/** SPARK_PATH's start (components/ui/graphics/motifs.tsx): a copy of the path is the same hand-drawn spark. */
const SPARK_START = "M12 2.5c.5 4.6"

const onAiSurface = (file: string) => AI_SURFACES.some((p) => file.startsWith(p))

/** What one file breaks, by rule. */
export function aiMarkFinds(file: string, src: string): Partial<Record<(typeof RULES)[number], number>> {
  const out: Partial<Record<(typeof RULES)[number], number>> = {}
  const add = (rule: (typeof RULES)[number]) => (out[rule] = (out[rule] ?? 0) + 1)
  const spinners = onAiSurface(file) && /Loader|animate-spin/.test(src)
  const square = file.endsWith(".tsx") && !SQUARE_DRAWN_BY.has(file) && src.includes("avatar-agent")
  const spark = !file.startsWith(SPARK_DRAWN_IN) && (src.includes("SPARK_PATH") || src.includes(SPARK_START))
  if (!/Sparkle/.test(src) && !spinners && !square && !spark) return out
  const sf = parse(file, src)
  const sparkNames = new Set(["SPARK_PATH"])
  const visit = (node: ts.Node) => {
    if ((ts.isImportSpecifier(node) || ts.isExportSpecifier(node)) && SPARKLES.test((node.propertyName ?? node.name).text)) add("sparkles")
    if (spinners && (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))) {
      const tag = node.tagName.getText(sf)
      const cls = node.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText(sf) === "className")
      if (LOADERS.test(tag) || (cls && /\banimate-spin\b/.test(cls.getText(sf)))) add("spinner")
    }
    if (square && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) && /(^|\s)avatar-agent(\s|$)/.test(node.text)) add("square")
    if (spark) {
      if (ts.isImportSpecifier(node) && (node.propertyName ?? node.name).text === "SPARK_PATH") sparkNames.add(node.name.text)
      else if (ts.isIdentifier(node) && sparkNames.has(node.text) && !ts.isImportSpecifier(node.parent) && !ts.isExportSpecifier(node.parent)) add("spark")
      else if ((ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) && node.text.includes(SPARK_START)) add("spark")
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

function countTree(): Counts {
  const out: Counts = {}
  for (const file of copyFiles()) for (const [rule, n] of Object.entries(aiMarkFinds(file, readFileSync(file, "utf8")))) tally(out, file, rule, n)
  return out
}

const SAY: Record<string, string> = {
  sparkles: "the AI is Spark (components/ui/graphics/motifs) inside a control, AiMark as its face (components/ui/graphics/AiMark); a sparkle that isn't the AI is another icon",
  spinner: "the AI waits with its mark breathing beside the words, <AiMark breathing /> (components/ui/graphics/AiMark), never a spinner",
  square: "draw the AI's face with AiMark",
  spark: "draw the spark with Spark (components/ui/graphics/motifs), or the AI's face with AiMark; SPARK_PATH stays in components/ui/graphics",
}

describe("the AI mark's guard", () => {
  it.runIf(WRITING)("writes the baseline", () => writeBaseline(BASELINE, countTree(), RULES))

  it("no new sparkles, AI spinners, hand-drawn agent squares or hand-drawn sparks: each file's count may only go down", () => {
    const { over, stale } = compare(readBaseline(BASELINE), countTree(), RULES)
    const say = over.map((o) => `${o.file}: ${o.key} ${o.n} (baseline ${o.allowed}): ${SAY[o.key]}`)
    expect(say, say.join("\n")).toEqual([])
    if (STALE_FAILS) expect(stale, "the baseline is out of date: run node scripts/ds/baselines.mjs app/aiMarkGuard.test.ts (it only lowers)").toEqual([])
  })

  it("each rule bites (fixtures)", () => {
    expect(aiMarkFinds("components/x.tsx", 'import { Sparkles, Check } from "lucide-react"\n// Sparkles in a comment')).toEqual({ sparkles: 1 })
    expect(aiMarkFinds("lib/icons.ts", 'export { ImagePlus, WandSparkles } from "lucide-react"')).toEqual({ sparkles: 1 })
    expect(aiMarkFinds("components/x.tsx", 'import { Sparkles as Magic } from "@/lib/icons"')).toEqual({ sparkles: 1 })
    const spin = 'const a = <Loader2 className="size-4 animate-spin" />\nconst b = <RefreshCw className={cn("size-4", busy && "animate-spin")} />'
    expect(aiMarkFinds("components/ai/X.tsx", spin)).toEqual({ spinner: 2 })
    expect(aiMarkFinds("components/inbox/X.tsx", spin)).toEqual({ spinner: 2 })
    expect(aiMarkFinds("components/task/X.tsx", spin)).toEqual({})
    const face = '<span className="avatar-agent grid size-6 place-items-center rounded-[32%] text-white" />'
    expect(aiMarkFinds("components/home/X.tsx", face)).toEqual({ square: 1 })
    expect(aiMarkFinds("components/ui/graphics/AiMark.tsx", face)).toEqual({})
    expect(aiMarkFinds("components/home/X.tsx", '<AiMark size={24} /> <span className="avatar-agentish" />')).toEqual({})
    const drawn = 'import { SPARK_PATH } from "@/components/ui/graphics/motifs"\nconst a = <path d={SPARK_PATH} />\nconst b = <path d="M12 2.5c.5 4.6 2.9 7 9.5 9.5z" />'
    expect(aiMarkFinds("components/home/X.tsx", drawn)).toEqual({ spark: 2 })
    expect(aiMarkFinds("lib/x.ts", 'import { SPARK_PATH as P } from "@/components/ui/graphics"\nconst svg = `<path d="${P}"/>`')).toEqual({ spark: 1 })
    expect(aiMarkFinds("components/ui/graphics/X.tsx", drawn)).toEqual({})
    expect(aiMarkFinds("components/home/X.tsx", 'import { Spark } from "@/components/ui/graphics/motifs"\nconst a = <Spark size={12} />')).toEqual({})
  })
})
