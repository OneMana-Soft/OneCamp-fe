"use client"

// The people earlier Todoist and Notion imports added to projects, for an
// admin to look over (components/admin/ImportReviewCard): its read, shared
// through SWR's cache by the admin page, which asks as it opens so the Import
// tab draws once, and by the card; and the card's calls.

import { useEffect, useState } from "react"
import { useFetch } from "@/hooks/useFetch"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"

export const IMPORT_REVIEWS_KEY = "/admin/import-reviews"

export interface ImportReviewProject {
  project_uuid: string
  project_name: string
  providers: string[]
  undecided: number
  removed: number
  kept: number
}

/** Each project with how many are undecided, kept and taken off, and how many are undecided in all. */
export interface ImportReviews {
  projects: ImportReviewProject[]
  pending: number
}

/** One person an import added to a project; no outcome while undecided. */
export interface ImportReviewPerson {
  id: string
  provider: string
  user_uuid: string
  user_name: string
  outcome?: "removed" | "kept"
}

export function useImportReviews() {
  return useFetch<ImportReviews>(IMPORT_REVIEWS_KEY, undefined, undefined, OWN_ERRORS)
}

/** A page of a project's people by name, from after the review the last page ended on. */
export async function listImportReviewPeople(projectUuid: string, after?: string): Promise<{ people: ImportReviewPerson[]; more: boolean }> {
  const page = after ? `?after=${encodeURIComponent(after)}` : ""
  const res = await axiosInstance.get<{ people: ImportReviewPerson[]; more: boolean }>(
    `${IMPORT_REVIEWS_KEY}/projects/${encodeURIComponent(projectUuid)}${page}`,
    OWN_ERRORS,
  )
  return res.data
}

/** Takes the person a review names off its project. */
export async function takeOffImportReview(id: string): Promise<void> {
  await axiosInstance.post(`${IMPORT_REVIEWS_KEY}/${encodeURIComponent(id)}/remove`, undefined, OWN_ERRORS)
}

/**
 * Takes up to a batch of the people still undecided in a project off it, and
 * answers how many went and how many are left: call again while any are left
 * and some went (its creator can't be taken off, so stays).
 */
export async function takeOffEveryoneLeft(projectUuid: string): Promise<{ removed: number; left: number }> {
  const res = await axiosInstance.post<{ removed: number; left: number }>(
    `${IMPORT_REVIEWS_KEY}/projects/${encodeURIComponent(projectUuid)}/remove-all`,
    undefined,
    OWN_ERRORS,
  )
  return { removed: res.data.removed, left: res.data.left }
}

/** Keeps everyone still undecided in a project, and answers how many. */
export async function keepEveryoneLeft(projectUuid: string): Promise<number> {
  const res = await axiosInstance.post<{ kept: number }>(`${IMPORT_REVIEWS_KEY}/projects/${encodeURIComponent(projectUuid)}/keep`, undefined, OWN_ERRORS)
  return res.data.kept
}

/** Where the Import tab draws the review: first, last or not at all. */
export type ImportReviewPlace = "first" | "last" | "none"

/**
 * Where the review goes, once the read has answered and, when there is
 * something to draw, the card's code is in: first while anyone is left to
 * review (or the read failed, to say so), at the tab's end once everyone is
 * decided, else nowhere. Pure; null while either is still on its way.
 */
export function reviewPlaceOf(reviews: { data?: ImportReviews; isError?: unknown }, cardIn: boolean): ImportReviewPlace | null {
  if (reviews.data) {
    if (reviews.data.projects.length === 0) return "none"
    if (!cardIn) return null
    return reviews.data.pending > 0 ? "first" : "last"
  }
  return reviews.isError && cardIn ? "first" : null
}

/**
 * The review's place, settled before the Import tab draws so nothing under it
 * moves: the admin page asks as it opens, and holds the tab while this is
 * null. Settled once a visit, so a decision made with the tab open never
 * moves the card it was made in. loadCard is the card's import(), stable.
 */
export function useImportReviewPlace(loadCard: () => Promise<unknown>): ImportReviewPlace | null {
  const reviews = useImportReviews()
  const [cardIn, setCardIn] = useState(false)
  const [placed, setPlaced] = useState<ImportReviewPlace | null>(null)
  useEffect(() => {
    let live = true
    const settle = () => {
      if (live) setCardIn(true)
    }
    // A chunk that failed settles too: next/dynamic tries it again as the
    // card draws, and the tab mustn't wait on it.
    void loadCard().then(settle, settle)
    return () => {
      live = false
    }
  }, [loadCard])
  const next = reviewPlaceOf(reviews, cardIn)
  if (placed === null && next !== null) setPlaced(next)
  return placed ?? next
}

