import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { SWRConfig } from "swr"

// A4 H4 (slack TN-87): "Push to my phone while I'm in OneCamp", the person's
// own notify.push_delay (minutes 0, 1, 5 or 10; 1 when never set), a row of
// the notification settings card. It reads and saves through the one
// preferences hook (lib/preferences/usePreference) under a real SWR cache: a
// choice shows at once and is sent; one the server refuses, or one sent
// offline, goes back and the row says why. The control is the shared Select.

const { get, put } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { get, put, post: vi.fn() } }))
// The shared toast, read back: what a choice says and the Undo it offers.
type Toasted = { title?: string; action?: { props: { onClick: () => Promise<void> } } }
const toast = vi.hoisted(() => vi.fn<(t: Toasted) => void>())
vi.mock("@/hooks/use-toast", async (orig) => ({ ...(await orig<object>()), useToast: () => ({ toast }), toast }))
// The app's read, as SWR keeps it (the cache the preferences hook writes to).
vi.mock("@/hooks/useFetch", async () => {
  const { default: useSWR } = await import("swr")
  return {
    useFetch: (url: string) => {
      const r = useSWR(url, async (u: string) => (await get(u)).data)
      return { data: r.data, isLoading: r.isLoading, isError: r.error, mutate: r.mutate }
    },
  }
})

import { SWRMutateBridge } from "@/components/providers/SWRMutateBridge"
import { NotificationPreferencesCard } from "./NotificationPreferencesCard"

const LABEL = "Push to my phone while I'm in OneCamp"
const HELP = "While you're in OneCamp, a push waits this long and is skipped if you read it first."
const CHOICES = ["Right away", "After 1 minute", "After 5 minutes", "After 10 minutes"]

// The picker's chunk (the Select's own phone-sheet chunk), loaded once before any test runs (V-61,
// lib/testing/inTestImportsGuard).
beforeAll(async () => {
  await import("@/components/ui/selectSheet")
})

let mine: Promise<unknown>
beforeEach(() => {
  mine = Promise.resolve({ data: { data: {} } })
  get.mockReset()
  put.mockReset()
  toast.mockReset()
  get.mockImplementation((url: string) =>
    url === "/user/preferences" ? mine : Promise.resolve({ data: { data: { email_supported: true, email_enabled: true }, status: "success" } }),
  )
})
// A choice's toast loads on first use (import()): let any offer still on its
// way land before the next test counts its own.
afterEach(async () => {
  await act(async () => void (await import("@/components/ui/undoToast")))
  cleanup()
})

function mount() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>
      <SWRMutateBridge />
      <NotificationPreferencesCard />
    </SWRConfig>,
  )
}
const trigger = () => screen.findByRole("combobox", { name: LABEL })
const row = async () => (await trigger()).closest("[data-setting-row]") as HTMLElement
async function choose(name: string) {
  fireEvent.keyDown(await trigger(), { key: "ArrowDown" })
  await act(async () => void fireEvent.click(await screen.findByRole("option", { name })))
}
const offered = () => toast.mock.calls.map(([t]) => t).filter((t) => t.action)

describe("Push to my phone while I'm in OneCamp", () => {
  it("is a row of its own section, says what it does, and offers right away, 1, 5 or 10 minutes; never set, it's 1 minute", async () => {
    mount()
    expect(await trigger()).toHaveTextContent("After 1 minute")
    expect(await row()).toHaveTextContent(HELP)
    expect(document.getElementById("notifications-push")).toContainElement(await trigger())
    fireEvent.keyDown(await trigger(), { key: "ArrowDown" })
    expect((await screen.findAllByRole("option")).map((o) => o.textContent)).toEqual(CHOICES)
  })

  it("shows the person's own choice", async () => {
    mine = Promise.resolve({ data: { data: { "notify.push_delay": 10 } } })
    mount()
    await waitFor(async () => expect(await trigger()).toHaveTextContent("After 10 minutes"))
  })

  it("a choice shows at once, is sent as the person's own preference, and the row says it's saved", async () => {
    let answer!: () => void
    put.mockReturnValue(new Promise<void>((resolve) => (answer = resolve)))
    mount()
    await choose("After 5 minutes")
    expect(await trigger()).toHaveTextContent("After 5 minutes")
    expect(put).toHaveBeenCalledTimes(1)
    expect(put.mock.calls[0].slice(0, 2)).toEqual(["/user/preferences/notify.push_delay", { value: 5 }])
    await act(async () => answer())
    await waitFor(async () => expect(await row()).toHaveTextContent("Saved"))
    expect(await trigger()).toHaveTextContent("After 5 minutes")
  })

  it("waits while a choice is saving: the picker takes no other until the server answers", async () => {
    let answer!: () => void
    put.mockReturnValue(new Promise<void>((resolve) => (answer = resolve)))
    mount()
    await choose("After 5 minutes")
    expect(await trigger()).toBeDisabled()
    await act(async () => answer())
    await waitFor(async () => expect(await trigger()).toBeEnabled())
    expect(put).toHaveBeenCalledTimes(1)
  })

  it("offers the choice back: Undo puts the one it had back, and offers nothing more", async () => {
    put.mockResolvedValue({ data: { status: "success" } })
    mine = Promise.resolve({ data: { data: { "notify.push_delay": 10 } } })
    mount()
    await waitFor(async () => expect(await trigger()).toHaveTextContent("After 10 minutes"))
    await choose("After 5 minutes")
    await waitFor(() => expect(offered().map((t) => t.title)).toEqual(["Push to my phone: After 5 minutes"]))
    await act(async () => {
      await offered()[0].action!.props.onClick()
    })
    expect(put.mock.calls.map((c) => c.slice(0, 2))).toEqual([
      ["/user/preferences/notify.push_delay", { value: 5 }],
      ["/user/preferences/notify.push_delay", { value: 10 }],
    ])
    await waitFor(async () => expect(await trigger()).toHaveTextContent("After 10 minutes"))
    expect(offered()).toHaveLength(1)
  })

  it.each([
    ["refused", { response: { status: 400, data: { msg: "Choose right away, or 1, 5 or 10 minutes." } } }, "Choose right away, or 1, 5 or 10 minutes."],
    ["offline", { message: "Network Error" }, "The server could not be reached. Check your connection and try again in a moment."],
  ])("a choice %s goes back, and the row says why", async (_, err, why) => {
    put.mockRejectedValue(err)
    mount()
    await choose("Right away")
    await waitFor(async () => expect(await row()).toHaveTextContent(`Not saved. ${why}`))
    expect(await trigger()).toHaveTextContent("After 1 minute")
  })

  it("holds the row's shape while the preferences load, and a failed read says so and asks again", async () => {
    let fail!: (e: unknown) => void
    mine = new Promise((_, reject) => (fail = reject))
    mount()
    const section = await waitFor(() => {
      const s = document.getElementById("notifications-push")
      expect(s).not.toBeNull()
      return s as HTMLElement
    })
    expect(within(section).getByRole("status")).toBeInTheDocument()
    expect(within(section).queryByRole("combobox")).toBeNull()
    await act(async () => fail({ response: { status: 503 } }))
    const alert = await within(section).findByRole("alert")
    expect(alert).toHaveTextContent("Couldn't load your push setting.")
    mine = Promise.resolve({ data: { data: { "notify.push_delay": 0 } } })
    const asked = get.mock.calls.filter(([u]) => u === "/user/preferences").length
    await act(async () => void fireEvent.click(within(alert).getByRole("button", { name: "Try again" })))
    expect(get.mock.calls.filter(([u]) => u === "/user/preferences").length).toBe(asked + 1)
    await waitFor(async () => expect(await trigger()).toHaveTextContent("Right away"))
  })
})
