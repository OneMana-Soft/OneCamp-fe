// The call's toasts, menus and popovers sit over its stage, which is dark in
// both themes. They are drawn outside it (in a portal, or the app's toaster),
// so they took the page's theme: white menus and toasts over a dark call in
// light mode (DESIGN-BUILD-2's review of CALLS-1, 17 Oct 2026). They take the
// stage's dark surface too, so nothing over a call is light.

import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils/helpers/cn"

/** The class that gives a call's portalled overlay the stage's dark surface. */
export const CALL_SURFACE = "dark"

/** A toast the call raises, on the call's dark surface. */
export function callToast(t: Parameters<typeof toast>[0]): ReturnType<typeof toast> {
  return toast({ ...t, className: cn(CALL_SURFACE, t.className) })
}
