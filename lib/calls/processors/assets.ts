// Where this server serves the files the call effects load, so nothing is
// fetched from anyone else's servers while someone is on camera: MediaPipe's
// own defaults are a CDN (cdn.jsdelivr.net) for its WebAssembly and Google's
// storage for the model. scripts/calls-assets.mjs copies the packages' files
// (vendored.json) out of node_modules into public/ before every build; the
// segmenter's model is kept in the repo (public/calls/models). Every path
// names its version or its hash, so it can be cached for good.
//
// Licences (public/calls/THIRD-PARTY-NOTICES.txt): MediaPipe Tasks Vision and
// the selfie segmenter model, Apache-2.0 (the model card, read 17 Oct 2026);
// web-noise-suppressor, MIT; RNNoise, BSD-3-Clause, built by shiguredo's
// rnnoise-wasm, Apache-2.0. calls-assets.test.ts holds each one.

import vendored from "./vendored.json"

const dirOf = (pkg: string): string => {
  const p = vendored.packages.find((v) => v.pkg === pkg)
  if (!p) throw new Error(`${pkg} is not in vendored.json`)
  return `/${p.dir}`
}

/** The folder MediaPipe's FilesetResolver reads its loader and WebAssembly from. */
export const VISION_FILESET = dirOf("@mediapipe/tasks-vision")

/**
 * MediaPipe's selfie segmenter (float16, 256 x 256), from
 * storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/
 * on 17 Oct 2026, named by the start of its sha256.
 */
export const SEGMENTER_MODEL = "/calls/models/selfie_segmenter-191ac952.tflite"
export const SEGMENTER_MODEL_SHA256 = "191ac9529ae506ee0beefa6b2c945a172dab9d07d1e802a290a4e4038226658b"

const NOISE = dirOf("@sapphi-red/web-noise-suppressor")

/** RNNoise's AudioWorklet and its WebAssembly, with and without SIMD. */
export const RNNOISE = {
  worklet: `${NOISE}/rnnoise/workletProcessor.js`,
  wasm: `${NOISE}/rnnoise.wasm`,
  simd: `${NOISE}/rnnoise_simd.wasm`,
} as const
