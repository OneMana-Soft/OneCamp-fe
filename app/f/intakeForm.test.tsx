import { Suspense } from "react"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const getForm = vi.fn()
const sendForm = vi.fn()
vi.mock("@/services/formService", () => ({
  getForm: (t: string) => getForm(t),
  sendForm: (...a: unknown[]) => sendForm(...a),
  formPicture: (path?: string) => (path ? `https://api.camp.test${path}` : undefined),
}))
const uploadFormFile = vi.fn()
vi.mock("@/services/formFiles", () => ({ uploadFormFile: (...a: unknown[]) => uploadFormFile(...a) }))
vi.mock("@/components/public/MadeWithOneCamp", () => ({ MadeWithOneCamp: () => null }))
const celebrateTask = vi.fn<(el: Element | null) => number>(() => 8)
vi.mock("@/lib/celebrate", () => ({ celebrateTask: (el: Element | null) => celebrateTask(el) }))

import IntakeForm from "@/app/f/[token]/page"
import { warmBursts } from "@/lib/celebrateSoon"

// The celebrations' bursts are a chunk fetched when the page is idle
// (lib/celebrateSoon): here they are in before anything finishes.
beforeAll(async () => {
  await warmBursts()
  // The form's pages are a chunk of their own, fetched with its questions.
  await import("@/components/forms/FormPages")
})

const form = {
  title: "Website change request",
  description: "Tell us what to change.",
  fields: [
    { id: "what", label: "What should change?", type: "long_text", required: true },
    { id: "email", label: "Your email", type: "email", required: false },
  ],
}

/** The demo's form, as GET /public/form answers it: a bug opens its steps, and "About you" is a page of its own. */
const paged = {
  title: "Launch requests",
  description: "Need something from the launch team?",
  confirmation: "Thanks! It's on the launch team's board now.",
  fields: [
    { id: "what", label: "What do you need?", type: "short_text", required: true },
    { id: "kind", label: "What kind of request is it?", type: "select", required: false, options: ["Copy", "Design", "A bug"] },
    { id: "steps", label: "How do we see the bug?", type: "long_text", required: true, help: "The page, what you did, and what happened.", show_if: { question: "kind", op: "is", values: ["A bug"] } },
    { id: "about", label: "About you", type: "section", required: false, help: "So we know who to follow up with." },
    { id: "teams", label: "Your teams", type: "multi_select", required: true, options: ["Sales", "Support", "Marketing"] },
    { id: "site", label: "Your site", type: "url", required: false },
    { id: "phone", label: "A number to call", type: "phone", required: false },
  ],
}

async function open() {
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <IntakeForm params={Promise.resolve({ token: "tok" })} />
      </Suspense>,
    )
  })
}

/** Picks a choice through the select's native twin, as a browser's autofill (and the journey audit) does. */
function choose(label: RegExp, value: string) {
  const trigger = screen.getByRole("combobox", { name: label })
  const native = trigger.parentElement!.querySelector("select")!
  fireEvent.change(native, { target: { value } })
}

describe("a public intake form (work.md W46)", () => {
  beforeEach(() => {
    getForm.mockReset().mockResolvedValue({ ok: true, data: form })
    sendForm.mockReset().mockResolvedValue({ ok: true, data: {} })
    celebrateTask.mockClear()
  })
  afterEach(() => cleanup())

  // Tables B5c-2: the form's cover runs across the sheet's top and its logo sits over the title, both drawn from the
  // server by the paths the form gives; a picture that can't load is left out, never drawn broken.
  it("wears its cover and its logo over the title, and leaves out one that can't load", async () => {
    getForm.mockResolvedValue({ ok: true, data: { ...form, cover: "/public/form/tok/cover", logo: "/public/form/tok/logo" } })
    await open()
    expect(await screen.findByRole("heading", { name: "Website change request" })).toBeInTheDocument()
    const cover = document.querySelector<HTMLImageElement>("[data-form-cover]")
    const logo = document.querySelector<HTMLImageElement>("[data-form-logo]")
    expect(cover?.getAttribute("src")).toBe("https://api.camp.test/public/form/tok/cover")
    expect(logo?.getAttribute("src")).toBe("https://api.camp.test/public/form/tok/logo")
    // Their dress, not their words: a screen reader goes from the page straight to the title.
    expect(cover?.getAttribute("alt")).toBe("")
    expect(logo?.getAttribute("alt")).toBe("")
    act(() => {
      fireEvent.error(logo!)
    })
    expect(document.querySelector("[data-form-logo]")).toBeNull()
    expect(document.querySelector("[data-form-cover]")).not.toBeNull()
  })

  it("wears nothing over the title when it has no pictures", async () => {
    await open()
    expect(await screen.findByRole("heading", { name: "Website change request" })).toBeInTheDocument()
    expect(document.querySelector("[data-form-look]")).toBeNull()
  })

  it("sits on one sheet card under the form's light", async () => {
    await open()
    expect(await screen.findByRole("heading", { name: "Website change request" })).toBeInTheDocument()
    expect(document.querySelector("[data-form-band]")).not.toBeNull()
    expect(document.querySelector("[data-form-sheet]")).not.toBeNull()
  })

  it("says Required in words, only on the questions that are", async () => {
    await open()
    expect((await screen.findByText("What should change?")).parentElement!.textContent).toContain("Required")
    expect(screen.getByText("Your email").textContent).not.toContain("Required")
    expect(document.body.textContent).not.toContain("*")
  })

  it("thanks the sender with one celebration once it is sent", async () => {
    await open()
    fireEvent.change(await screen.findByLabelText(/What should change/), { target: { value: "The pricing page" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send" })))
    expect(sendForm).toHaveBeenCalledWith("tok", { what: "The pricing page" }, "", "")
    expect(screen.getByRole("heading", { name: "Sent" })).toBeInTheDocument()
    expect(screen.getByText(/The team behind “Website change request” has it now/)).toBeInTheDocument()
    expect(celebrateTask).toHaveBeenCalledTimes(1)
  })

  it("takes a number as typed, in the sender's signs, and says at the question what isn't one before sending", async () => {
    getForm.mockResolvedValue({ ok: true, data: { ...form, fields: [...form.fields, { id: "seats", label: "Seats", type: "number", required: false }] } })
    await open()
    const seats = (await screen.findByLabelText(/Seats/)) as HTMLInputElement
    // Text, not a browser number input, which rewrote "1,5" in its own locale or emptied it.
    expect(seats.type).toBe("text")
    expect(seats.inputMode).toBe("decimal")
    fireEvent.change(screen.getByLabelText(/What should change/), { target: { value: "The pricing page" } })
    fireEvent.change(seats, { target: { value: "12 kg" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send" })))
    expect(sendForm).not.toHaveBeenCalled()
    expect(seats.getAttribute("aria-invalid")).toBe("true")
    expect(document.getElementById(seats.getAttribute("aria-describedby")!.split(" ").pop()!)?.textContent).toBe("“Seats” needs a number.")
    expect(document.activeElement).toBe(seats)
    fireEvent.change(seats, { target: { value: "12" } })
    expect(seats.getAttribute("aria-invalid")).toBeNull()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send" })))
    expect(sendForm).toHaveBeenCalledWith("tok", { what: "The pricing page", seats: "12" }, "", "")
  })

  it("says so when the form is gone, as every public link does (PTC-19)", async () => {
    getForm.mockResolvedValue({ ok: false, status: 404, msg: "" })
    await open()
    expect(screen.getByRole("heading", { name: "This form doesn't exist or was deleted" })).toBeInTheDocument()
    expect(document.querySelector("[data-public-gone]")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Try again/ })).toBeNull()
  })

  it("says a server that didn't answer couldn't load the form, and Try again reads it again", async () => {
    getForm.mockResolvedValueOnce({ ok: false, status: 503, msg: "" })
    await open()
    expect(screen.getByText("Couldn't load this form")).toBeInTheDocument()
    getForm.mockResolvedValueOnce({ ok: true, status: 200, data: form })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Try again/ })))
    expect(getForm).toHaveBeenCalledTimes(2)
  })
})

describe("a form with pages and branches (package 9 R4)", () => {
  beforeEach(() => {
    getForm.mockReset().mockResolvedValue({ ok: true, data: paged })
    sendForm.mockReset().mockResolvedValue({ ok: true, data: {} })
  })
  afterEach(() => cleanup())

  it("goes page by page: Next checks the page in the server's words, and Back keeps what was written", async () => {
    await open()
    expect(await screen.findByText("Page 1 of 2")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull()
    const next = screen.getByRole("button", { name: "Next" })
    expect(next.getAttribute("type")).toBe("submit")
    await act(async () => fireEvent.click(next))
    // At the question, plainly: the question is right above it.
    expect(screen.getByText("This needs an answer.")).toBeInTheDocument()
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/What do you need/), { target: { value: "A launch banner" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Next" })))
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument()
    const about = screen.getByRole("heading", { name: "About you" })
    expect(document.activeElement).toBe(about)
    expect(screen.getByText("So we know who to follow up with.")).toBeInTheDocument()
    expect(screen.queryByLabelText(/What do you need/)).toBeNull()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Back" })))
    expect((screen.getByLabelText(/What do you need/) as HTMLInputElement).value).toBe("A launch banner")
  })

  it("opens a question when its answer comes, with its help under the label, and never sends a hidden answer", async () => {
    await open()
    await screen.findByText("Page 1 of 2")
    expect(screen.queryByLabelText(/How do we see the bug/)).toBeNull()
    fireEvent.change(screen.getByLabelText(/What do you need/), { target: { value: "The pricing page is broken" } })
    choose(/What kind of request/, "A bug")
    const steps = screen.getByLabelText(/How do we see the bug/)
    expect(document.getElementById(steps.getAttribute("aria-describedby")!.split(" ")[0])?.textContent).toBe("The page, what you did, and what happened.")
    fireEvent.change(steps, { target: { value: "Open /pricing" } })
    // Changed its mind: the steps go, and so does their answer.
    choose(/What kind of request/, "Copy")
    expect(screen.queryByLabelText(/How do we see the bug/)).toBeNull()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Next" })))
    const teams = screen.getByRole("group", { name: /Your teams/ })
    const sales = within(teams).getByRole("button", { name: "Sales" })
    expect(sales.getAttribute("aria-pressed")).toBe("false")
    expect((screen.getByLabelText(/Your site/) as HTMLInputElement).type).toBe("url")
    expect((screen.getByLabelText(/A number to call/) as HTMLInputElement).type).toBe("tel")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send" })))
    expect(sendForm).not.toHaveBeenCalled()
    expect(screen.getByText("This needs an answer.")).toBeInTheDocument()
    fireEvent.click(sales)
    fireEvent.click(within(teams).getByRole("button", { name: "Support" }))
    expect(sales.getAttribute("aria-pressed")).toBe("true")
    fireEvent.change(screen.getByLabelText(/Your site/), { target: { value: "launch.example.com" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send" })))
    expect(screen.getByText("“Your site” needs a link that starts with https://.")).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/Your site/), { target: { value: "https://launch.example.com" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send" })))
    expect(sendForm).toHaveBeenCalledWith("tok", { what: "The pricing page is broken", kind: "Copy", teams: ["Sales", "Support"], site: "https://launch.example.com" }, "", "")
  })

  it("thanks the sender in the form's own words", async () => {
    await open()
    fireEvent.change(await screen.findByLabelText(/What do you need/), { target: { value: "A banner" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Next" })))
    fireEvent.click(within(screen.getByRole("group", { name: /Your teams/ })).getByRole("button", { name: "Sales" }))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send" })))
    expect(screen.getByRole("heading", { name: "Sent" })).toBeInTheDocument()
    expect(screen.getByText("Thanks! It's on the launch team's board now.")).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send another" })))
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument()
    expect((screen.getByLabelText(/What do you need/) as HTMLInputElement).value).toBe("")
  })

  it("says the server's words when it refuses, and keeps the answers", async () => {
    sendForm.mockResolvedValue({ ok: false, status: 400, msg: "This form is taking a lot of answers right now. Try again in a while." })
    await open()
    fireEvent.change(await screen.findByLabelText(/What do you need/), { target: { value: "A banner" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Next" })))
    fireEvent.click(within(screen.getByRole("group", { name: /Your teams/ })).getByRole("button", { name: "Sales" }))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send" })))
    expect(screen.getByRole("alert").textContent).toBe("This form is taking a lot of answers right now. Try again in a while.")
    expect(within(screen.getByRole("group", { name: /Your teams/ })).getByRole("button", { name: "Sales" }).getAttribute("aria-pressed")).toBe("true")
  })
})

/** A bug report that takes screenshots: files the visitor adds before sending. */
const withFiles = {
  title: "Launch requests",
  description: "",
  fields: [
    { id: "what", label: "What do you need?", type: "short_text", required: true },
    { id: "shots", label: "Screenshots", type: "file", required: true, help: "Where it goes wrong." },
  ],
  files: { max: 5, mb: 10 },
}

const CLAIM = "c".repeat(64)
const fileId = (n: number) => `00000000-0000-4000-8000-00000000000${n}`
const picture = (name: string, size = 2048) => new File([new Uint8Array(size)], name, { type: "image/png" })

/** Picks files through the question's own input, as a browser's file chooser does. */
function pick(...files: File[]) {
  const input = document.querySelector<HTMLInputElement>("[data-form-file-input]")!
  fireEvent.change(input, { target: { files } })
}

describe("a form that takes files (package 9 R4b)", () => {
  let progress: ((pct: number) => void) | undefined
  let finish: ((v: unknown) => void) | undefined
  beforeEach(() => {
    getForm.mockReset().mockResolvedValue({ ok: true, data: withFiles })
    sendForm.mockReset().mockResolvedValue({ ok: true, data: {} })
    uploadFormFile.mockReset().mockImplementation((_t: string, _q: string, file: File, _c: string, onProgress: (pct: number) => void) => {
      progress = onProgress
      return new Promise((resolve) => {
        finish = resolve
      }).then((v) => v ?? { ok: true, data: { claim: CLAIM, file: { id: fileId(1), name: file.name, size: file.size, mime: "image/png" } } })
    })
  })
  afterEach(() => cleanup())

  it("sends each file as it is picked, shows how far it has got, and sends the form with its id and the claim", async () => {
    await open()
    expect(await screen.findByText("Up to 5 files, 10 MB each")).toBeInTheDocument()
    pick(picture("checkout.png"))
    expect(uploadFormFile).toHaveBeenCalledWith("tok", "shots", expect.any(File), expect.stringMatching(/^[0-9a-f]{64}$/), expect.any(Function), expect.any(AbortSignal))
    const claim = uploadFormFile.mock.calls[0][3]
    const row = screen.getByRole("listitem", { name: /checkout\.png/ })
    await act(async () => progress!(40))
    expect(within(row).getByRole("progressbar")).toBeInTheDocument()
    await act(async () => finish!(undefined))
    expect(within(row).queryByRole("progressbar")).toBeNull()
    expect(within(row).getByText("2 KB")).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/What do you need/), { target: { value: "Checkout crashes" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send" })))
    expect(sendForm).toHaveBeenCalledWith("tok", { what: "Checkout crashes", shots: [fileId(1)] }, "", claim)
  })

  it("sends every file under one claim of the page's own, even side by side", async () => {
    await open()
    await screen.findByText("Up to 5 files, 10 MB each")
    pick(picture("one.png"), picture("two.png"))
    pick(picture("three.png"))
    const claims = new Set(uploadFormFile.mock.calls.map((c) => c[3]))
    expect(uploadFormFile).toHaveBeenCalledTimes(3)
    expect(claims.size).toBe(1)
    expect([...claims][0]).not.toBe(CLAIM)
  })

  it("says at the file what's wrong: too big here, or the server's words, and leaves it out", async () => {
    await open()
    await screen.findByText("Up to 5 files, 10 MB each")
    pick(picture("huge.png", 11 * 1024 * 1024))
    expect(uploadFormFile).not.toHaveBeenCalled()
    expect(within(screen.getByRole("listitem", { name: /huge\.png/ })).getByText("Too big: files can be up to 10 MB.")).toBeInTheDocument()
    pick(picture("setup.png"))
    await act(async () => finish!({ ok: false, status: 415, msg: "Files of this kind can't be uploaded." }))
    expect(within(screen.getByRole("listitem", { name: /setup\.png/ })).getByText("Files of this kind can't be uploaded.")).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/What do you need/), { target: { value: "Checkout crashes" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send" })))
    expect(sendForm).not.toHaveBeenCalled()
    expect(screen.getByText("This needs a file.")).toBeInTheDocument()
    // Taken away, a refused file is gone from the list.
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Remove setup.png" })))
    expect(screen.queryByRole("listitem", { name: /setup\.png/ })).toBeNull()
  })

  it("waits for a file still on its way before it sends", async () => {
    await open()
    fireEvent.change(await screen.findByLabelText(/What do you need/), { target: { value: "Checkout crashes" } })
    pick(picture("slow.png"))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send" })))
    expect(sendForm).not.toHaveBeenCalled()
    expect(screen.getByText("Wait for your files to finish sending.")).toBeInTheDocument()
    await act(async () => finish!(undefined))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send" })))
    expect(sendForm).toHaveBeenCalledTimes(1)
  })

  it("takes no more files than the question does, and a removed file is not sent", async () => {
    await open()
    await screen.findByText("Up to 5 files, 10 MB each")
    pick(...[1, 2, 3, 4, 5, 6].map((n) => picture(`shot-${n}.png`)))
    expect(uploadFormFile).toHaveBeenCalledTimes(5)
    expect(screen.getByText("Up to 5 files here: shot-6.png was left out.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Add files/ })).toBeNull()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Remove shot-1.png" })))
    expect(screen.getByRole("button", { name: /Add files/ })).toBeInTheDocument()
  })

  // Design review (DESIGN-BUILD-4, 22 Oct): a name is cut in the middle, so
  // its type stays in view, and a picture shows itself, so the visitor sees
  // the right screenshot is going.
  it("cuts a long name in the middle and shows a picture the visitor picked, letting it go when removed", async () => {
    const made: string[] = []
    const freed: string[] = []
    const was = { create: URL.createObjectURL, revoke: URL.revokeObjectURL }
    URL.createObjectURL = vi.fn(() => `blob:pic-${made.push("x")}`)
    URL.revokeObjectURL = vi.fn((u: string) => void freed.push(u))
    try {
      await open()
      await screen.findByText("Up to 5 files, 10 MB each")
      pick(picture("Checkout crash on the saved card screen.png"), new File(["a,b"], "Load test results.xlsx", { type: "application/vnd.ms-excel" }))
      const shot = screen.getByRole("listitem", { name: /Checkout crash/ })
      const [head, tail] = shot.querySelectorAll("[data-middle-name] > span")
      expect([head.textContent, tail.textContent]).toEqual(["Checkout crash on the saved card", " screen.png"])
      expect(shot.querySelector("img")?.getAttribute("src")).toBe("blob:pic-1")
      // Only pictures: a sheet keeps its kind's glyph.
      expect(screen.getByRole("listitem", { name: /Load test results/ }).querySelector("img")).toBeNull()
      expect(made).toHaveLength(1)
      await act(async () => fireEvent.click(screen.getByRole("button", { name: /^Remove Checkout crash/ })))
      expect(freed).toEqual(["blob:pic-1"])
    } finally {
      URL.createObjectURL = was.create
      URL.revokeObjectURL = was.revoke
    }
  })
})
