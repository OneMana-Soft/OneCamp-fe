"use client"

import { useDispatch, useSelector } from "react-redux"
import { selectSplit } from "@/hooks/useSplitView"
import { focusView } from "@/hooks/useOpenBeside"
import { setActive } from "@/store/slice/splitActions"
import { MAIN, MAIN_KEY, paneKey } from "@/lib/split"
import { viewRow } from "@/lib/splitLayout"
import { useViewLook } from "@/components/split/paneLook"
import { WithTooltip } from "@/components/common/withTooltip"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuShortcut, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

type Tucked = { id: string; n: number; onShow: (key: string) => void }

/** The first view tucked away: a raised tab with its name and its number. */
function TuckedChip({ id, n, onShow }: Tucked) {
  const { name, icon: Icon } = useViewLook(id)
  return (
    <WithTooltip label={`Bring back ${name}`}>
      <button type="button" onClick={() => onShow(id)} aria-label={`Bring back ${name}`} className="split-tucked-chip">
        <Icon className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden="true" />
        <span className="truncate">{name}</span>
        <kbd className="kbd pointer-events-none">{n}</kbd>
      </button>
    </WithTooltip>
  )
}

/** One more, in the "+N" menu. */
function TuckedItem({ id, n, onShow }: Tucked) {
  const { name, icon: Icon } = useViewLook(id)
  return (
    <DropdownMenuItem onClick={() => onShow(id)}>
      <Icon className="text-ink-3" aria-hidden="true" />
      <span className="truncate">Bring back {name}</span>
      <DropdownMenuShortcut>{n}</DropdownMenuShortcut>
    </DropdownMenuItem>
  )
}

/**
 * The views tucked away for want of width (split view's rule T: a narrow
 * window, the right panel open beside, a tablet in portrait), as tabs in the
 * rightmost view's bar, or the page's corner: a raised tab with the view's
 * name and its number (Ctrl+Alt+that number brings it too), and past one,
 * "+N" with a menu of the rest. One brings its view back: it becomes the view
 * the keys act on, so it shows, and the least recently used one on screen
 * tucks in its place. Nothing tucked is closed: its scroll, its draft and a
 * call in it carry on.
 */
export function TuckedViews({ keys }: { keys: string }) {
  const dispatch = useDispatch()
  const { panes, order } = useSelector(selectSplit)
  const viewOf = (key: string) => (key === MAIN_KEY ? MAIN : panes.findIndex((p) => paneKey(p) === key))
  const row = viewRow(panes, order)
  const show = (key: string) => {
    const view = viewOf(key)
    dispatch(setActive(view))
    requestAnimationFrame(() => focusView(view))
  }
  const [first, ...rest] = keys.split(",")
  const count = rest.length + 1
  return (
    <div role="group" aria-label={`${count} more ${count === 1 ? "view" : "views"}, tucked away`} data-split-tucked="" className="relative ml-1 flex min-w-0 items-center gap-1.5">
      <TuckedChip id={first} n={row.indexOf(viewOf(first)) + 1} onShow={show} />
      {rest.length > 0 && (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label={`${rest.length} more tucked away`} className="split-tucked-chip tabular-nums">
              +{rest.length}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="pop-surface w-60 p-1">
            {rest.map((key) => (
              <TuckedItem key={key} id={key} n={row.indexOf(viewOf(key)) + 1} onShow={show} />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
