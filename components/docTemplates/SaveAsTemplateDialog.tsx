"use client"

// Save a doc as a template (docs programme B5, structure.md P1.8): its body as
// the live copy holds it now, for anyone in the workspace to start a doc
// from. The server takes the body (typing of a moment ago included), and the
// template carries no block ids, comments or history of this doc. Opened from
// the doc's More menu, on the doc it is about.

import * as React from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ToastAction } from "@/components/ui/toast"
import { useFetch } from "@/hooks/useFetch"
import { toast } from "@/hooks/use-toast"
import { docInfoKey } from "@/lib/docCache"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { saveAsTemplate } from "@/services/docHomeService"
import type { DocInfoResponse } from "@/types/doc"

/** A template's name and description, as the server bounds them. */
export const TEMPLATE_NAME_MAX = 120
export const TEMPLATE_ABOUT_MAX = 2000

export default function SaveAsTemplateDialog({ docId, onClose }: { docId: string; onClose(): void }) {
  const router = useRouter()
  const nameId = React.useId()
  const aboutId = React.useId()
  // The doc's page has its details already: its title is the template's first name.
  const title = useFetch<DocInfoResponse>(docInfoKey(docId)).data?.data?.doc_title ?? ""
  const [name, setName] = React.useState<string | null>(null)
  const [about, setAbout] = React.useState("")
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const shownName = name ?? title.slice(0, TEMPLATE_NAME_MAX)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError("")
    try {
      const saved = await saveAsTemplate(docId, shownName.trim(), about.trim())
      onClose()
      toast({
        title: `Saved “${saved?.name ?? shownName.trim()}” as a template`,
        description: "Anyone in the workspace can start a doc from it.",
        action: (
          <ToastAction altText="See the doc templates" onClick={() => router.push("/app/templates?kind=doc")}>
            See it
          </ToastAction>
        ),
      })
    } catch (err) {
      setError(apiErrorMessage(err, "It couldn't be saved just now. Try again in a moment."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md" data-save-as-template="">
        <DialogHeader>
          <DialogTitle>Save as a template</DialogTitle>
          <DialogDescription>
            Everything in this doc as it is now, for anyone in the workspace to start a doc from. Comments, history and who it&apos;s shared with stay with this doc.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor={nameId}>Name</Label>
            <Input id={nameId} value={shownName} maxLength={TEMPLATE_NAME_MAX} onChange={(e) => setName(e.target.value)} required placeholder="Customer call notes" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={aboutId}>
              When to use it <span className="font-normal text-ink-3">(optional)</span>
            </Label>
            <Textarea id={aboutId} value={about} maxLength={TEMPLATE_ABOUT_MAX} rows={2} placeholder="Before every call with a pilot customer." onChange={(e) => setAbout(e.target.value)} />
          </div>
          {error && (
            <p role="alert" className="text-ui-sm text-danger-ink">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !shownName.trim()}>
              {busy ? "Saving…" : "Save template"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
