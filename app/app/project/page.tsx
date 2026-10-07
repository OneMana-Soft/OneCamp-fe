"use client"

import { ProjectListContent } from "@/components/project/ProjectListContent"

// ?new=<template> on this page opens New project on that template; the
// layout's useOpenFromUrl reads it, as it reads every link that opens a dialog.
const ProjectPage = () => <ProjectListContent />

export default ProjectPage
