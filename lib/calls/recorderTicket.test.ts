import { describe, expect, it } from "vitest"
import { readRecorderTicket } from "./recorderTicket"

describe("the recorder's ticket", () => {
  it("is read from the fragment the backend's redirect sets", () => {
    expect(readRecorderTicket("#lk=wss%3A%2F%2Flive.example.com&t=abc.def.ghi")).toEqual({ url: "wss://live.example.com", token: "abc.def.ghi" })
    expect(readRecorderTicket("lk=ws://127.0.0.1:7880/rtc&t=x")).toEqual({ url: "ws://127.0.0.1:7880/rtc", token: "x" })
  })

  it("is nothing without a token or with a LiveKit address that isn't ws(s)", () => {
    for (const hash of ["", "#", "#lk=wss://live.example.com", "#t=abc", "#lk=https://live.example.com&t=abc", "#lk=javascript:alert(1)&t=abc", "#lk=wss://a b&t=abc"]) {
      expect(readRecorderTicket(hash), hash).toBeNull()
    }
  })
})
