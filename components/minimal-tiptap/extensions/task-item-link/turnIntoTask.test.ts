import { afterEach, expect, it, vi } from "vitest"
import { Editor } from "@tiptap/core"
import { StarterKit } from "@tiptap/starter-kit"
import { TaskList } from "@tiptap/extension-task-list"
import { TaskItem } from "@tiptap/extension-task-item"

// ⌘⇧Enter in a doc that has drawn no chip yet, so nothing else has loaded the
// chips' kinds: the doc's project is still asked of the server. (It wasn't:
// the to-do asked which project instead, in a project's own doc.)

const DOC = "0d0c0000-0000-4000-8000-0000000000a1"
const PROJECT = "9e0c0000-0000-4000-8000-0000000000a2"
const TASK = "7a5c0000-0000-4000-8000-0000000000a3"

const asked: Array<{ kind: string; id: string }> = []
vi.mock("@/services/connectedService", () => ({
  MAX_REFS: 100,
  readEntities: vi.fn(async (refs: Array<{ kind: string; id: string }>) => {
    asked.push(...refs)
    return refs.map((r) =>
      r.kind === "doc"
        ? { ...r, access: "ok", data: { title: "Launch plan", space_kind: "project", space_id: PROJECT } }
        : { ...r, access: "ok", data: { name: "Launch", can_edit: true } },
    )
  }),
  todoToTask: vi.fn(async () => TASK),
  checkTodo: vi.fn(),
}))
vi.mock("@/components/docEditor/registry/commandBus", () => ({ busFor: () => ({ docId: DOC }) }))
const pickProject = vi.fn(async () => null)
vi.mock("../connected/pick", () => ({ pickProject: (...a: unknown[]) => pickProject(...(a as [])) }))
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }))

import { todoToTask } from "@/services/connectedService"
import { turnIntoTask } from "./turnIntoTask"

let editor: Editor | null = null
afterEach(() => editor?.destroy())

it("makes the task in the doc's own project, asked of the server, though no chip has been drawn yet", async () => {
  editor = new Editor({
    extensions: [StarterKit, TaskList, TaskItem.configure({ nested: true })],
    content: '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>Write the notes</p></li></ul>',
  })
  editor.commands.setTextSelection(4)

  await turnIntoTask(editor)

  expect(asked).toEqual([
    { kind: "doc", id: DOC },
    { kind: "project", id: PROJECT },
  ])
  expect(todoToTask).toHaveBeenCalledWith(DOC, PROJECT, "Write the notes")
  expect(pickProject).not.toHaveBeenCalled()
})
