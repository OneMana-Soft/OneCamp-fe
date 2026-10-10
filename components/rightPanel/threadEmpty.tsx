import { EmptyState } from "@/components/ui/empty-state"
import { SpotWelcome } from "@/components/ui/graphics/spots"

/**
 * A thread nobody has replied to yet: the small welcome spot and one line
 * pointing at the composer. Under the message it showed nothing at all.
 */
export function ThreadEmpty() {
    return (
        <EmptyState
            illustration={<SpotWelcome />}
            title="No replies yet"
            description="Reply below to start the thread."
            className="py-6"
            headingLevel={4}
        />
    )
}
