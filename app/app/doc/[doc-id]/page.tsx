"use client"

import { useParams } from "next/navigation"
import { DocView } from "@/components/views/DocView"

export default function Page() {
    const params = useParams()
    return <DocView docId={params?.["doc-id"] as string} />
}
