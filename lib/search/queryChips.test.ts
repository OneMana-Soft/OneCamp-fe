import { describe, expect, it } from "vitest"

import { topModifierList } from "@/lib/search/query"
import { DATE_FIELDS, DATE_PRESETS, hasDate, modifierLabel } from "@/lib/search/queryChips"

const labels = (text: string) => topModifierList(text).map(modifierLabel)

describe("what a filter chip says", () => {
  it("reads each modifier as a person would say it", () => {
    expect(labels("launch from:@sam in:#launch")).toEqual(["From @sam", "In #launch"])
    expect(labels("from:me type:doc -type:task")).toEqual(["From me", "Only docs", "No tasks"])
    expect(labels("on:today during:past_7_days before:2026-10-01")).toEqual(["Today", "Past 7 days", "Before 1 Oct 2026"])
    expect(labels(`-from:@ana in:"Q4 launch" title:onboarding`)).toEqual(["Not from @ana", "In Q4 launch", "Title has “onboarding”"])
    expect(labels("status:done")).toEqual(["status: done"])
  })

  it("offers dates that every replace the one there", () => {
    for (const p of DATE_PRESETS) expect(DATE_FIELDS).toContain(p.field)
    expect(hasDate(topModifierList("launch after:-7d"))).toBe(true)
    expect(hasDate(topModifierList("launch from:@sam"))).toBe(false)
  })
})
