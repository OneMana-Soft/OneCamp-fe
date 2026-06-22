"use client"

/**
 * SocialComposeDialog — draft platform-native social posts (X, Reddit, ...)
 * from a topic or pasted release notes. Produces tailored variants you copy
 * and post yourself. OneCamp does not auto-post to these platforms (they
 * restrict automated promotion), so this is review-and-post by design.
 *
 * Mobile-friendly: the form stacks, platform chips wrap, and each draft card
 * scrolls its own content.
 */

import React, { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Megaphone, Copy, Check, ArrowUpRight } from "@/lib/icons"
import { draftSocialPosts, type SocialPostView } from "@/services/aiModelService"

const PLATFORMS: { key: string; label: string }[] = [
  { key: "x_tweet", label: "X post" },
  { key: "x_thread", label: "X thread" },
  { key: "reddit", label: "Reddit" },
  { key: "linkedin", label: "LinkedIn" },
]

// buildIntentUrl returns the platform's native pre-filled compose URL for a
// draft, or "" when the platform has no reliable web-intent. Opening it lets
// the user review in the platform's own composer and post manually — no API,
// no OAuth, no auto-posting.
function buildIntentUrl(platform: string, content: string): string {
  if (platform === "x_tweet") {
    return `https://twitter.com/intent/tweet?text=${encodeURIComponent(content)}`
  }
  if (platform === "reddit") {
    // First non-empty line is the title (strip a leading "Title:"); rest is body.
    const lines = content.split("\n")
    let title = ""
    let bodyStart = 0
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim()
      if (t) {
        title = t.replace(/^title\s*[:\-]\s*/i, "")
        bodyStart = i + 1
        break
      }
    }
    const body = lines.slice(bodyStart).join("\n").trim()
    return `https://www.reddit.com/submit?title=${encodeURIComponent(title)}&text=${encodeURIComponent(body)}`
  }
  return ""
}

function intentLabel(platform: string): string {
  if (platform === "x_tweet") return "Open in X"
  if (platform === "reddit") return "Open in Reddit"
  return ""
}

const SocialComposeDialog: React.FC<{ open: boolean; onOpenChange: (v: boolean) => void; initialTopic?: string }> = ({
  open,
  onOpenChange,
  initialTopic = "",
}) => {
  const { toast } = useToast()
  const [topic, setTopic] = useState(initialTopic)
  const [selected, setSelected] = useState<string[]>(["x_tweet", "x_thread", "reddit"])
  const [loading, setLoading] = useState(false)
  const [posts, setPosts] = useState<SocialPostView[] | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  // Seed the topic each time the dialog opens: the release-notes cross-link
  // passes the notes as initialTopic; the header button opens it empty. Only
  // fires on open/initialTopic change, so it never clobbers mid-edit typing.
  useEffect(() => {
    if (open) {
      setTopic(initialTopic)
      setPosts(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTopic])

  const toggle = (key: string) =>
    setSelected((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]))

  const generate = async () => {
    if (!topic.trim()) {
      toast({ title: "Describe what you want to post about", variant: "destructive" })
      return
    }
    if (selected.length === 0) {
      toast({ title: "Pick at least one platform", variant: "destructive" })
      return
    }
    setLoading(true)
    setPosts(null)
    try {
      setPosts(await draftSocialPosts(topic.trim(), selected))
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to draft posts"
      toast({ title: "Couldn't draft", description: msg, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const copy = async (key: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500)
    } catch {
      toast({ title: "Couldn't copy", variant: "destructive" })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-primary" /> Draft social posts
          </DialogTitle>
          <DialogDescription>
            Turn an update into platform-native drafts. Copy them, or open one in X / Reddit pre-filled to review
            and post. Nothing is posted automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="space-y-1">
            <Label htmlFor="sc-topic" className="text-xs">What do you want to post about?</Label>
            <Textarea
              id="sc-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. We just shipped dark mode and 2x faster search. Paste your release notes here for a grounded post."
              className="min-h-[88px]"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {PLATFORMS.map((p) => {
              const on = selected.includes(p.key)
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => toggle(p.key)}
                  className={
                    "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors " +
                    (on
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-transparent text-muted-foreground border-border hover:text-foreground")
                  }
                >
                  {p.label}
                </button>
              )
            })}
          </div>

          <Button onClick={generate} disabled={loading} className="self-start">
            {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Megaphone className="mr-1 h-4 w-4" />}
            {loading ? "Drafting…" : "Generate"}
          </Button>

          {posts && posts.length > 0 && (
            <div className="space-y-2 min-w-0 max-h-[26rem] overflow-y-auto custom-scrollbar pr-1">
              {posts.map((p) => (
                <div key={p.platform} className="rounded-md border border-border bg-background/60 p-2.5 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-medium">{p.label}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {buildIntentUrl(p.platform, p.content) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[11px] gap-1"
                          onClick={() => window.open(buildIntentUrl(p.platform, p.content), "_blank", "noopener,noreferrer")}
                          title="Open the platform's composer pre-filled with this draft"
                        >
                          <ArrowUpRight className="h-3 w-3" />
                          {intentLabel(p.platform)}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[11px] gap-1"
                        onClick={() => copy(p.platform, p.content)}
                      >
                        {copiedKey === p.platform ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        {copiedKey === p.platform ? "Copied" : "Copy"}
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{p.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default SocialComposeDialog
