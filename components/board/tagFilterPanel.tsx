"use client"

// Filter by tag's panel (miro-07 5): the board's tags to pick from, and, pinned under them once a tag is picked, how
// many notes stay, Clear and Select these. Its own module, loaded when the panel first opens; the veil and the pill
// (components/board/tagFilter) stay with the board, since a filter outlives its panel.

import * as React from "react"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { useSceneElements } from "@/hooks/useSceneElements"
import { ToggleChip } from "@/components/ui/toggleChip"
import { HueDot } from "@/components/ui/chip"
import { Button } from "@/components/ui/button"
import { boardTags, tagKey, tagKeys, withoutTag } from "@/lib/board/sticky"
import { notesTagged } from "@/lib/board/tagFilter"
import { BoardSidePanel } from "@/components/board/boardSidePanel"
import type { SceneElement } from "@/components/board/boardOps"
import type { TagHues } from "@/components/board/tagHues"

export default function TagFilterPanel({
  api,
  tags,
  onTags,
  tagHues,
  editable,
  onClose,
}: {
  api: ExcalidrawImperativeAPI
  /** The tags filtered by, as picked. */
  tags: readonly string[]
  onTags: (tags: string[]) => void
  tagHues: TagHues
  /** Selecting is an editor's: a viewer's board has no selection. */
  editable: boolean
  onClose: () => void
}) {
  const all = useSceneElements<SceneElement>(api)
  const known = React.useMemo(() => boardTags(all), [all])
  const kept = React.useMemo(() => notesTagged(all, tags), [all, tags])
  const on = tagKeys(tags)
  const toggle = (tag: string) => {
    onTags(on.has(tagKey(tag)) ? withoutTag(tags, tag) : [...tags, tag])
  }
  // The notes kept, selected and in view: the notes bar is then theirs. A phone's sheet steps aside for them.
  const select = (sheet: boolean) => {
    const ids = new Set(kept.map((n) => n.id))
    api.updateScene({ appState: { selectedElementIds: Object.fromEntries(kept.map((n) => [n.id, true as const])) } })
    api.scrollToContent(api.getSceneElements().filter((e) => ids.has(e.id)), { fitToContent: true, animate: true })
    if (sheet) onClose()
  }

  // Once a tag is picked: how many notes stay, Clear, and Select these. Full-size on a phone, under the count.
  const footer = (sheet: boolean) =>
    tags.length > 0 && (
      <div data-tag-filter-foot="" className={sheet ? "flex flex-col gap-2" : "flex items-center gap-2"}>
        <p className={sheet ? "text-meta tabular-nums text-ink-2" : "flex-1 text-meta tabular-nums text-ink-2"} role="status">
          {kept.length === 1 ? "1 note" : `${kept.length} notes`}
        </p>
        <div className={sheet ? "flex gap-2" : "contents"}>
          <Button variant={sheet ? "secondary" : "ghost"} size={sheet ? "lg" : "sm"} className={sheet ? "h-11 flex-1" : undefined} onClick={() => onTags([])}>
            Clear
          </Button>
          {editable && kept.length > 0 && (
            <Button variant={sheet ? "default" : "secondary"} size={sheet ? "lg" : "sm"} className={sheet ? "h-11 flex-1" : undefined} onClick={() => select(sheet)}>
              Select these
            </Button>
          )}
        </div>
      </div>
    )

  return (
    <BoardSidePanel name="Filter by tag" closeLabel="Close Filter by tag" detent="medium" footer={footer} onClose={onClose} data-tag-filter="">
      {known.length === 0 ? (
        <p className="px-1.5 py-2 text-ui-sm text-ink-3">No tags on this board yet. Tag notes from the notes bar.</p>
      ) : (
        <>
          <p className="px-1.5 text-meta text-ink-3">Notes without these tags fade back, on your screen only.</p>
          <ul aria-label="Filter by these tags" data-touch-group="24" className="mt-[var(--touch-gap,0.5rem)] flex flex-wrap gap-1 px-1.5">
            {known.map(({ tag, count }) => (
              <li key={tag}>
                <ToggleChip tone="neutral" pressed={on.has(tagKey(tag))} onPressedChange={() => toggle(tag)} title={count === 1 ? "1 note" : `${count} notes`}>
                  <HueDot hue={tagHues.hueOf(tag)} />
                  {tag}
                  <span aria-hidden="true" className="tabular-nums text-ink-3">
                    {count}
                  </span>
                </ToggleChip>
              </li>
            ))}
          </ul>
        </>
      )}
    </BoardSidePanel>
  )
}
