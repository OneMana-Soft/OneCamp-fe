"use client"

import { useEffect } from "react"
import { useDispatch } from "react-redux"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ProjectListContent } from "@/components/project/ProjectListContent"
import { openUI } from "@/store/slice/uiSlice"

// ?new opens New project, and ?new=<template> opens it on that template: a
// link from a template's page on onemana.dev, or from a teammate, starts a
// project in one click. The parameter goes once it's used, so going back
// doesn't open the dialog again.
const ProjectPage = () => {
    const params = useSearchParams()
    const router = useRouter()
    const pathname = usePathname()
    const dispatch = useDispatch()
    const wanted = params.get("new")

    useEffect(() => {
        if (wanted === null) return
        dispatch(openUI({ key: "createProject", data: wanted && wanted !== "1" ? { templateId: wanted } : null }))
        router.replace(pathname, { scroll: false })
    }, [wanted, dispatch, router, pathname])

    return <ProjectListContent />
}

export default ProjectPage
