"use client"

/**
 * A person's switch for read receipts in DMs and group chats. Off, others
 * don't see when they've read a message, and they don't see others' either.
 * Greyed out when the workspace has turned read receipts off.
 */

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import { useFetch } from "@/hooks/useFetch"
import axiosInstance from "@/lib/axiosInstance"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"

type Prefs = { data?: { read_receipts?: boolean; read_receipts_allowed?: boolean } }

export function ReadReceiptsCard() {
  const { toast } = useToast()
  const prefs = useFetch<Prefs>(GetEndpointUrl.GetNotificationPreferences)
  const data = prefs.data?.data
  if (!data || data.read_receipts === undefined) return null
  const allowed = data.read_receipts_allowed !== false

  const change = async (next: boolean) => {
    const was = prefs.data
    void prefs.mutate({ ...was, data: { ...data, read_receipts: next } }, { revalidate: false })
    try {
      await axiosInstance.post(PostEndpointUrl.UpdateNotificationPreferences, { read_receipts: next })
      toast({ title: next ? "Read receipts on" : "Read receipts off" })
    } catch {
      void prefs.mutate(was, { revalidate: false })
      toast({ title: "Could not save that", variant: "destructive" })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Read receipts</CardTitle>
        <CardDescription>
          In DMs and group chats of up to 20 people, others see &quot;Seen&quot; under their latest message once
          you&apos;ve read it, and you see theirs. Turn it off and nobody sees when you&apos;ve read their messages,
          and you don&apos;t see when they&apos;ve read yours.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="read-receipts" className="text-sm font-normal">
            Send and see read receipts
          </Label>
          <Switch id="read-receipts" checked={allowed && !!data.read_receipts} disabled={!allowed} onCheckedChange={(v) => void change(v)} />
        </div>
        {!allowed && <p className="text-xs text-muted-foreground">Your workspace has turned read receipts off.</p>}
      </CardContent>
    </Card>
  )
}
