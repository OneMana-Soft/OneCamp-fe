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
    /**
     * Whether this step can be set aside. True only for a step that genuinely
     * does not apply to every workspace: "bring your Slack history over" is the
     * right first thing for a team migrating and meaningless for one that is not,
     * and nothing anywhere says which this is.
     */
    skippable?: boolean
    /** Set aside by an admin. Still sent, so the card can offer it back. */
    skipped?: boolean
}

export interface OnboardingState {
    dismissed: boolean
    steps: OnboardingStep[]
    done: number
    /** Steps still on the list. A set-aside step is in neither this nor `done`. */
    total: number
    complete: boolean
    /** How many were set aside, so the card can offer to show them again. */
    skipped: number
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

// Setting a step aside and putting it back are the same edit in two directions,
// so they are one call with a boolean rather than two that can disagree.
export async function setStepSkipped(id: string, skipped: boolean): Promise<void> {
    await axiosInstance.post(`${onboardingUrl}/skip`, { id, skipped })
}
