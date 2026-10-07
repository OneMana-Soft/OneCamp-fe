import { describe, expect, it } from "vitest"
import { appliedNotice, previewLine, readTemplateFile, taskCount, templateFile, templateFileName, TemplateFileError, type ProjectTemplate } from "./projectTemplates"

const tpl: ProjectTemplate = {
  id: "0b6b5f0e-0000-4000-8000-000000000000",
  name: "Client project",
  description: "Kickoff to invoice.",
  statuses: [{ name: "Client review", category: "inReview", color: "amber" }],
  tasks: [{ name: "Kickoff call", due_day: 1, subtasks: [{ name: "Agenda" }] }],
}

describe("template files", () => {
  it("round-trip, without the workspace's own id", () => {
    const text = templateFile(tpl)
    expect(JSON.parse(text)).toMatchObject({ onecamp_template: 1, name: "Client project" })
    expect(text).not.toContain(tpl.id!)
    const back = readTemplateFile(text)
    expect(back).toEqual({ name: tpl.name, description: tpl.description, statuses: tpl.statuses, tasks: tpl.tasks })
  })

  it("refuse what isn't one, with a reason a person can act on", () => {
    const reason = (text: string) => {
      try {
        readTemplateFile(text)
      } catch (e) {
        expect(e).toBeInstanceOf(TemplateFileError)
        return (e as Error).message
      }
      throw new Error("read")
    }
    expect(reason("not json")).toMatch(/isn't a OneCamp template/)
    expect(reason("[]")).toMatch(/isn't a OneCamp template/)
    expect(reason(JSON.stringify({ name: "x", tasks: [] }))).toMatch(/isn't a OneCamp template/)
    expect(reason(JSON.stringify({ onecamp_template: 2, name: "x", tasks: [] }))).toMatch(/newer OneCamp/)
    expect(reason(JSON.stringify({ onecamp_template: 1, name: "x" }))).toMatch(/no name or no tasks/)
  })

  it("are named for the template", () => {
    expect(templateFileName("Client project (retainer)")).toBe("client-project-retainer.onecamp-template.json")
    expect(templateFileName("!!!")).toBe("template.onecamp-template.json")
  })
})

describe("the picker's words", () => {
  it("counts tasks", () => {
    expect(taskCount(1)).toBe("1 task")
    expect(taskCount(9)).toBe("9 tasks")
  })
  it("previews the first tasks and how many more", () => {
    expect(previewLine({ preview: ["A", "B"], task_count: 9 })).toBe("A · B · 7 more")
    expect(previewLine({ preview: ["A", "B"], task_count: 2 })).toBe("A · B")
  })
})

describe("after a project is made from a template", () => {
  it("says nothing when every task was made", () => {
    expect(appliedNotice(undefined)).toBeNull()
    expect(appliedNotice({ statuses: 1, tasks: 9, failed: 0 })).toBeNull()
  })
  it("says how many were made when some weren't", () => {
    expect(appliedNotice({ statuses: 1, tasks: 7, failed: 2 })?.title).toBe("7 of 9 tasks were made")
    expect(appliedNotice({ statuses: 0, tasks: 0, failed: 9 })?.title).toBe("The project was made without its tasks")
  })
})
