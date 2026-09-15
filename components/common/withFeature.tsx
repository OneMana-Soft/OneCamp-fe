"use client"

import type React from "react"

import type { LucideIcon } from "lucide-react"
import { FEATURE_AI, useFeature, useFeatureState } from "@/hooks/useClientConfig"
import { EmptyState } from "@/components/ui/empty-state"

/**
 * withFeature hides a component when the backend subsystem it depends on is not
 * available.
 *
 * WHY A WRAPPER RATHER THAN A CHECK INSIDE THE COMPONENT. The obvious version puts
 * `if (!useAIAvailable()) return null` at the top of each component, which breaks
 * the rules of hooks: every hook below the return is skipped on the renders that
 * bail out, and React fails with "rendered fewer hooks than expected" as soon as
 * availability changes while mounted. A wrapper calls exactly one hook and then
 * either mounts the component or does not, which is ordinary conditional
 * rendering and always safe.
 *
 * WHY WRAPPING THE COMPONENT RATHER THAN EACH USE. These entry points are rendered
 * from around twenty-five places between desktop and mobile. Gating at the call
 * sites means every one of them has to remember, and the next one added will not.
 * Wrapping the export covers every existing and future use, and the component is
 * the thing that actually knows which subsystem it needs.
 *
 * Fails closed through useFeature: an absent subsystem, one switched off, a config
 * request in flight and a failed request all render nothing.
 */
export function withFeature<P extends object>(
    feature: string,
    Component: React.ComponentType<P>,
): React.FC<P> {
    const Gated: React.FC<P> = (props) => {
        const available = useFeature(feature)
        if (!available) return null
        return <Component {...props} />
    }

    // Named so React DevTools and any component-stack in an error report show which
    // gate is involved, rather than an anonymous wrapper.
    Gated.displayName = `withFeature(${feature})(${Component.displayName || Component.name || "Component"})`
    return Gated
}

/**
 * FeatureGate is the same rule for INLINE JSX, where there is no component to wrap.
 *
 * Call controls, for instance, are written inline in the chat, channel and group
 * headers rather than being one shared component, so there is nothing to pass to
 * withFeature. Extracting a CallButton first would be a larger refactor of files
 * that have nothing else wrong with them, and this keeps the decision in one place
 * either way.
 *
 *   <FeatureGate feature={FEATURE_CALLS}>
 *     <Link href={callHref}>…</Link>
 *   </FeatureGate>
 *
 * Renders nothing at all when unavailable — no wrapper element — so it cannot
 * disturb the flex and gap layout of a toolbar it sits inside.
 */
export function FeatureGate({
    feature,
    children,
}: {
    feature: string
    children: React.ReactNode
}) {
    const available = useFeature(feature)
    if (!available) return null
    return <>{children}</>
}

/**
 * FeatureRoute is the gate for a whole PAGE, which is the entry point the button
 * gates above quietly do not cover.
 *
 * WHY IT IS NEEDED. Hiding a call button on a build with no LiveKit is only half
 * the job: /app/meet/instant is still routable, and a bookmark, a link pasted in
 * a channel, a browser back button or somebody's history all reach it. What they
 * reached was the pre-join screen, camera permission prompt included, and the
 * failure arrived only after the user pressed "Start meeting" — as a toast
 * blaming guest access, which is not what went wrong.
 *
 * It waits rather than guessing. The button gates fail closed while the config
 * request is in flight, which is right for a control and wrong for a page: the
 * same rule would open every call page on "not available here" and then swap in
 * the call, which reads as a product that is broken and then recovers. So this
 * renders nothing at all until the server has answered, and only then decides.
 */
export function FeatureRoute({
    feature,
    icon,
    title,
    description,
    children,
}: {
    feature: string
    icon?: LucideIcon
    title: string
    description: React.ReactNode
    children: React.ReactNode
}) {
    const state = useFeatureState(feature)
    if (state === "unknown") return null
    if (state === "unavailable") {
        return (
            <div className="flex h-full w-full items-center justify-center p-4">
                <EmptyState icon={icon} title={title} description={description} tone="accent" />
            </div>
        )
    }
    return <>{children}</>
}

/**
 * withAI gates a component on the AI subsystem, which is the case this exists for.
 *
 * It is false on the AI-free v1 edition, whose build contains no AI packages and
 * therefore serves no AI routes, and on v2 whenever an admin has switched AI off or
 * has not finished configuring a provider. In all of those cases an AI button is a
 * button whose every click fails.
 */
export function withAI<P extends object>(Component: React.ComponentType<P>): React.FC<P> {
    return withFeature(FEATURE_AI, Component)
}
