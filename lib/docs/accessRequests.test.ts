import { describe, expect, it } from "vitest"
import * as keys from "./accessRequests"
import * as service from "@/services/docAccessService"

describe("the doc page's access keys", () => {
    it("are the sharing service's, so a write there refreshes what the page shows", () => {
        expect(keys.docAccessKey("d1")).toBe(service.docAccessKey("d1"))
        expect(keys.accessRequestsKey("d1")).toBe(service.accessRequestsKey("d1"))
    })
})
