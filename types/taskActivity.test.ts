import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { taskActivityConst } from "@/types/taskActivity"

const en = JSON.parse(readFileSync(join(process.cwd(), "lib/utils/i18n/locales/en/en.json"), "utf8")) as Record<string, string>

describe("a task's history", () => {
  it("has English words for every kind of change it shows", () => {
    for (const [type, { key }] of Object.entries(taskActivityConst)) {
      expect(en[key], `${type} → ${key}`).toBeTruthy()
    }
  })

  it("knows the dependency lines the server writes (business/Task/taskDependency.go)", () => {
    expect(taskActivityConst.dependencyAdd?.key).toBe("addedTaskDependency")
    expect(taskActivityConst.dependencyRemove?.key).toBe("removedTaskDependency")
  })
})
