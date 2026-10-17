import { versionElements } from "./materialize"
import type { SliceOptions } from "./slices"

export interface RenderStats {
  blocks: number
  ms: number
  slices: number
  longestSliceMs: number
}

/** About a screen and a half of blocks: painted in the first slice. */
export const FIRST_BLOCKS = 40

/** Where a render puts its blocks: the preview, or a stage it is held in (VersionPreview keeps the reader's place). */
export type RenderTarget = Pick<HTMLElement, "replaceChildren" | "append">

/**
 * A version, read-only, into `container`: its blocks as the editor draws
 * them, the first screen at once and the rest slice by slice. The caller
 * aborts it (its signal) when another version is chosen. `key` is the
 * version's id, so reading it again is a copy, not another sanitising pass.
 */
export async function renderVersion(
  container: RenderTarget,
  html: string,
  opts: SliceOptions & { key?: string; firstBlocks?: number } = {},
): Promise<RenderStats> {
  const t0 = performance.now()
  performance.mark("history-render-start")
  container.replaceChildren()
  const { elements, stats } = await versionElements(html, {
    ...opts,
    firstBlocks: opts.firstBlocks ?? FIRST_BLOCKS,
    onGroup: (els) => container.append(...els),
  })
  performance.mark("history-render-end")
  return { blocks: elements.length, ms: performance.now() - t0, ...stats }
}
