"use client"

import { createContext, useContext } from "react"

import type { StatusOption } from "@/lib/taskStatus"
import type { TaskInfoInterface } from "@/types/task"

/**
 * What a card may ask of the board it sits on, without a prop through every
 * column (so a drag never renders a card for it): the columns a card can be
 * moved to from its menu (every drag has a menu alternative, Atlassian's
 * rule), and whether the board spans projects (My Tasks), where each card
 * wears its project's edge and tile. The value is made once per board.
 */
export interface BoardActions {
  /** The columns, in order. */
  columns: () => StatusOption[]
  /** Moves the card to the top of a column, as a drop there would. */
  moveTo: (task: TaskInfoInterface, column: string) => void
  /** Whether this person may move the card. */
  canMove: (task: TaskInfoInterface) => boolean
  /** Cards come from many projects: each shows its project. */
  crossProject: boolean
}

export const BoardActionsContext = createContext<BoardActions | null>(null)

export const useBoardActions = () => useContext(BoardActionsContext)
