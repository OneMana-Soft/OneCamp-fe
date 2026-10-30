/**
 * The rest of the template library (miro-19): the layouts Miro's lead
 * categories open with (retros, brainstorms, strategy canvases, research,
 * planning, workshops), built from the same builders as the five the empty
 * board offers (lib/board/templates). Loaded with the picker, never on the
 * board's first screen. Pure, so every layout is tested.
 */

import { BOARD_TEMPLATES, GAP, STICKY, areas, arrow, columns, heading, quadrants, sticky, type BoardTemplate, type Skeleton } from "./templates"

const LIBRARY: BoardTemplate[] = [
  // ---- Retrospectives ------------------------------------------------------
  {
    id: "start-stop-continue",
    name: "Start, stop, continue",
    description: "What to begin, what to drop, what to keep doing.",
    category: "Retrospectives",
    keywords: "retro sprint",
    build: (p) =>
      columns(p, [
        { name: "Start", colour: "green", notes: ["What should we begin doing?", ""] },
        { name: "Stop", colour: "red", notes: ["What isn't helping?", ""] },
        { name: "Continue", colour: "blue", notes: ["What works and stays?", ""] },
      ]),
  },
  {
    id: "mad-sad-glad",
    name: "Mad, sad, glad",
    description: "How the last stretch felt, in three columns.",
    category: "Retrospectives",
    keywords: "retro feelings emotions",
    build: (p) =>
      columns(p, [
        { name: "Mad", colour: "tomato", notes: ["What frustrated you?", ""] },
        { name: "Sad", colour: "blue", notes: ["What disappointed you?", ""] },
        { name: "Glad", colour: "yellow", notes: ["What made you happy?", ""] },
      ]),
  },
  {
    id: "four-ls",
    name: "4 Ls",
    description: "Liked, learned, lacked and longed for.",
    category: "Retrospectives",
    keywords: "retro liked learned lacked longed",
    build: (p) =>
      columns(p, [
        { name: "Liked", colour: "green", notes: ["What did you enjoy?"] },
        { name: "Learned", colour: "purple", notes: ["What did you learn?"] },
        { name: "Lacked", colour: "red", notes: ["What was missing?"] },
        { name: "Longed for", colour: "blue", notes: ["What do you wish we had?"] },
      ], 1),
  },
  {
    id: "sailboat",
    name: "Sailboat",
    description: "Wind behind us, anchors holding us back, rocks ahead, the island we aim for.",
    category: "Retrospectives",
    keywords: "retro speedboat risks goals",
    build: (p) =>
      quadrants(p, [
        { name: "Island: our goal", colour: "teal", notes: ["Where are we heading?"] },
        { name: "Wind: what pushes us", colour: "green", notes: ["What helps us go faster?"] },
        { name: "Anchors: what slows us", colour: "red", notes: ["What holds us back?"] },
        { name: "Rocks: risks ahead", colour: "orange", notes: ["What could sink us?"] },
      ]),
  },
  {
    id: "starfish",
    name: "Starfish",
    description: "Keep, more of, less of, start and stop.",
    category: "Retrospectives",
    keywords: "retro",
    build: (p) =>
      columns(p, [
        { name: "Keep doing", colour: "green", notes: [""] },
        { name: "More of", colour: "teal", notes: [""] },
        { name: "Less of", colour: "orange", notes: [""] },
        { name: "Start doing", colour: "blue", notes: [""] },
        { name: "Stop doing", colour: "red", notes: [""] },
      ], 1),
  },
  {
    id: "rose-thorn-bud",
    name: "Rose, thorn, bud",
    description: "A highlight, a pain point and a new idea from each person.",
    category: "Retrospectives",
    keywords: "retro check-in reflection",
    build: (p) =>
      columns(p, [
        { name: "Rose: a highlight", colour: "red", notes: ["What went best?", ""] },
        { name: "Thorn: a pain point", colour: "grey", notes: ["What hurt?", ""] },
        { name: "Bud: an idea", colour: "green", notes: ["What could grow?", ""] },
      ]),
  },
  {
    id: "kalm",
    name: "KALM",
    description: "Keep, add, less, more: tune how the team works.",
    category: "Retrospectives",
    keywords: "retro keep add less more",
    build: (p) =>
      columns(p, [
        { name: "Keep", colour: "green", notes: [""] },
        { name: "Add", colour: "blue", notes: [""] },
        { name: "Less", colour: "orange", notes: [""] },
        { name: "More", colour: "purple", notes: [""] },
      ], 1),
  },

  // ---- Brainstorming -------------------------------------------------------
  {
    id: "crazy-8s",
    name: "Crazy 8s",
    description: "Eight quick sketches in eight minutes, one frame each.",
    category: "Brainstorming",
    keywords: "sketch design sprint ideas",
    build: (p) =>
      areas(p, [
        Array.from({ length: 4 }, (_, i) => ({ name: `Sketch ${i + 1}`, colour: "grey" as const, notes: [""], perRow: 1 })),
        Array.from({ length: 4 }, (_, i) => ({ name: `Sketch ${i + 5}`, colour: "grey" as const, notes: [""], perRow: 1 })),
      ]),
  },
  {
    id: "how-might-we",
    name: "How might we",
    description: "Turn problems into questions worth answering.",
    category: "Brainstorming",
    keywords: "hmw design thinking problem",
    build: (p) =>
      columns(p, [
        { name: "The problem", colour: "red", notes: ["What's the problem in a sentence?"] },
        { name: "How might we…", colour: "purple", notes: ["How might we…", "", "", ""] },
        { name: "Ideas", colour: "yellow", notes: ["", "", "", ""] },
      ]),
  },
  {
    id: "affinity-map",
    name: "Affinity map",
    description: "Sort a pile of notes into themes.",
    category: "Brainstorming",
    keywords: "cluster group themes research synthesis",
    build: (p) =>
      areas(p, [
        [{ name: "Unsorted", colour: "yellow", notes: ["Paste notes here, one a line", "", "", "", "", ""], perRow: 3 }],
        [
          { name: "Theme 1", colour: "blue", notes: [""], perRow: 1 },
          { name: "Theme 2", colour: "green", notes: [""], perRow: 1 },
          { name: "Theme 3", colour: "purple", notes: [""], perRow: 1 },
          { name: "Theme 4", colour: "orange", notes: [""], perRow: 1 },
        ],
      ]),
  },
  {
    id: "mind-map",
    name: "Mind map",
    description: "A central idea, with branches round it.",
    category: "Brainstorming",
    keywords: "mindmap branches ideas tree",
    build: (p) => {
      const out: Skeleton[] = []
      const centre = `${p}-centre`
      out.push(sticky(centre, 0, 0, "The central idea", "purple", 240))
      const r = 420
      const cx = 120, cy = 120
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2
        const id = `${p}-branch${i}`
        const bx = cx + Math.cos(a) * r - STICKY / 2
        const by = cy + Math.sin(a) * r - STICKY / 2
        out.push(sticky(id, bx, by, i === 0 ? "A branch" : "", (["blue", "green", "yellow", "red", "teal", "orange"] as const)[i]))
        const sx = cx + Math.cos(a) * 125, sy = cy + Math.sin(a) * 125
        const ex = cx + Math.cos(a) * (r - 120), ey = cy + Math.sin(a) * (r - 120)
        out.push(arrow(`${p}-link${i}`, sx, sy, ex - sx, ey - sy, { start: centre, end: id }))
      }
      return out
    },
  },
  {
    id: "lotus-blossom",
    name: "Lotus blossom",
    description: "A theme in the middle, eight ideas round it, and eight more round each.",
    category: "Brainstorming",
    keywords: "ideas expand",
    build: (p) => {
      const out: Skeleton[] = []
      const ids: string[] = []
      for (let i = 0; i < 9; i++) {
        const id = `${p}-n${i}`
        ids.push(id)
        const x = (i % 3) * (STICKY + GAP)
        const y = Math.floor(i / 3) * (STICKY + GAP)
        out.push(sticky(id, x, y, i === 4 ? "The theme" : "", i === 4 ? "purple" : "yellow"))
      }
      out.push({ type: "frame", id: `${p}-frame`, name: "Lotus blossom", children: ids })
      return out
    },
  },
  {
    id: "parking-lot",
    name: "Parking lot",
    description: "Ideas and questions to come back to, so the meeting stays on track.",
    category: "Brainstorming",
    keywords: "later backlog questions",
    build: (p) =>
      columns(p, [
        { name: "Ideas for later", colour: "yellow", notes: ["", "", ""] , perRow: 3 },
        { name: "Open questions", colour: "blue", notes: ["", "", ""], perRow: 3 },
      ]),
  },

  // ---- Strategy ------------------------------------------------------------
  {
    id: "lean-canvas",
    name: "Lean canvas",
    description: "A business on one page: problem, solution, customers, money.",
    category: "Strategy",
    keywords: "startup business model",
    build: (p) =>
      areas(p, [
        [
          { name: "Problem", colour: "red", notes: ["Top three problems", ""], perRow: 1 },
          { name: "Solution", colour: "green", notes: ["Top three features", ""], perRow: 1 },
          { name: "Unique value", colour: "purple", notes: ["Why you, in a line", ""], perRow: 1 },
          { name: "Unfair advantage", colour: "orange", notes: ["What can't be copied?", ""], perRow: 1 },
          { name: "Customers", colour: "blue", notes: ["Who has the problem?", ""], perRow: 1 },
        ],
        [
          { name: "Key metrics", colour: "teal", notes: ["What do you count?"], perRow: 1 },
          { name: "Channels", colour: "blue", notes: ["How do they find you?"], perRow: 1 },
          { name: "Costs", colour: "grey", notes: ["What does it cost?"], perRow: 1 },
          { name: "Revenue", colour: "green", notes: ["How does it earn?"], perRow: 1 },
        ],
      ]),
  },
  {
    id: "business-model-canvas",
    name: "Business model canvas",
    description: "Nine boxes from partners to revenue.",
    category: "Strategy",
    keywords: "bmc osterwalder",
    build: (p) =>
      areas(p, [
        [
          { name: "Key partners", colour: "purple", notes: [""], perRow: 1 },
          { name: "Key activities", colour: "blue", notes: [""], perRow: 1 },
          { name: "Value", colour: "red", notes: ["What do we offer?"], perRow: 1 },
          { name: "Relationships", colour: "teal", notes: [""], perRow: 1 },
          { name: "Customers", colour: "yellow", notes: [""], perRow: 1 },
        ],
        [
          { name: "Key resources", colour: "blue", notes: [""], perRow: 1 },
          { name: "Channels", colour: "teal", notes: [""], perRow: 1 },
          { name: "Costs", colour: "grey", notes: [""], perRow: 1 },
          { name: "Revenue", colour: "green", notes: [""], perRow: 1 },
        ],
      ]),
  },
  {
    id: "okrs",
    name: "OKRs",
    description: "An objective and the key results that show it's met.",
    category: "Strategy",
    keywords: "objectives key results goals quarter",
    build: (p) =>
      areas(p, [
        [{ name: "Objective", colour: "purple", notes: ["What do we want to achieve?"], perRow: 1 }],
        [
          { name: "Key result 1", colour: "blue", notes: ["A number that shows it"], perRow: 1 },
          { name: "Key result 2", colour: "blue", notes: [""], perRow: 1 },
          { name: "Key result 3", colour: "blue", notes: [""], perRow: 1 },
        ],
        [{ name: "Initiatives", colour: "yellow", notes: ["", "", ""], perRow: 3 }],
      ]),
  },
  {
    id: "now-next-later",
    name: "Now, next, later",
    description: "A roadmap without dates.",
    category: "Strategy",
    keywords: "roadmap priorities",
    build: (p) =>
      columns(p, [
        { name: "Now", colour: "green", notes: ["What we're doing", ""] },
        { name: "Next", colour: "blue", notes: ["What comes after", ""] },
        { name: "Later", colour: "grey", notes: ["What can wait", ""] },
      ], 1),
  },
  {
    id: "priority-matrix",
    name: "Priority matrix",
    description: "Urgent and important, two by two.",
    category: "Strategy",
    keywords: "eisenhower urgent important",
    build: (p) =>
      quadrants(p, [
        { name: "Do now: urgent, important", colour: "red", notes: ["", ""] },
        { name: "Plan: important, not urgent", colour: "blue", notes: ["", ""] },
        { name: "Hand off: urgent, not important", colour: "orange", notes: ["", ""] },
        { name: "Drop: neither", colour: "grey", notes: ["", ""] },
      ]),
  },
  {
    id: "impact-effort",
    name: "Impact and effort",
    description: "Quick wins, big bets, fill-ins and time sinks.",
    category: "Strategy",
    keywords: "prioritisation matrix value",
    build: (p) =>
      quadrants(p, [
        { name: "Quick wins: high impact, low effort", colour: "green", notes: ["", ""] },
        { name: "Big bets: high impact, high effort", colour: "blue", notes: ["", ""] },
        { name: "Fill-ins: low impact, low effort", colour: "yellow", notes: ["", ""] },
        { name: "Time sinks: low impact, high effort", colour: "red", notes: ["", ""] },
      ]),
  },
  {
    id: "moscow",
    name: "MoSCoW",
    description: "Must, should, could and won't have.",
    category: "Strategy",
    keywords: "prioritisation scope requirements",
    build: (p) =>
      columns(p, [
        { name: "Must have", colour: "red", notes: [""] },
        { name: "Should have", colour: "orange", notes: [""] },
        { name: "Could have", colour: "blue", notes: [""] },
        { name: "Won't have now", colour: "grey", notes: [""] },
      ], 1),
  },

  // ---- Research & product --------------------------------------------------
  {
    id: "empathy-map",
    name: "Empathy map",
    description: "What a person says, thinks, does and feels.",
    category: "Research & product",
    keywords: "user research persona ux",
    build: (p) =>
      quadrants(p, [
        { name: "Says", colour: "blue", notes: ["Quotes from them", ""] },
        { name: "Thinks", colour: "purple", notes: ["What's on their mind?", ""] },
        { name: "Does", colour: "green", notes: ["What they do", ""] },
        { name: "Feels", colour: "red", notes: ["What they worry about", ""] },
      ]),
  },
  {
    id: "persona",
    name: "User persona",
    description: "Who they are, what they need, what gets in their way.",
    category: "Research & product",
    keywords: "user research customer profile",
    build: (p) =>
      columns(p, [
        { name: "Who they are", colour: "purple", notes: ["Name, role, team", "A quote"] , perRow: 1 },
        { name: "Goals", colour: "green", notes: ["What they want", ""], perRow: 1 },
        { name: "Frustrations", colour: "red", notes: ["What gets in the way", ""], perRow: 1 },
        { name: "Tools they use", colour: "blue", notes: ["", ""], perRow: 1 },
      ]),
  },
  {
    id: "story-map",
    name: "User story map",
    description: "Activities across, the stories under each, sliced into releases.",
    category: "Research & product",
    keywords: "backlog stories releases agile",
    build: (p) => {
      const steps = ["Find it", "Try it", "Use it", "Share it"]
      const out: Skeleton[] = []
      const ids: string[] = []
      steps.forEach((s, si) => {
        const x = si * (STICKY + GAP)
        const id = `${p}-a${si}`
        ids.push(id)
        out.push(sticky(id, x, 0, s, "blue"))
        for (let r = 0; r < 2; r++) {
          const sid = `${p}-s${si}-${r}`
          ids.push(sid)
          out.push(sticky(sid, x, (STICKY + GAP) * (r + 1) + 40, r === 0 && si === 0 ? "A story" : "", "yellow"))
        }
      })
      out.push(heading(`${p}-release`, -260, STICKY + GAP + 40 + STICKY / 2 - 14, "Release 1", 22))
      ids.push(`${p}-release`)
      out.push({ type: "frame", id: `${p}-frame`, name: "Story map", children: ids })
      return out
    },
  },
  {
    id: "jobs-to-be-done",
    name: "Jobs to be done",
    description: "The job, the situation, the outcome they want.",
    category: "Research & product",
    keywords: "jtbd customer needs",
    build: (p) =>
      columns(p, [
        { name: "When…", colour: "blue", notes: ["The situation", ""], perRow: 1 },
        { name: "I want to…", colour: "purple", notes: ["The job", ""], perRow: 1 },
        { name: "So I can…", colour: "green", notes: ["The outcome", ""], perRow: 1 },
      ]),
  },
  {
    id: "fishbone",
    name: "Fishbone",
    description: "Every cause of a problem, by kind.",
    category: "Research & product",
    keywords: "ishikawa root cause analysis",
    build: (p) => {
      const kinds = ["People", "Process", "Tools", "Environment"]
      const out: Skeleton[] = []
      const problem = `${p}-problem`
      const spineY = STICKY * 2 + GAP * 4
      out.push(sticky(problem, 4 * (STICKY * 2 + GAP * 4), spineY - STICKY / 2, "The problem", "red"))
      out.push(arrow(`${p}-spine`, 0, spineY, 4 * (STICKY * 2 + GAP * 4) - 20, 0, { end: problem }))
      kinds.forEach((k, i) => {
        const top = i % 2 === 0
        const x = Math.floor(i / 2) * 2 * (STICKY * 2 + GAP * 4) + (top ? 0 : STICKY * 2 + GAP * 4)
        const ids = [`${p}-k${i}-0`, `${p}-k${i}-1`]
        const y = top ? 0 : spineY + GAP * 3
        out.push(sticky(ids[0], x, y, "", "yellow"), sticky(ids[1], x + STICKY + GAP, y, "", "yellow"))
        out.push({ type: "frame", id: `${p}-k${i}`, name: k, children: ids })
      })
      return out
    },
  },
  {
    id: "five-whys",
    name: "Five whys",
    description: "Ask why five times to reach the root cause.",
    category: "Research & product",
    keywords: "root cause analysis",
    build: (p) => {
      const out: Skeleton[] = []
      const ids: string[] = []
      const labels = ["The problem", "Why?", "Why?", "Why?", "Why?", "Root cause"]
      labels.forEach((l, i) => {
        const id = `${p}-w${i}`
        ids.push(id)
        out.push(sticky(id, i * (STICKY + GAP * 3), 0, l, i === 0 ? "red" : i === labels.length - 1 ? "green" : "yellow"))
        if (i > 0) out.push(arrow(`${p}-a${i}`, (i - 1) * (STICKY + GAP * 3) + STICKY + 6, STICKY / 2, GAP * 3 - 12, 0, { start: `${p}-w${i - 1}`, end: id }))
      })
      out.push({ type: "frame", id: `${p}-frame`, name: "Five whys", children: ids })
      return out
    },
  },
  {
    id: "assumption-map",
    name: "Assumption map",
    description: "What you believe, by how important and how known it is.",
    category: "Research & product",
    keywords: "risks hypotheses experiments validate",
    build: (p) =>
      quadrants(p, [
        { name: "Important, unknown: test first", colour: "red", notes: ["", ""] },
        { name: "Important, known", colour: "green", notes: ["", ""] },
        { name: "Less important, unknown", colour: "orange", notes: ["", ""] },
        { name: "Less important, known", colour: "grey", notes: ["", ""] },
      ]),
  },

  // ---- Planning ------------------------------------------------------------
  {
    id: "project-kickoff",
    name: "Project kickoff",
    description: "Goals, scope, people, risks and the first milestones.",
    category: "Planning",
    keywords: "kick-off launch charter",
    build: (p) =>
      areas(p, [
        [
          { name: "Why we're doing this", colour: "purple", notes: ["The goal, in a sentence"], perRow: 1 },
          { name: "What's in scope", colour: "green", notes: ["", ""], perRow: 1 },
          { name: "What's not", colour: "grey", notes: ["", ""], perRow: 1 },
        ],
        [
          { name: "Who does what", colour: "blue", notes: ["", ""], perRow: 1 },
          { name: "Risks", colour: "red", notes: ["", ""], perRow: 1 },
          { name: "Milestones", colour: "yellow", notes: ["", ""], perRow: 1 },
        ],
      ]),
  },
  {
    id: "weekly-planning",
    name: "Weekly planning",
    description: "The week's priorities, day by day.",
    category: "Planning",
    keywords: "week plan schedule",
    build: (p) =>
      columns(p, ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((d) => ({ name: d, colour: "yellow" as const, notes: [""] })), 1),
  },
  {
    id: "risk-register",
    name: "Risk register",
    description: "Each risk, how likely, how bad, and what we'll do.",
    category: "Planning",
    keywords: "risks mitigation",
    build: (p) =>
      columns(p, [
        { name: "Risk", colour: "red", notes: ["What could go wrong?", ""], perRow: 1 },
        { name: "Likelihood", colour: "orange", notes: ["", ""], perRow: 1 },
        { name: "Impact", colour: "purple", notes: ["", ""], perRow: 1 },
        { name: "What we'll do", colour: "green", notes: ["", ""], perRow: 1 },
      ]),
  },

  // ---- Meetings & workshops ------------------------------------------------
  {
    id: "workshop-agenda",
    name: "Workshop agenda",
    description: "The session's blocks in order, with time for each.",
    category: "Meetings & workshops",
    keywords: "agenda facilitation schedule",
    build: (p) =>
      columns(p, [
        { name: "Warm-up · 10 min", colour: "yellow", notes: [""] },
        { name: "Explore · 30 min", colour: "blue", notes: [""] },
        { name: "Decide · 20 min", colour: "purple", notes: [""] },
        { name: "Wrap-up · 10 min", colour: "green", notes: [""] },
      ], 1),
  },
  {
    id: "icebreaker",
    name: "Check-in",
    description: "One word each on how you're arriving.",
    category: "Meetings & workshops",
    keywords: "icebreaker warm up energiser",
    build: (p) =>
      columns(p, [{ name: "How are you arriving today?", colour: "teal", notes: ["One word each", "", "", "", "", ""], perRow: 3 }]),
  },
  {
    id: "standup",
    name: "Stand-up",
    description: "Yesterday, today, and what's in the way.",
    category: "Meetings & workshops",
    keywords: "daily scrum",
    build: (p) =>
      columns(p, [
        { name: "Yesterday", colour: "grey", notes: [""] },
        { name: "Today", colour: "blue", notes: [""] },
        { name: "In the way", colour: "red", notes: [""] },
      ], 1),
  },
  {
    id: "decision-log",
    name: "Decision log",
    description: "What was decided, why, and by whom.",
    category: "Meetings & workshops",
    keywords: "decisions record adr",
    build: (p) =>
      columns(p, [
        { name: "Decision", colour: "purple", notes: ["", ""], perRow: 1 },
        { name: "Why", colour: "blue", notes: ["", ""], perRow: 1 },
        { name: "Who and when", colour: "grey", notes: ["", ""], perRow: 1 },
      ]),
  },
  {
    id: "pre-mortem",
    name: "Pre-mortem",
    description: "Imagine it failed: why, and what we'll do now to stop it.",
    category: "Meetings & workshops",
    keywords: "risks premortem failure",
    build: (p) =>
      columns(p, [
        { name: "It failed because…", colour: "red", notes: ["", ""], perRow: 1 },
        { name: "Warning signs", colour: "orange", notes: ["", ""], perRow: 1 },
        { name: "What we'll do now", colour: "green", notes: ["", ""], perRow: 1 },
      ]),
  },
  {
    id: "one-on-one",
    name: "One-on-one",
    description: "Wins, blockers, growth and next steps.",
    category: "Meetings & workshops",
    keywords: "1:1 manager coaching",
    build: (p) =>
      quadrants(p, [
        { name: "Wins", colour: "green", notes: [""] },
        { name: "Blockers", colour: "red", notes: [""] },
        { name: "Growth", colour: "purple", notes: [""] },
        { name: "Next steps", colour: "blue", notes: [""] },
      ]),
  },
  {
    id: "team-charter",
    name: "Team charter",
    description: "Purpose, values, how we work and how we decide.",
    category: "Meetings & workshops",
    keywords: "working agreement norms values",
    build: (p) =>
      quadrants(p, [
        { name: "Our purpose", colour: "purple", notes: [""] },
        { name: "Our values", colour: "green", notes: [""] },
        { name: "How we work", colour: "blue", notes: [""] },
        { name: "How we decide", colour: "orange", notes: [""] },
      ]),
  },
]

/** Every template, the five the empty board offers first. */
export const ALL_BOARD_TEMPLATES: BoardTemplate[] = [...BOARD_TEMPLATES, ...LIBRARY]

/** A template by id. */
export function boardTemplate(id: string): BoardTemplate | undefined {
  return ALL_BOARD_TEMPLATES.find((t) => t.id === id)
}
