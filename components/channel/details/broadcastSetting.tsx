"use client"

import { useState } from "react"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { useFetch } from "@/hooks/useFetch"
import { useToast } from "@/hooks/use-toast"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { DetailsRow as Row } from "@/components/channel/details/detailsParts"

/** A channel's broadcast rules as GET …/broadcasts answers them. */
interface Rules {
  members_may: boolean
  own: boolean
  manages: boolean
}

/**
 * "Allow @here and @channel" for a channel's members (TN-51, B5): its
 * managers set it for the channel, or give it back to the workspace's; its
 * managers and the workspace's admins notify all of it either way. Shown only
 * to those who may change it, as the server says (rules.manages).
 */
export function BroadcastSetting({ channelId }: { channelId: string }) {
  const key = `/conversations/channel/${encodeURIComponent(channelId)}/broadcasts`
  const rules = useFetch<{ data: Rules }>(channelId ? key : "")
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const r = rules.data?.data
  if (!r?.manages) return null

  const save = async (members: boolean | null) => {
    setSaving(true)
    try {
      await axiosInstance.put(key, { members }, OWN_ERRORS)
      await rules.mutate()
      toast({ title: members === null ? "Back to the workspace's setting" : members ? "Members can notify everyone here" : "Only managers notify everyone here" })
    } catch (e) {
      toast({ title: "The setting wasn't saved", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Row
      label="Allow @here and @channel"
      controlId="details-broadcasts"
      description={r.own
        ? <>Members {r.members_may ? "can" : "can't"} notify everyone here. <Button variant="link" size="sm" className="h-auto p-0" disabled={saving} onClick={() => void save(null)}>Use the workspace&apos;s</Button></>
        : `The workspace's setting: members ${r.members_may ? "can" : "can't"} notify everyone here. Managers always can.`}
    >
      <Switch id="details-broadcasts" checked={r.members_may} disabled={saving} onCheckedChange={(v) => void save(v)} />
    </Row>
  )
}
