"use client"

import { ProjectsOverview } from "@/components/project/ProjectsOverview"

// ?new=<template> on this page opens New project on that template; the
// layout's useOpenFromUrl reads it, as it reads every link that opens a dialog.
const ProjectPage = () => <ProjectsOverview />

export default ProjectPage
