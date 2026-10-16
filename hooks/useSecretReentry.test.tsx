import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import * as React from "react"
import { useSecretReentry } from "@/hooks/useSecretReentry"

// One small form, as every settings form with a secret beside an address
// uses the hook: an address, the secret, and a save that asks the hook first.
function Form({ stored, savedUrl }: { stored: boolean; savedUrl: string }) {
  const [url, setUrl] = React.useState(savedUrl)
  const [key, setKey] = React.useState("")
  const [saved, setSaved] = React.useState(false)
  const reentry = useSecretReentry({ stored, entered: key, from: { url: savedUrl }, to: { url }, noun: "API key" })
  return (
    <div>
      <label htmlFor="u">Address</label>
      <input id="u" value={url} onChange={(e) => setUrl(e.target.value)} />
      <label htmlFor="k">API key</label>
      <input {...reentry.inputProps} id="k" value={key} onChange={(e) => setKey(e.target.value)} placeholder={reentry.placeholder ?? "Saved"} />
      {reentry.note}
      <button onClick={() => setSaved(reentry.check())}>Save</button>
      {saved && <p>saved</p>}
    </div>
  )
}

const hint = "Enter the API key again for the new address."

describe("a settings form's stored secret, kept for another address", () => {
  afterEach(cleanup)

  it("becomes required with the hint once the address moves, and stops the save there", () => {
    render(<Form stored savedUrl="https://models.example.com/v1" />)
    const key = screen.getByLabelText("API key")
    expect(key.hasAttribute("required")).toBe(false)
    expect(screen.queryByText(hint)).toBeNull()

    fireEvent.change(screen.getByLabelText("Address"), { target: { value: "https://elsewhere.example.net/v1" } })
    expect(key.hasAttribute("required")).toBe(true)
    expect(key.getAttribute("placeholder")).toBe("Enter it again for the new address")
    expect(screen.getByText(hint)).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(key.getAttribute("aria-invalid")).toBe("true")
    expect(document.activeElement).toBe(key)
    expect(screen.queryByText("saved")).toBeNull()

    fireEvent.change(key, { target: { value: "new-key" } })
    expect(key.getAttribute("aria-invalid")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(screen.getByText("saved")).toBeTruthy()
  })

  it("asks nothing for another path on the same host, or when nothing is stored", () => {
    render(<Form stored savedUrl="https://models.example.com/v1" />)
    fireEvent.change(screen.getByLabelText("Address"), { target: { value: "https://models.example.com/v2" } })
    expect(screen.queryByText(hint)).toBeNull()
    cleanup()
    render(<Form stored={false} savedUrl="https://models.example.com/v1" />)
    fireEvent.change(screen.getByLabelText("Address"), { target: { value: "https://elsewhere.example.net/v1" } })
    expect(screen.queryByText(hint)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(screen.getByText("saved")).toBeTruthy()
  })
})
