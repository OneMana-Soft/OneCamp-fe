"use client"

import { use } from "react"

import { PublishedRoute } from "@/components/publish/PublishedRoute"

/**
 * A doc published to the web (docs programme C6, D-25): the address people
 * share. The page itself is the server's; this sends the browser there, or
 * asks for a password page's password, or copies a page into a member's docs.
 */
export default function PublishedPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  return <PublishedRoute slug={slug} />
}
