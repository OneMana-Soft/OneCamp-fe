/**
 * A card dragged by a pointer or a finger on a board (dnd-kit): where the
 * board scrolls while the card is held, and what a screen reader hears. The
 * table's board reads these; the project board keeps its own scroll settings
 * (TaskBoard.tsx) until both share one drag hook.
 */
import type { Announcements, AutoScrollOptions, UniqueIdentifier } from "@dnd-kit/core"

/**
 * Scroll only at the very edge, and only the board's own scrollers (marked
 * data-board-scroll), never the page. dnd-kit starts within 20% of a
 * scroller's edge by default: about 250 px on a board, so a lane near the
 * edge slid away while a card was held over it, and the card landed several
 * lanes on. At 390 px the next lane starts inside that band.
 */
export const BOARD_AUTO_SCROLL: AutoScrollOptions = {
  canScroll: (element) => element instanceof HTMLElement && element.dataset.boardScroll !== undefined,
  threshold: { x: 0.06, y: 0.1 },
  acceleration: 8,
}

/** What a board calls the things a drag moves: a card by its title, a lane by its name, and the lane a card is in now. */
export interface BoardNames {
  card: (id: UniqueIdentifier) => string
  lane: (id: UniqueIdentifier) => string
  laneOf: (cardId: UniqueIdentifier) => UniqueIdentifier | undefined
}

/**
 * What a screen reader hears through a drag, in the words a board's keys use:
 * the card's title and the lanes' names. dnd-kit's own read raw ids ("Picked
 * up draggable item 6c0f…"). Pure.
 */
export function boardAnnouncements(names: BoardNames): Announcements {
  return {
    onDragStart: ({ active }) => {
      const from = names.laneOf(active.id)
      return `Picked up ${names.card(active.id)}${from === undefined ? "" : `, in ${names.lane(from)}`}.`
    },
    onDragOver: ({ over }) => (over ? names.lane(over.id) : "Not over a lane."),
    onDragEnd: ({ active, over }) => {
      if (!over) return "Put back where it was."
      return over.id === names.laneOf(active.id) ? `Put back in ${names.lane(over.id)}.` : `Moved to ${names.lane(over.id)}.`
    },
    onDragCancel: () => "Put back where it was.",
  }
}
