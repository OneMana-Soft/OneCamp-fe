"use client"

import { toast } from "@/hooks/use-toast"

/** The doc's address in the app, to share with someone who can open it. */
function docLink(docId: string): string {
  return `${window.location.origin}/app/doc/${docId}`
}

/** Copies the doc's link (More → Copy link, and ⌘L) and says it did. */
export async function copyDocLink(docId: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(docLink(docId))
    toast({ title: "Link copied" })
    return true
  } catch {
    // A browser that refuses the clipboard: the link, to copy by hand.
    toast({ title: "Couldn't copy the link", description: docLink(docId), variant: "destructive" })
    return false
  }
}
