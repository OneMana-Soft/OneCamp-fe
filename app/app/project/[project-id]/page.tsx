"use client"

import { useParams } from "next/navigation"
import { ProjectView } from "@/components/views/ProjectView"

export default function Page() {
    const params = useParams()
    return <ProjectView projectId={params?.["project-id"] as string} />
}
