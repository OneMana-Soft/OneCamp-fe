// Icons a doc's title suggests (small-details V22: beyond Notion's random), and
// the title its body suggests (T4). Pure.

/** Words a title is made of, and the emoji they bring to mind. */
const WORDS: [RegExp, string[]][] = [
  [/\b(launch|launches|release|releases|ship|shipping)\b/, ["🚀", "📦"]],
  [/\b(roadmap|plan|plans|planning|strategy)\b/, ["🗺️", "🧭"]],
  [/\b(meeting|meetings|standup|sync|agenda|1:1|one-on-one)\b/, ["📅", "🗓️"]],
  [/\b(notes?|journal|log)\b/, ["📝", "🗒️"]],
  [/\b(rfc|spec|specs|proposal|design doc)\b/, ["📐", "📄"]],
  [/\b(design|brand|ui|ux)\b/, ["🎨", "✏️"]],
  [/\b(bug|bugs|issue|issues)\b/, ["🐛", "🔧"]],
  [/\b(incident|outage|postmortem|post-mortem)\b/, ["🚨", "🧯"]],
  [/\b(retro|retrospective)\b/, ["🔁", "🪞"]],
  [/\b(hiring|recruiting|interview|interviews|candidate)\b/, ["🤝", "🎤"]],
  [/\b(onboarding|welcome|start here)\b/, ["👋", "🏁"]],
  [/\b(budget|finance|invoice|invoices|pricing|costs?)\b/, ["💰", "🧾"]],
  [/\b(marketing|campaign|launch post|newsletter)\b/, ["📣", "✉️"]],
  [/\b(sales|deal|deals|pipeline|revenue)\b/, ["📈", "💼"]],
  [/\b(metrics|kpis?|report|reports|dashboard|analytics)\b/, ["📊", "📈"]],
  [/\b(goals?|okrs?|objectives?|targets?)\b/, ["🎯", "🏆"]],
  [/\b(research|study|experiment|experiments)\b/, ["🔬", "🧪"]],
  [/\b(ideas?|brainstorm|brainstorming)\b/, ["💡", "🧠"]],
  [/\b(checklist|todo|to-do|tasks?)\b/, ["✅", "☑️"]],
  [/\b(handbook|guide|manual|how-to|howto|playbook)\b/, ["📘", "📗"]],
  [/\b(wiki|docs|knowledge|faq)\b/, ["📚", "❓"]],
  [/\b(policy|policies|rules|terms)\b/, ["📜", "⚖️"]],
  [/\b(security|access|passwords?|secrets?)\b/, ["🔒", "🛡️"]],
  [/\b(legal|contract|contracts|agreement)\b/, ["⚖️", "📄"]],
  [/\b(travel|trip|offsite|off-site)\b/, ["✈️", "🧳"]],
  [/\b(event|events|party|celebration|launch party)\b/, ["🎉", "🎈"]],
  [/\b(customer|customers|client|clients|account)\b/, ["🤝", "💬"]],
  [/\b(support|help|helpdesk)\b/, ["🛟", "💬"]],
  [/\b(feedback|survey|reviews?)\b/, ["💬", "🗳️"]],
  [/\b(weekly|daily|monthly|quarterly|q[1-4])\b/, ["🗓️", "📆"]],
  [/\b(api|code|engineering|backend|frontend|infra|infrastructure)\b/, ["💻", "⚙️"]],
  [/\b(data|database|schema|sql)\b/, ["🗄️", "📊"]],
  [/\b(team|teams|people|org)\b/, ["👥", "🧑‍🤝‍🧑"]],
  [/\b(learning|course|training|lessons?)\b/, ["🎓", "📖"]],
  [/\b(product|features?|prd)\b/, ["🧩", "📦"]],
]

/** Emoji a fresh page can wear when its title brings none to mind: calm, not silly. */
export const FRESH = ["📘", "📗", "📙", "📝", "🗂️", "🧭", "🌱", "🪴", "✨", "🔖", "🧩", "🗒️", "💡", "🎯", "🌤️", "🪐"]

/** Up to max emoji the title suggests, the strongest first, none repeated. */
export function suggestIcons(title: string, max = 4): string[] {
  const t = ` ${title.toLowerCase()} `
  const out: string[] = []
  for (const [re, icons] of WORDS) {
    if (!re.test(t)) continue
    for (const i of icons) if (!out.includes(i)) out.push(i)
    if (out.length >= max) break
  }
  return out.slice(0, max)
}

/** One icon for "Add icon": the title's first suggestion, else a fresh one. */
export function iconFor(title: string, random: () => number = Math.random): string {
  return suggestIcons(title, 1)[0] ?? FRESH[Math.floor(random() * FRESH.length) % FRESH.length]
}

/** A random emoji other than the one the page has (the picker's Random). */
export function randomIcon(current: string | undefined, random: () => number = Math.random): string {
  const pool = FRESH.filter((i) => i !== current)
  return pool[Math.floor(random() * pool.length) % pool.length]
}

/**
 * The title a body suggests (T4): its first line with words in it, among the
 * first few blocks, trimmed to what a title holds. Empty when there's none.
 */
export function titleFromLines(lines: string[], max = 80): string {
  for (const raw of lines.slice(0, 3)) {
    const line = raw.replace(/\s+/g, " ").trim()
    if (!/[\p{L}\p{N}]/u.test(line)) continue
    if (line.length <= max) return line
    const cut = line.slice(0, max)
    const at = cut.lastIndexOf(" ")
    return `${(at > max / 2 ? cut.slice(0, at) : cut).trimEnd()}…`
  }
  return ""
}
