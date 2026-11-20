import axiosInstance from "@/lib/axiosInstance"
import { AiPost } from "@/services/endpoints/ai"

// Code-aware bug analysis (member-facing), apart from aiModelService: a task's
// GitHub section offers it, and the task page's first load carries this, not
// the whole AI service.

export interface CodeAnalysisResult {
  answer: string
  files_considered: string[]
  partial: boolean
}

interface AnalyzeCodeInput {
  owner: string
  repo: string
  title: string
  body: string
  ref?: string
  deep?: boolean
}

// Analyze a bug/issue against a linked GitHub repo and get a root-cause +
// proposed fix. Read-only against GitHub. `deep` widens the file budget for a
// "look harder" retry.
export async function analyzeCodeIssue(input: AnalyzeCodeInput): Promise<CodeAnalysisResult> {
  const res = await axiosInstance.post(AiPost.AnalyzeCode, input)
  return res.data?.data
}
