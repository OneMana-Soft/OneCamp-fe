"use client"

import React from "react"
import { Skeleton } from "@/components/ui/skeleton"

export function DocPageSkeleton() {
  return (
    <div className="flex flex-col h-full bg-background animate-in fade-in duration-150">
      {/* Top Bar Skeleton */}
      <div className="h-14 border-b flex items-center px-4 justify-between bg-card/50">
        <div className="flex items-center gap-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
      </div>

      {/* Editor Content Skeleton */}
      <div className="flex-1 max-w-4xl mx-auto w-full p-8 md:p-12 lg:p-16 space-y-8">
        <div className="space-y-4">
          <Skeleton className="h-12 w-3/4" />
          <div className="flex gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>

        <div className="space-y-6 pt-8">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-[90%]" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-[95%]" />
          
          <div className="py-8">
             <Skeleton className="h-32 w-full rounded-xl" />
          </div>

          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-[85%]" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-[92%]" />
        </div>
      </div>
    </div>
  )
}
