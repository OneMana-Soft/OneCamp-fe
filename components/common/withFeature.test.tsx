import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

/**
 * withFeature decides whether a whole area of the product is offered, so the cases that
 * matter are the ones where availability is unknown or in flux, not the happy path.
 *
 * OneCamp ships in two editions: v1 has no AI packages and therefore no AI routes, and
 * on v2 an admin can switch AI off. A control that survives either case is a control
 * whose every click fails, and the user only finds that out after clicking.
 */

let features: Record<string, boolean> | undefined = { ai: true }

vi.mock("@/hooks/useClientConfig", () => ({
    FEATURE_AI: "ai",
    useClientConfig: () => ({ features }),
    useFeature: (name: string) => features?.[name] === true,
}))

const { FeatureGate, withAI, withFeature } = await import("./withFeature")

const Marker = () => <div>subsystem ui</div>
const GatedAI = withAI(Marker)

afterEach(() => {
    cleanup()
    features = { ai: true }
})

describe("withFeature", () => {
    it("renders the component when the subsystem is available", () => {
        features = { ai: true }
        render(<GatedAI />)
        expect(screen.queryByText("subsystem ui")).not.toBeNull()
    })

    it("renders nothing when the subsystem is switched off", () => {
        // v2 with AI turned off, or a provider never configured: the routes exist and
        // refuse every call.
        features = { ai: false }
        render(<GatedAI />)
        expect(screen.queryByText("subsystem ui")).toBeNull()
    })

    it("renders nothing when the subsystem is absent from the build", () => {
        // The AI-free v1 edition. Absent is a different fact from false — the routes do
        // not exist at all — and both must hide the UI.
        features = {}
        render(<GatedAI />)
        expect(screen.queryByText("subsystem ui")).toBeNull()
    })

    it("renders nothing while the config request is still in flight", () => {
        // FAILS CLOSED. The alternative is painting AI controls optimistically and
        // removing them a moment later, so a customer on the AI-free edition watches AI
        // features flicker in and out on every page load.
        features = undefined
        render(<GatedAI />)
        expect(screen.queryByText("subsystem ui")).toBeNull()
    })

    it("passes props through untouched", () => {
        // The wrapper must be invisible to callers, or gating a component would mean
        // rewriting every place that renders it.
        const Greeter = ({ name, times }: { name: string; times: number }) => (
            <div>{`${name}:${times}`}</div>
        )
        const Gated = withFeature("ai", Greeter)
        features = { ai: true }
        render(<Gated name="ada" times={3} />)
        expect(screen.queryByText("ada:3")).not.toBeNull()
    })

    it("does not mount the component at all when unavailable", () => {
        // Stronger than "renders nothing": the component's effects must never run, so a
        // gated component makes no requests on a server that has no route for them. That
        // is what keeps the AI-free edition free of 404s on every page load.
        const mounted = vi.fn()
        const Probe = () => {
            mounted()
            return <div>probe</div>
        }
        const Gated = withFeature("ai", Probe)

        features = { ai: false }
        render(<Gated />)
        expect(mounted, "the gated component was mounted despite the subsystem being unavailable").not.toHaveBeenCalled()

        features = { ai: true }
        render(<Gated />)
        expect(mounted).toHaveBeenCalled()
    })

    it("gates on the named feature only", () => {
        // One registry serves every optional subsystem, so a component gated on one must
        // not be revealed by another being available.
        const Other = withFeature("transcription", Marker)
        features = { ai: true }
        render(<Other />)
        expect(screen.queryByText("subsystem ui")).toBeNull()
    })

    it("names the wrapper for React DevTools and error stacks", () => {
        const Gated = withFeature("ai", Marker)
        expect(Gated.displayName).toBe("withFeature(ai)(Marker)")
    })
})

describe("FeatureGate", () => {
    it("renders children when the subsystem is available", () => {
        features = { calls: true }
        render(
            <FeatureGate feature="calls">
                <div>call button</div>
            </FeatureGate>,
        )
        expect(screen.queryByText("call button")).not.toBeNull()
    })

    it("renders nothing when the subsystem is absent", () => {
        // The shipped compose file includes no LiveKit server, so a self-hosted install
        // has calls only if the operator runs one. Until then the control must not exist.
        features = {}
        render(
            <FeatureGate feature="calls">
                <div>call button</div>
            </FeatureGate>,
        )
        expect(screen.queryByText("call button")).toBeNull()
    })

    it("adds no wrapper element to the DOM", () => {
        // These gates sit inside flex toolbars. A stray <div> or <span> would change the
        // spacing of a header that is otherwise untouched, so the gate has to be
        // invisible when it passes as well as when it blocks.
        features = { calls: true }
        const { container } = render(
            <FeatureGate feature="calls">
                <button type="button">join</button>
            </FeatureGate>,
        )
        expect(container.firstChild?.nodeName).toBe("BUTTON")
        expect(container.childElementCount).toBe(1)
    })

    it("does not mount children when unavailable", () => {
        // Same reason as the HOC: a mounted child would run its effects and call
        // endpoints the server does not serve.
        const mounted = vi.fn()
        const Child = () => {
            mounted()
            return <div>child</div>
        }
        features = { calls: false }
        render(
            <FeatureGate feature="calls">
                <Child />
            </FeatureGate>,
        )
        expect(mounted).not.toHaveBeenCalled()
    })
})
