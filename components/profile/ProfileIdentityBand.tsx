"use client"

// The top of your profile (design v3, admin D1, mock M7b): the one playful
// moment in settings. A 168px band on --sunken with a soft campfire glow in
// YOUR hue (a radial of your avatar's a1 at 22 %, top left) and a 2 % grain;
// your 80px avatar on a 3px --sheet ring with its presence dot; your name,
// "@handle · email", and your status as a chip that opens the status dialog.
//
// The photo saves the moment it is chosen or dropped, not with the fields
// card: a ring of progress runs round the avatar while it uploads, and the
// photo crossfades over the initials when it is in. A file too big for the
// workspace's limit is said under the band, before any bytes leave.

import * as React from "react"
import { useRef, useState } from "react"
import { useDispatch } from "react-redux"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { PostFileUploadURL } from "@/services/endPoints"
import type { UploadFileInterfaceRes } from "@/types/file"
import { Camera, Smile } from "@/lib/icons"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor"
import { getNameInitials } from "@/lib/utils/getNameInitials"
import { hueFor } from "@/lib/campHue"
import { displayNameOf, handleOf } from "@/lib/personName"
import { useUserAvatar } from "@/hooks/useUserAvatar"
import { useClientConfig } from "@/hooks/useClientConfig"
import { useUserInfoState } from "@/hooks/useUserInfoState"
import { useEmojiMartData } from "@/hooks/reactions/useEmojiMartData"
import { findEmojiMartEmojiByEmojiID } from "@/lib/utils/reaction/findReaction"
import { useStatusIsExpired } from "@/hooks/useStatusIsExpired"
import { exceedsUploadLimit, uploadLimitMessage } from "@/lib/utils/uploadLimit"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { openUI } from "@/store/slice/uiSlice"
import { USER_STATUS_ONLINE } from "@/types/user"
import { cn } from "@/lib/utils/helpers/cn"
import { useSelfProfile } from "@/components/profile/useSelfProfile"

const RING = 88 // the progress ring's box: the 80px avatar and 4px round it
const R = 43 // its radius, on a 2px stroke

/** The band's person, as the rest of the page reads them. */
export function ProfileIdentityBand() {
  const { profile, save } = useSelfProfile()
  const dispatch = useDispatch()
  const config = useClientConfig()
  const { src: savedSrc } = useUserAvatar(profile?.user_profile_object_key)
  const live = useUserInfoState(profile?.user_uuid || "")
  const emojiData = useEmojiMartData()
  const status = live?.emojiStatus?.status_user_emoji_id ? live.emojiStatus : profile?.user_emoji_statuses?.[0] ?? null
  const expired = useStatusIsExpired(status?.status_user_emoji_id ? status : null)

  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string>("")
  const [progress, setProgress] = useState<number | null>(null)
  const [problem, setProblem] = useState("")
  const [dropping, setDropping] = useState(false)

  if (!profile) {
    return (
      <div data-identity-band="" role="status" aria-label="Loading your profile" className="you-band">
        <Skeleton className="size-20 shrink-0 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-3.5 w-56" />
        </div>
      </div>
    )
  }

  const name = displayNameOf(profile) || "You"
  const hue = hueFor(name)
  const handle = handleOf(profile)
  const contact = [handle && `@${handle}`, profile.user_email_id].filter(Boolean).join(" · ")
  const online = (live?.status || profile.user_status) === USER_STATUS_ONLINE
  const photo = preview || savedSrc || ""
  const statusEmoji =
    status && !expired ? findEmojiMartEmojiByEmojiID(emojiData.data, status.status_user_emoji_id ?? "")?.skins[0].native : undefined
  const statusText = status && !expired ? status.status_user_emoji_desc : ""

  const upload = async (file: File) => {
    setProblem("")
    if (!file.type.startsWith("image/")) {
      setProblem("That file isn't an image. Choose a PNG, JPEG, GIF or WebP.")
      return
    }
    if (exceedsUploadLimit(file.size, config.upload_limit_bytes)) {
      setProblem(uploadLimitMessage(file.size, config.upload_limit_mb, file.name))
      return
    }
    const local = URL.createObjectURL(file)
    setProgress(0)
    try {
      const form = new FormData()
      form.append("file", file)
      form.append("jsonData", JSON.stringify({ src_key: "public" }))
      const res = await axiosInstance.post<UploadFileInterfaceRes>(PostFileUploadURL.UploadFile, form, {
        ...OWN_ERRORS,
        onUploadProgress: (e) => setProgress(Math.round((e.loaded / (e.total || e.loaded || 1)) * 100)),
      })
      const outcome = await save({ user_profile_object_key: res.data.object_uuid })
      if (!outcome.ok) {
        setProblem(outcome.message)
        return
      }
      setPreview(local)
    } catch (e) {
      setProblem(`Couldn't upload your photo. ${apiErrorMessage(e, "Check your connection and try again.")}`)
    } finally {
      setProgress(null)
    }
  }

  const removePhoto = async () => {
    setProblem("")
    const outcome = await save({ user_profile_object_key: "" })
    if (outcome.ok) setPreview("")
    else setProblem(outcome.message)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDropping(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void upload(file)
  }

  const uploading = progress !== null
  const circumference = 2 * Math.PI * R

  return (
    <div className="space-y-2">
      <div
        data-identity-band=""
        data-hue={hue}
        data-dropping={dropping ? "true" : undefined}
        className={cn("you-band", HUE_CLASS[hue])}
        onDragOver={(e) => {
          if (!Array.from(e.dataTransfer.types).includes("Files")) return
          e.preventDefault()
          setDropping(true)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropping(false)
        }}
        onDrop={onDrop}
      >
        <div className="relative shrink-0" style={{ width: 80, height: 80 }}>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            aria-label={photo ? "Change your photo" : "Add a photo"}
            className="you-avatar group/avatar"
          >
            <span aria-hidden="true" className={cn("you-avatar-initials", getAvatarFallbackClass(name))}>
              {getNameInitials(name)}
            </span>
            {photo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={photo} src={photo} alt="" className="you-avatar-photo" />
            )}
            <span aria-hidden="true" className="you-avatar-change">
              <Camera className="size-5" />
              <span className="text-2xs font-medium">Change</span>
            </span>
          </button>
          <span
            aria-hidden="true"
            data-presence={online ? "online" : "away"}
            className={cn("you-presence", online ? "bg-success" : "bg-ink-3")}
          />
          {uploading && (
            <svg
              role="progressbar"
              aria-label="Uploading your photo"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress ?? 0}
              width={RING}
              height={RING}
              viewBox={`0 0 ${RING} ${RING}`}
              className="you-upload-ring"
            >
              <circle cx={RING / 2} cy={RING / 2} r={R} fill="none" strokeWidth="2" className="you-ring-track" />
              <circle
                cx={RING / 2}
                cy={RING / 2}
                r={R}
                fill="none"
                strokeWidth="2"
                strokeLinecap="round"
                className="you-ring-arc"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - (progress ?? 0) / 100)}
                transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
              />
            </svg>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ""
              if (file) void upload(file)
            }}
          />
        </div>
        <div className="min-w-0 space-y-1">
          <p className="truncate text-title-1 font-semibold text-foreground">{name}</p>
          {contact && <p className="truncate text-xs text-muted-foreground">{contact}</p>}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              data-status-chip=""
              onClick={() => dispatch(openUI({ key: "userStatusUpdate", data: { userUUID: "" } }))}
              className="you-chip"
            >
              {statusEmoji ? <span aria-hidden="true">{statusEmoji}</span> : <Smile className="size-3.5 text-ink-3" aria-hidden="true" />}
              <span className="truncate">{statusText || "Set a status"}</span>
            </button>
            {photo && !uploading && (
              <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-2xs" onClick={() => void removePhoto()}>
                Remove photo
              </Button>
            )}
          </div>
        </div>
      </div>
      {problem && (
        <p role="alert" className="text-xs text-danger-ink text-pretty">
          {problem}
        </p>
      )}
    </div>
  )
}
