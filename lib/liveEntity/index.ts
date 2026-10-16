/**
 * Live Entity Chips (docs programme §4 #21): the one entry. Importing it
 * registers the kinds docs draw (pages, tasks, projects, people and dates);
 * another area registers its own with registerEntityKind and draws any kind
 * with components/liveEntity/EntityChip.
 */

import "./kinds"

export { registerEntityKind, entityKind } from "./registry"
export { useLiveEntity } from "./useLiveEntity"
export { readNow, refreshEntity, snapshot } from "./store"
export { useToday } from "./today"
export { followHref, onMiddleClick } from "./follow"
export { openTask } from "./kinds"
export type * from "./types"
export type { DateChipData, DocChipData, PersonChipData, ProjectChipData, TaskChipData } from "./kinds"
