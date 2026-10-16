import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

/**
 * The weekly channel report has two gates: the workspace switch is the ceiling
 * and the channel opt-in sits beneath it. The case that matters is the one a
 * channel moderator can do nothing about — when the workspace has the feature
 * off, the control must not appear at all, because a switch that the backend
 * would refuse is worse than no switch.
 */

let response: unknown = { data: { org_enabled: true, enabled: false, can_manage: true } }

vi.mock("@/hooks/useClientConfig", () => ({
    FEATURE_AI: "ai",
    useClientConfig: () => ({ features: { ai: true } }),
    useFeature: () => true,
}))
// mutate runs the write as SWR does, and a refusal rejects it.
vi.mock("@/hooks/useFetch", () => ({
    useFetch: () => ({ data: response, mutate: vi.fn(async (write: () => Promise<unknown>) => write()) }),
}))
const { toasted, setReport } = vi.hoisted(() => ({ toasted: vi.fn(), setReport: vi.fn() }))
vi.mock("@/hooks/use-toast", () => ({ toast: toasted, useToast: () => ({ toast: toasted }) }))
vi.mock("@/services/channelReportService", () => ({
    channelWeeklyReportUrl: (id: string) => `/ch/weeklyReport/${id}`,
    setChannelWeeklyReport: setReport,
}))
vi.mock("@/lib/icons", () => ({ CalendarClock: () => <span /> }))
vi.mock("@/components/dialog/editChannelDialog", () => ({
    SettingRow: ({ label, children }: { label: string; children: React.ReactNode }) => (
        <div>
            <span>{label}</span>
            {children}
        </div>
    ),
}))
vi.mock("@/components/ui/switch", () => ({
    Switch: ({ checked, disabled, onCheckedChange }: { checked: boolean; disabled?: boolean; onCheckedChange?: (v: boolean) => void }) => (
        <button role="switch" aria-checked={checked} disabled={disabled} onClick={() => onCheckedChange?.(!checked)} />
    ),
}))

const { ChannelWeeklyReportSetting } = await import("./ChannelWeeklyReportSetting")

afterEach(() => {
    cleanup()
    response = { data: { org_enabled: true, enabled: false, can_manage: true } }
    toasted.mockClear()
    setReport.mockReset()
})

describe("ChannelWeeklyReportSetting", () => {
    it("renders nothing when the workspace has the report switched off", () => {
        response = { data: { org_enabled: false, enabled: false, can_manage: true } }
        const { container } = render(<ChannelWeeklyReportSetting channelUUID="c1" />)
        expect(container).toBeEmptyDOMElement()
    })

    it("renders nothing when the read failed, rather than a misleading off", () => {
        response = undefined
        const { container } = render(<ChannelWeeklyReportSetting channelUUID="c1" />)
        expect(container).toBeEmptyDOMElement()
    })

    it("offers the switch to a channel moderator once the workspace allows it", () => {
        render(<ChannelWeeklyReportSetting channelUUID="c1" />)
        expect(screen.getByRole("switch")).not.toBeDisabled()
    })

    it("shows the state read-only to a member who cannot manage the channel", () => {
        response = { data: { org_enabled: true, enabled: true, can_manage: false } }
        render(<ChannelWeeklyReportSetting channelUUID="c1" />)
        const sw = screen.getByRole("switch")
        expect(sw).toBeDisabled()
        expect(sw).toHaveAttribute("aria-checked", "true")
    })

    // A refusal said "Something went wrong" (QA F-35).
    it("says which way the report didn't go when the server refuses", async () => {
        setReport.mockRejectedValue(Object.assign(new Error("Request failed with status code 500"), { response: { status: 500, data: {} } }))
        render(<ChannelWeeklyReportSetting channelUUID="c1" />)
        fireEvent.click(screen.getByRole("switch"))
        await vi.waitFor(() =>
            expect(toasted).toHaveBeenCalledWith(expect.objectContaining({ title: "Couldn't turn on the weekly report", variant: "destructive" })),
        )
    })
})
