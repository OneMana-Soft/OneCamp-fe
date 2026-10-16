/**
 * Two versions of a long doc, for the history sheet's weight (B8, G-PERF): the
 * fluidity script's 2,000-block mix (scripts/fluidity/fakeCollab.mjs
 * bigDocBlocks: paragraphs of about 40 words with bold and a link, a heading
 * every 40 blocks, lists, checklists, quotes, code), at any length, every
 * block with its id at every depth, as the collaboration service saves them.
 *
 * The second version is the first with what a busy day does to it: words
 * changed in one paragraph in 50, an item changed in one list in 20, a block
 * removed in 211, one added in 307, and one block moved a long way.
 */

const WORDS = "launch plan pilot review owners dates checklist pricing page customers notes risks board sign off phone app comments budget team week quarter goals copy draft final ship".split(" ")

function words(seed: number, count: number): string {
  const out: string[] = []
  for (let k = 0; k < count; k++) out.push(WORDS[(seed * 7 + k * 13) % WORDS.length])
  return out.join(" ")
}

function block(i: number, edited: boolean): string {
  const id = `blk-${i}`
  const name = `Block ${String(i + 1).padStart(4, "0")}`
  const touched = edited && i % 50 === 3
  if (i % 40 === 0) return `<h2 data-block-id="${id}">${name} section heading</h2>`
  if (i % 10 === 5) {
    const items = [`${name} ${words(i, 8)}`, words(i + 1, 10), edited && i % 20 === 5 ? `${words(i + 2, 6)} and one more thing` : words(i + 2, 6)]
    return `<ul data-block-id="${id}">${items.map((t, k) => `<li data-block-id="${id}-li${k}"><p data-block-id="${id}-p${k}">${t}</p></li>`).join("")}</ul>`
  }
  if (i % 15 === 7) {
    const item = (t: string, checked: boolean, k: number) =>
      `<li data-type="taskItem" data-checked="${checked}" data-block-id="${id}-t${k}"><label><input type="checkbox"${checked ? ' checked="checked"' : ""}><span></span></label><div><p data-block-id="${id}-tp${k}">${t}</p></div></li>`
    return `<ul data-type="taskList" data-block-id="${id}">${item(`${name} ${words(i, 9)}`, i % 2 === 1, 0)}${item(words(i + 3, 7), false, 1)}</ul>`
  }
  if (i % 100 === 50) return `<pre data-block-id="${id}"><code class="language-js">// ${name}\nconst due = plan.steps.filter((s) =&gt; s.late)\nconsole.log(due.length)</code></pre>`
  if (i % 25 === 12) return `<blockquote data-block-id="${id}"><p data-block-id="${id}-q">${name} ${words(i, 20)}</p></blockquote>`
  const lead = touched ? `${name} ${words(i + 9, 35)}` : `${name} ${words(i, 35)}`
  return `<p data-block-id="${id}">${lead}. <strong>${words(i + 4, 3)}</strong> and <a href="https://example.com">${words(i + 5, 2)}</a>.</p>`
}

/** A version of `n` blocks; `edited` is the later one. */
export function bigVersion(n: number, edited = false): string {
  const out: string[] = []
  const moved = Math.floor(n / 5)
  for (let i = 0; i < n; i++) {
    if (edited && i === moved) continue
    if (edited && i % 211 === 100) continue
    out.push(block(i, edited))
    if (edited && i % 307 === 150) out.push(`<p data-block-id="new-${i}">A new paragraph after ${i}: ${words(i + 11, 18)}.</p>`)
    if (edited && i === Math.floor((n * 3) / 5)) out.push(block(moved, edited))
  }
  return out.join("")
}
