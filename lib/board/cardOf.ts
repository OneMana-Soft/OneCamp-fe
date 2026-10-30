/** A task's card on the board, by its id. */
export function cardOf(board: HTMLElement | null | undefined, taskId: string): HTMLElement | undefined {
  return Array.from(board?.querySelectorAll<HTMLElement>("[data-task-id]") ?? []).find((c) => c.dataset.taskId === taskId)
}

/**
 * The element the drop measures for the board's shared draggable (TaskBoard's
 * measuring). A card dropped into another list or lane is a new element there
 * and the pressed one is gone: a detached element's rect is all zeros, and the
 * drop flew the copy to the screen's top-left corner. A detached one is that
 * task's card where it is now: the bound node is the card's wrapper (Item's
 * ref), with data-task-id on the card inside it. Anything else is itself.
 */
export function measuredCard(board: HTMLElement | null | undefined, element: HTMLElement): HTMLElement {
  if (element.isConnected) return element
  const id = element.dataset.taskId ?? element.querySelector<HTMLElement>("[data-task-id]")?.dataset.taskId
  return (id && cardOf(board, id)) || element
}
