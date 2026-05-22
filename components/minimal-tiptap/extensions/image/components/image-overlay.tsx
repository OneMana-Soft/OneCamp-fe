"use client"

import * as React from 'react'
import { cn } from '@/lib/utils/helpers/cn'
import { LoaderCircle } from "@/lib/icons";

export const ImageOverlay = React.memo(() => {
  return (
    <div
      className={cn(
        'flex flex-row items-center justify-center',
        'absolute inset-0 rounded bg-[var(--mt-overlay)] opacity-100 transition-opacity'
      )}
    >
      <LoaderCircle className="h-4 w-4 animate-spin"/>

    </div>
  )
})

ImageOverlay.displayName = 'ImageOverlay'
