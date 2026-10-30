import { describe, expect, it } from "vitest"
import { cameraConstraints, micConstraints } from "./greenRoomCamera"
import { callRoomOptions } from "./roomOptions"

describe("the green room's camera and microphone", () => {
  it("opens the camera picked before, else the browser's, at 720p, as LiveKit opened it", () => {
    expect(cameraConstraints("cam-2")).toEqual({ deviceId: { ideal: "cam-2" }, width: 1280, height: 720 })
    expect(cameraConstraints(undefined)).toEqual({ width: 1280, height: 720 })
    expect(cameraConstraints("")).toEqual({ width: 1280, height: 720 })
  })

  it("listens to the microphone picked before, else the browser's, asked as the call asks for it", () => {
    // LiveKit's own audio defaults (livekit-client's audioDefaults, which the
    // call keeps underneath), then the call's, as the room's options give them.
    const liveKit = { autoGainControl: true, echoCancellation: true, noiseSuppression: true, voiceIsolation: true }
    const call = callRoomOptions({}, false).audioCaptureDefaults
    expect(micConstraints("mic-2")).toEqual({ ...liveKit, ...call, deviceId: { exact: "mic-2" } })
    expect(micConstraints(undefined)).toEqual({ ...liveKit, ...call })
  })
})
