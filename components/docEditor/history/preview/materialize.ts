import { snapshotHtml } from "@/components/docEditor/snapshotHtml"
import { carryBlockIds, restoreBlockIds, topLevelBlocks, type RawBlock } from "./blocks"
import { slicer, type SliceOptions, type SliceStats } from "./slices"

/**
 * Some blocks as elements, made safe and dressed the way the editor dresses
 * them (A1's snapshotHtml, the saved copy's own sanitiser), with their ids
 * back on them (blocks.ts carries them through). Each block goes in a bare
 * <div> before sanitising, so a block the sanitiser drops (an embed it doesn't
 * allow) leaves a placeholder and every index still names the same block.
 */
function materializeGroup(blocks: RawBlock[]): HTMLElement[] {
  const template = document.createElement("template")
  template.innerHTML = snapshotHtml(blocks.map((b) => `<div>${carryBlockIds(b.html)}</div>`).join(""))
  const wrappers = Array.from(template.content.children)
  return blocks.map((_, k) => {
    const wrapper = wrappers[k]
    let el = wrapper?.firstElementChild as HTMLElement | null
    if (!el || wrapper.childNodes.length !== 1) {
      // Loose text, or a block the sanitiser emptied: a paragraph holding what is left.
      el = document.createElement("p")
      if (wrapper) el.append(...Array.from(wrapper.childNodes))
    }
    restoreBlockIds(el)
    return el
  })
}

/**
 * How many blocks one sanitiser call takes: it starts small and grows or
 * shrinks to cost about GROUP_MS, so a group never outlasts a slice on a slow
 * phone (40 at a time took 33 ms at 4x CPU) and a fast one isn't paying a
 * call per few blocks.
 */
const GROUP_MS = 3
const MIN_GROUP = 4
const MAX_GROUP = 80

/**
 * Every block of a body, read and made group by group in time slices;
 * `onGroup` sees each group as it is made. The first `firstBlocks` go in the
 * first slice whatever they cost, so the first screen paints at once.
 */
async function materialize(
  html: string,
  opts: SliceOptions & { firstBlocks?: number; onGroup?: (els: HTMLElement[]) => void } = {},
): Promise<{ elements: HTMLElement[]; stats: SliceStats }> {
  const s = slicer(opts)
  const blocks = topLevelBlocks(html)
  const elements: HTMLElement[] = []
  let size = opts.firstBlocks || MIN_GROUP
  let first = true
  for (;;) {
    s.check()
    const group: RawBlock[] = []
    while (group.length < size) {
      const next = blocks.next()
      if (next.done) break
      group.push(next.value)
    }
    if (!group.length) break
    const t = performance.now()
    const els = materializeGroup(group)
    const took = performance.now() - t
    const scaled = took > GROUP_MS * 1.5 ? size / 2 : took < GROUP_MS / 2 ? size * 2 : size
    size = first ? 10 : Math.max(MIN_GROUP, Math.min(MAX_GROUP, Math.round(scaled)))
    first = false
    elements.push(...els)
    opts.onGroup?.(els)
    s.shown(els.length)
    if (!s.tick()) await s.next()
  }
  return { elements, stats: s.done() }
}

/**
 * Versions already made, by key (a version's id: its body never changes), so
 * reading one again, or turning its changes on, copies elements rather than
 * sanitising the body again. A few at most.
 */
const made = new Map<string, HTMLElement[]>()
const KEEP = 4

function madeVersion(key: string | undefined): HTMLElement[] | undefined {
  if (!key) return undefined
  const els = made.get(key)
  if (els) {
    made.delete(key)
    made.set(key, els)
  }
  return els
}

function keep(key: string, els: HTMLElement[]) {
  made.set(key, els)
  while (made.size > KEEP) made.delete(made.keys().next().value as string)
}

/** Forgets what was made (tests). */
export function forgetMadeVersions(): void {
  made.clear()
}

/** Copies a known version's blocks per slice: copying is fast, styling them is not. */
const COPY_GROUP = 50

/**
 * A version's blocks as fresh elements, the caller's to change or show:
 * copied, slice by slice, when the version was made before; made otherwise.
 */
export async function versionElements(
  html: string,
  opts: SliceOptions & { key?: string; firstBlocks?: number; onGroup?: (els: HTMLElement[]) => void } = {},
): Promise<{ elements: HTMLElement[]; stats: SliceStats }> {
  const known = madeVersion(opts.key)
  if (known) {
    const s = slicer(opts)
    const elements: HTMLElement[] = []
    let i = 0
    while (i < known.length) {
      s.check()
      const to = Math.min(known.length, i + (i === 0 ? Math.max(COPY_GROUP, opts.firstBlocks ?? 0) : COPY_GROUP))
      const els = known.slice(i, to).map((el) => el.cloneNode(true) as HTMLElement)
      elements.push(...els)
      opts.onGroup?.(els)
      s.shown(els.length)
      i = to
      if (i < known.length && !s.tick()) await s.next()
    }
    return { elements, stats: s.done() }
  }
  if (!opts.key) return materialize(html, opts)
  // The caller gets copies, made group by group in the same slices: the kept
  // elements are never shown, so nothing a diff marks reaches them.
  const handed: HTMLElement[] = []
  const result = await materialize(html, {
    ...opts,
    onGroup: (els) => {
      const copies = els.map((el) => el.cloneNode(true) as HTMLElement)
      handed.push(...copies)
      opts.onGroup?.(copies)
    },
  })
  keep(opts.key, result.elements)
  return { elements: handed, stats: result.stats }
}
