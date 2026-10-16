"use client"

/**
 * What connected work adds to a doc's editor (docs programme C1), in one chunk
 * fetched with the doc's other blocks (register.ts): pages, dates, a
 * project's tasks and board, to-dos that are tasks, "[[" and what the "@"
 * list offers in a doc beyond people. The views of the blocks load when one
 * first shows.
 */

export { Subpage } from "../subpage/subpage"
export { DateMention } from "../date-mention/dateMention"
export { TaskListEmbed } from "../task-list-embed/taskListEmbed"
export { BoardEmbed } from "../board-embed/boardEmbed"
export { TaskItemLink } from "../task-item-link/taskItemLink"
export { PageLink } from "../reference-mention/pageLink"
export { MentionInDoc } from "../mention-list/mentionInDoc"

// Its "/" entries, the to-do's action and the pickers, added as the chunk
// loads: before a doc's editor is built, so they are there when it is.
import "./contrib"
