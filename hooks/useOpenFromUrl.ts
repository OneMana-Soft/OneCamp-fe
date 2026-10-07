"use client"

// Opens a creation dialog named in the URL (?open=createProject), then drops
// the parameter, so a link from anywhere (the setup checklist, a doc, an
// email, a template page on onemana.dev) can start the thing it describes.
// Only these dialogs: the parameter comes from a link, and a link shouldn't
// open arbitrary UI. New project can name a template to start from
// (&template=client-project). On the projects page, ?new=<template> is the
// short form of the same link, as the docs give it.

import { useEffect, useMemo } from "react"
import { useDispatch } from "react-redux"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { openUI } from "@/store/slice/uiSlice"
import { isTemplateId } from "@/lib/projectTemplates"

export const OPENABLE_FROM_URL = ["createProject", "createChannel", "createTeam"] as const
type Openable = (typeof OPENABLE_FROM_URL)[number]

export const openableFromUrl = (raw: string | null): Openable | null =>
  (OPENABLE_FROM_URL as readonly string[]).includes(raw ?? "") ? (raw as Openable) : null

export interface OpenRequest {
  key: Openable
  /** A template to start New project from, when the link names one. */
  templateId?: string
  /** The parameters the link used, to take out of the address. */
  used: string[]
}

/** What a page's address asks to open, if anything. Pure. */
export function openRequest(params: URLSearchParams, pathname: string): OpenRequest | null {
  const key = openableFromUrl(params.get("open"))
  if (key) {
    const template = key === "createProject" ? params.get("template") : null
    return { key, templateId: isTemplateId(template) ? template! : undefined, used: ["open", "template"] }
  }
  const short = params.get("new")
  if (short !== null && (pathname === "/app/project" || pathname.startsWith("/app/project/"))) {
    return { key: "createProject", templateId: isTemplateId(short) ? short : undefined, used: ["new"] }
  }
  return null
}

export function useOpenFromUrl() {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const dispatch = useDispatch()
  const request = useMemo(() => openRequest(new URLSearchParams(params.toString()), pathname), [params, pathname])
  useEffect(() => {
    if (!request) return
    dispatch(openUI({ key: request.key, data: request.templateId ? { templateId: request.templateId } : null }))
    const rest = new URLSearchParams(params.toString())
    for (const p of request.used) rest.delete(p)
    const q = rest.toString()
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false })
  }, [request, dispatch, params, pathname, router])
}
