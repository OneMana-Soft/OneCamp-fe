import axiosInstance from "@/lib/axiosInstance"

// What this workspace still needs before it is useful.
//
// Every step is DERIVED by the backend from the live workspace on each read, so
// there is nothing here to keep in sync and no local state that can disagree with
// what the workspace actually contains. Only the dismissal is stored, because a
// preference cannot be derived from anything.

export interface OnboardingStep {
    id: string
    title: string
    detail: string
    /** A frontend route. Owned by the backend so a step and its destination cannot drift apart. */
    href: string
    done: boolean
}

export interface OnboardingState {
    dismissed: boolean
    steps: OnboardingStep[]
    done: number
    total: number
    complete: boolean
}

// One definition of the path, because the reader's SWR cache key and the writer's
// target have to be the same string.
export const onboardingUrl = "/admin/onboarding"

export async function getOnboardingStatus(): Promise<OnboardingState | undefined> {
    const res = await axiosInstance.get(onboardingUrl)
    return (res.data as { data?: OnboardingState })?.data
}

export async function dismissOnboarding(): Promise<void> {
    await axiosInstance.post(`${onboardingUrl}/dismiss`)
}
