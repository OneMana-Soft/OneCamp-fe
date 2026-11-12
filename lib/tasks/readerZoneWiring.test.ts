import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

// J-F WEB: a formula's TODAY() is the reader's day, so every read that lays
// formula values over tasks asks in the reader's zone (?tz=): the list, the
// table, the board, the panel and the task page (the report's read already
// does, lib/reports reportKey). The zone rides the request, never the key:
// a task's cache key is changed in twenty places and the offline store keys
// by address.
const READS: [file: string, read: RegExp][] = [
  ["components/project/projectTaskList.tsx", /GetProjectTaskList \+[\s\S]{0,400}inReaderZone\(/],
  ["components/project/projectTaskTable.tsx", /GetProjectTaskList\}[\s\S]{0,400}inReaderZone\(/],
  ["components/project/projectTaskKanban.tsx", /GetProjectTaskListForKanban\}[\s\S]{0,400}inReaderZone\(/],
  ["hooks/useProjectBoard.ts", /GetProjectTaskListForKanban\}[\s\S]{0,200}inReaderZone\(/],
  ["components/rightPanel/taskInfoPanel.tsx", /useFetch<[^\n]*GetTaskInfo\}[\s\S]{0,1500}inReaderZone\(/],
  ["hooks/useTask.ts", /GetTaskInfo\}[\s\S]{0,200}inReaderZone\(/],
]

describe("task reads in the reader's zone", () => {
  it.each(READS)("%s asks its read in the reader's zone", (file, read) => {
    expect(readFileSync(file, "utf8")).toMatch(read)
  })
})
