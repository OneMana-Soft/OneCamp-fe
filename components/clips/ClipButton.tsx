"use client"

// The composer's clip button. The recorder loads the first time it's opened,
// so the composer carries none of its weight until someone records.

import dynamic from "next/dynamic"
import * as React from "react"
import { Button } from "@/components/ui/button"
import { Mic } from "@/lib/icons"

const ClipRecorder = dynamic(() => import("@/components/clips/ClipRecorder"), { ssr: false })

export function ClipButton({ onRecorded }: { onRecorded: (file: File) => void }) {
  const [open, setOpen] = React.useState(false)
  const [wanted, setWanted] = React.useState(false)
  return (
    <>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label="Record a clip"
        title="Record a voice, video or screen clip"
        className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
        onClick={() => {
          setWanted(true)
          setOpen(true)
        }}
      >
        <Mic className="h-4 w-4" />
      </Button>
      {wanted && <ClipRecorder open={open} onOpenChange={setOpen} onAttach={onRecorded} />}
    </>
  )
}
