import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import { useClientConfig, useClientConfigStatus, useFeatureState } from "@/hooks/useClientConfig"

// Most of the app reads the client config, and a test of one of its parts
// isn't asking about it. vitest.setup.ts holds that read unanswered, so such a
// test needn't mock it: the reader is drawn as on a first paint, before the
// server answers, and nothing reaches the network (the setup fails a test
// that does). A test about the config answers the read itself.

afterEach(cleanup)

function UploadHint() {
  const { upload_limit_mb } = useClientConfig()
  const { known } = useClientConfigStatus()
  const ai = useFeatureState("ai")
  return (
    <p>
      {upload_limit_mb} MB · {known ? "known" : "not yet known"} · AI {ai}
    </p>
  )
}

describe("a part that reads the client config, in a test that isn't about it", () => {
  it("is drawn on the defaults while the read waits, and reaches nothing", () => {
    render(<UploadHint />)
    render(<UploadHint />)
    expect(screen.getAllByText("10 MB · not yet known · AI unknown")).toHaveLength(2)
  })
})
