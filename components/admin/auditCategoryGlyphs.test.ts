import { describe, expect, it } from "vitest"

import { AUDIT_CATEGORIES, glyphOf } from "@/components/admin/AdminAuditLog"
import { ScrollText } from "@/lib/icons"

/**
 * Every category the server can answer has its own glyph in the admin log: never the log's own (ScrollText, kept for
 * a category the server starts recording later), never another category's. DESIGN-BUILD-95's governance trail look
 * (3 Nov) found "boards" falling back to ScrollText, in the filter and on every Boards row. CATEGORY_GLYPH is typed
 * total over AuditCategory, so a category added to the list without a glyph fails tsc before this runs.
 */
describe("the admin log's category glyphs", () => {
  it("gives every category the server can answer its own glyph", () => {
    // The server's categories: models/postgres/AdminAudit/adminAuditModel.go, Category* (backend beta, 3 Nov).
    expect([...AUDIT_CATEGORIES].sort()).toEqual(["agent", "app", "auth", "boards", "calendar", "calls", "docs", "integration", "security", "settings", "tables"])
    expect(AUDIT_CATEGORIES.filter((c) => glyphOf(c) === ScrollText)).toEqual([])
    expect(new Set(AUDIT_CATEGORIES.map(glyphOf)).size).toBe(AUDIT_CATEGORIES.length)
  })
})
