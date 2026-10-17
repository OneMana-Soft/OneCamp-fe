"use client"

/**
 * The two lists at the foot of Home (hub.md H16, H17).
 *
 * JUMP BACK IN: the six things you opened last, as compact HubRows. The lead
 * follows design v3's identity rule: a person is their avatar, a project its
 * small tile, a task its status glyph, and a channel or a doc carries no hue
 * (a # or a page glyph in ink-3). Hovering offers "Open in split".
 *
 * CREATE: four tile buttons, each naming what it makes in a feature tile and
 * teaching its key.
 */
import Link from "next/link"
import { useDispatch, useSelector } from "react-redux"

import { HubRow, HubSectionHeader, HubToolButton } from "@/components/ui/hubRow"
import { Tile } from "@/components/ui/graphics/Tile"
import { Spark } from "@/components/ui/graphics/motifs"
import { CheckSquare, Columns2, FileText, MessageCircle, LayoutTemplate } from "@/lib/icons"
import { paneFromHref } from "@/lib/split"
import { relativeTime } from "@/lib/utils/relativeTime"
import { cn } from "@/lib/utils/helpers/cn"
import { openInSplit } from "@/store/slice/splitSlice"
import { openUI } from "@/store/slice/uiSlice"
import { useModKey } from "@/hooks/useModKey"
import type { RootState } from "@/store/store"
import { RecentMark, recentHue } from "@/components/ui/graphics/recentMark"

export function JumpBackIn({ className }: { className?: string }) {
  const dispatch = useDispatch()
  const items = useSelector((s: RootState) => s.recentItems.items)
  return (
    <section aria-labelledby="recent-title" className={className} data-jump-back-in="">
      <HubSectionHeader id="recent-title" title="Jump back in" action={<Link href="/app/search">Search</Link>} />
      {items.length > 0 ? (
        <div className="-mx-2.5">
          {items.slice(0, 6).map((item) => {
            const pane = paneFromHref(item.path)
            return (
              <HubRow
                key={`${item.type}-${item.id}`}
                as="a"
                href={item.path}
                density="compact"
                data-recent-type={item.type}
                data-hue={recentHue(item)}
                lead={<RecentMark item={item} />}
                title={item.title}
                meta={relativeTime(new Date(item.timestamp).toISOString())}
                tools={
                  pane ? (
                    <HubToolButton
                      label="Open in split"
                      onClick={(e) => {
                        e.preventDefault()
                        dispatch(openInSplit(pane))
                      }}
                    >
                      <Columns2 />
                    </HubToolButton>
                  ) : undefined
                }
              />
            )
          })}
        </div>
      ) : (
        // What YOU opened, not what happened: saying so stops the empty list
        // reading as a broken feed.
        <p className="py-2 text-ui text-ink-2">Nothing opened yet. Channels, docs and tasks you visit appear here.</p>
      )}
    </section>
  )
}

// A container, so its key hint can give way: at 1024 beside the sidebar a
// tile's content box is about 120px, and "Ctrl J" (the hub's Ctrl-not-⌘ fix)
// cut "Ask AI" to "As…". Below 136px of content (the tile, its label and
// "Ctrl J") the label keeps the room and the hint goes; at 1440 (156px) the
// hints stay.
const TILE_BUTTON =
  "@container group/tile flex h-14 items-center gap-2.5 rounded-lg bg-sheet px-3 text-left shadow-e1 transition-[box-shadow,translate] duration-[140ms] hover:-translate-y-px hover:shadow-e2 active:translate-y-[0.5px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand aria-pressed:shadow-e2 dark:bg-[#18191C]"

function CreateButton({
  tile,
  label,
  kbd,
  onClick,
  pressed,
}: {
  tile: React.ReactNode
  label: string
  kbd?: string
  onClick: () => void
  pressed?: boolean
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={pressed} className={TILE_BUTTON} data-create-tile={label}>
      {tile}
      <span className="min-w-0 flex-1 truncate text-ui font-medium">{label}</span>
      {pressed ? <span className="chip h-[18px] px-1.5 text-micro">Open</span> : kbd ? <span data-kbd-hint="" className="kbd @max-[8.5rem]:hidden">{kbd}</span> : null}
    </button>
  )
}

export function CreateTiles({ aiAvailable, aiOpen, onToggleAI, className }: { aiAvailable: boolean; aiOpen: boolean; onToggleAI: () => void; className?: string }) {
  const dispatch = useDispatch()
  // The key that opens the AI here: Ctrl J off a Mac, as the sidebar says it.
  const mod = useModKey()
  return (
    <section aria-labelledby="create-title" className={className} data-create="">
      <HubSectionHeader id="create-title" title="Create" />
      <div className={cn("grid grid-cols-2 gap-2.5")}>
        <CreateButton
          tile={
            <Tile hue="moss" size="sm" className="size-7 rounded-lg">
              <CheckSquare />
            </Tile>
          }
          label="Task"
          kbd="C"
          onClick={() => dispatch(openUI({ key: "createTask" }))}
        />
        <CreateButton
          tile={
            <Tile hue="dusk" size="sm" className="size-7 rounded-lg">
              <FileText />
            </Tile>
          }
          label="Doc"
          kbd="⇧D"
          onClick={() => dispatch(openUI({ key: "createDoc" }))}
        />
        <CreateButton
          tile={
            <Tile hue="sky" size="sm" className="size-7 rounded-lg">
              <LayoutTemplate />
            </Tile>
          }
          label="Project"
          onClick={() => dispatch(openUI({ key: "createProject", data: { templateId: "client-project" } }))}
        />
        {aiAvailable ? (
          <CreateButton
            tile={
              <span className="grid size-7 place-items-center rounded-lg bg-agent-muted text-agent">
                <Spark className="size-3.5" />
              </span>
            }
            label="Ask AI"
            kbd={mod === "⌘" ? "⌘J" : `${mod} J`}
            pressed={aiOpen}
            onClick={onToggleAI}
          />
        ) : (
          <CreateButton
            tile={
              <Tile hue="lake" size="sm" className="size-7 rounded-lg">
                <MessageCircle />
              </Tile>
            }
            label="Message"
            onClick={() => dispatch(openUI({ key: "createChatMessage" }))}
          />
        )}
      </div>
    </section>
  )
}
