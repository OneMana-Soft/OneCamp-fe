"use client"

/**
 * Save to memory's side menu in a message's More menu (design v3 chat, C20):
 * one pick makes the message a tracked Decision, Commitment or Open question
 * in the permission-scoped memory layer that powers AskAI, the digest and the
 * team report, linked to its message so it goes when the message does.
 *
 * A chunk of its own: its row draws with More (MessageDesktopHover), and this
 * is fetched as the pointer or the focus reaches that row.
 */

import { useState, type ComponentType } from "react"
import axios from "axios"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { useToast } from "@/hooks/use-toast"
import { CheckCircle2, HelpCircle, Zap } from "@/lib/icons"
import { removeHtmlTags } from "@/lib/utils/removeHtmlTags"
import { captureMemory, type MemoryKind } from "@/services/memoryService"

type CaptureKind = Exclude<MemoryKind, "glossary">

const KINDS: { kind: CaptureKind; label: string; hint: string; Icon: ComponentType<{ className?: string }> }[] = [
  { kind: "decision", label: "Decision", hint: "A choice the team made", Icon: Zap },
  { kind: "commitment", label: "Commitment", hint: "Something someone will do", Icon: CheckCircle2 },
  { kind: "question", label: "Open question", hint: "Something still unresolved", Icon: HelpCircle },
]

const errMessage = (e: unknown): string => {
  if (axios.isAxiosError(e)) return e.response?.data?.msg || e.response?.data?.message || e.message
  if (e instanceof Error) return e.message
  return "Couldn't save to memory"
}

export interface SaveToMemoryKindsProps {
  /** The message's body, HTML or plain; its words are what memory keeps. */
  messageText?: string
  /** The scope: a channel's, or a group chat's or DM's. */
  channelUUID?: string
  chatGrpID?: string
  /** Where it came from, so deleting the message takes it out of memory too. */
  sourceType: string
  sourceUUID: string
}

export default function SaveToMemoryKinds({ messageText, channelUUID, chatGrpID, sourceType, sourceUUID }: SaveToMemoryKindsProps) {
  const { toast } = useToast()
  const [saving, setSaving] = useState<CaptureKind | null>(null)

  const pick = async (kind: CaptureKind) => {
    setSaving(kind)
    try {
      await captureMemory({
        kind,
        content: removeHtmlTags(messageText).trim(),
        source_type: sourceType,
        source_uuid: sourceUUID,
        ...(channelUUID ? { channel_uuid: channelUUID } : {}),
        ...(chatGrpID ? { chat_grp_id: chatGrpID } : {}),
      })
      toast({ title: "Saved to memory", description: `Captured as a ${kind}.` })
    } catch (e: unknown) {
      const msg = errMessage(e)
      toast({
        title: msg.includes("not enabled") ? "Workspace Memory is off" : "Couldn't save",
        description: msg.includes("not enabled") ? "An admin can enable it in AI settings." : msg,
        variant: "destructive",
      })
    } finally {
      setSaving(null)
    }
  }

  return KINDS.map(({ kind, label, hint, Icon }) => (
    <DropdownMenuItem key={kind} disabled={!!saving} onSelect={() => void pick(kind)} className="h-auto items-start py-1.5">
      <Icon className="mt-0.5 text-ink-3" />
      <span className="min-w-0">
        <span className="block text-ui-sm">{label}</span>
        <span className="block text-meta text-ink-3">{hint}</span>
      </span>
    </DropdownMenuItem>
  ))
}
