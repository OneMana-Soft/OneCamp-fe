import { toast } from "@/hooks/use-toast"
import { shownRecently } from "@/lib/utils/errorToast"
import { wasSaid } from "@/lib/http/writeSaid"

/** The toast, a task later, unless claimed (V-397). */
export function tellWriteFailure(error: unknown, copy: Parameters<typeof shownRecently>[0]): void {
  setTimeout(() => {
    if (!wasSaid(error) && !shownRecently(copy)) toast({ variant: "destructive", ...copy })
  }, 0)
}
