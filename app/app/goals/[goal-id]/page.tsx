"use client"

import { useParams } from "next/navigation"
import { GoalPage } from "@/components/goals/GoalPage"

export default function Page() {
  const params = useParams()
  return <GoalPage goalId={params?.["goal-id"] as string} />
}
