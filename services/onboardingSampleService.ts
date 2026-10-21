import axiosInstance from "@/lib/axiosInstance"
import { onboardingUrl } from "@/services/onboardingService"

// The guided run's sample project, apart from onboardingService so Home, which
// reads the checklist, doesn't carry calls only the run (loaded when it opens)
// makes.

/**
 * The sample project (the built-in client project template, in an ordinary
 * project), and what removing it archives: that project, and the team made
 * for it when there was none.
 */
export interface OnboardingSample {
    project_uuid: string
    team_uuid: string
    made_team?: boolean
    created_at: string
}

// Made once (a second call answers with the same one), and removed in one
// step, which archives only what it made.
export async function makeSampleProject(): Promise<OnboardingSample> {
    const res = await axiosInstance.post(`${onboardingUrl}/sample`)
    return (res.data as { data: OnboardingSample }).data
}

export async function removeSampleProject(): Promise<void> {
    await axiosInstance.post(`${onboardingUrl}/sample/remove`)
}
