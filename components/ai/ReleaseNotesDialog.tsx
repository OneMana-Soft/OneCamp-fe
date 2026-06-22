"use client"

/**
 * ReleaseNotesDialog — draft user-facing release notes from the pull requests
 * merged on a GitHub repo in a recent window. Grounded in real shipped work,
 * so it's a genuine time-saver for any team that ships software. The result is
 * an editable draft to copy/publish; nothing is sent anywhere.
 *
 * Mobile-friendly: the dialog is width-constrained and the rendered notes
 * scroll vertically; the form stacks on narrow screens.
 */

import React, { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import MarkdownMessage from "@/components/ai/MarkdownMessage"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Sparkles, Copy, Check, Megaphone } from "@/lib/icons"
import { draftReleaseNotes, type ReleaseNotesResult } from "@/services/aiModelService"

const ReleaseNotesDialog: React.FC<{
  open: boolean
  onOpenChange: (v: boolean) => void
  onDraftSocial?: (notes: string) => void
}> = ({ open, onOpenChange, onDraftSocial }) => {
  const { toast } = useToast()
  const [owner, setOwner] = useState("")
  const [repo, setRepo] = useState("")
  const [days, setDays] = useState("14")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ReleaseNotesResult | null>(null)
  const [copied, setCopied] = useState(false)

  const generate = async () => {
    if (!owner.trim() || !repo.trim()) {
      toast({ title: "Enter the repository owner and name", variant: "destructive" })
      return
    }
    setLoading(true)
    setResult(null)
    try {
      const res = await draftReleaseNotes(owner.trim(), repo.trim(), parseInt(days, 10))
      setResult(res)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to draft release notes"
      toast({ title: "Couldn't draft", description: msg, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const copy = async () => {
    if (!result?.notes) return
    try {
      await navigator.clipboard.writeText(result.notes)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast({ title: "Couldn't copy", variant: "destructive" })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Draft release notes
          </DialogTitle>
          <DialogDescription>
            Summarize what shipped from a repo&apos;s merged pull requests into a draft you can edit and publish.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1 space-y-1">
              <Label htmlFor="rn-owner" className="text-xs">Owner</Label>
              <Input id="rn-owner" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="acme" />
            </div>
            <div className="flex-1 space-y-1">
              <Label htmlFor="rn-repo" className="text-xs">Repository</Label>
              <Input id="rn-repo" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="webapp" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Window</Label>
              <Select value={days} onValueChange={setDays}>
                <SelectTrigger className="w-full sm:w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="14">Last 14 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={generate} disabled={loading} className="self-start">
            {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
            {loading ? "Drafting…" : "Generate"}
          </Button>

          {result && (
            <div className="space-y-2 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {result.pr_count > 0
                    ? `Based on ${result.pr_count} merged PR${result.pr_count === 1 ? "" : "s"} in the last ${result.days} days`
                    : "No merged PRs found in this window"}
                </span>
                {result.pr_count > 0 && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 shrink-0" onClick={copy}>
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                )}
              </div>
              <div className="rounded-md border border-border bg-background/60 p-3 max-h-[24rem] overflow-y-auto overflow-x-hidden custom-scrollbar min-w-0">
                <MarkdownMessage content={result.notes} />
              </div>
              {result.pr_count > 0 && onDraftSocial && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  onClick={() => onDraftSocial(result.notes)}
                >
                  <Megaphone className="h-3 w-3" /> Draft social posts from this
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default ReleaseNotesDialog
