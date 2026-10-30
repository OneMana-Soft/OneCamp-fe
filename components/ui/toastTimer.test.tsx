import { afterEach, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import * as React from "react"

import { Toast, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast"

// A toast's own close timer goes with it. Radix started it as the toast
// opened and never cleared it, so a toast gone before its time closed itself
// afterwards: in a test file that had ended, it reached for a document that
// was no longer there (the wG gate's "document is not defined" in
// tablePage.test.tsx, under load). patches/@radix-ui__react-toast@1.2.15.patch
// clears it as the toast unmounts.

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

it("leaves no close timer running once it's gone", () => {
  vi.useFakeTimers()
  const onOpenChange = vi.fn()
  const { unmount } = render(
    <ToastProvider>
      <Toast open duration={1000} onOpenChange={onOpenChange}>
        <ToastTitle>Saved</ToastTitle>
      </Toast>
      <ToastViewport />
    </ToastProvider>,
  )
  unmount()
  act(() => void vi.advanceTimersByTime(2000))
  expect(onOpenChange).not.toHaveBeenCalled()
})
