// Touch-up (meet-09): a camera's picture softened on this device, in
// WebGL2, after low light (lowLight.ts) and before a background (if one is
// on) is put behind it (cameraTransformer.ts). Nothing is fetched: the
// shaders are below. Loaded with background.ts, the first time a camera
// effect is on.
//
// An edge-preserving smooth at half size (a bilateral filter, in two
// passes), blended back in one full-size pass only where the colour is
// skin's (SKIN) and the smoothed picture has no edge, so eyes, brows and
// outlines stay sharp. Skin is read from the smoothed picture, not each
// noisy pixel, so a patch of skin is blended as one and its brightness
// holds: read pixel by pixel, the darkest skin's grain had its dark half
// (under SKIN's luma floor) kept and its light half pulled down to it.

import type { TouchUp } from "./effects"

/** How much of the smoothed skin each touch-up level blends in. */
export const TOUCH_UP_STRENGTH: Record<TouchUp, number> = { off: 0, subtle: 0.5, smooth: 0.9 }

/**
 * Skin, as the touch-up finds it: a hue between red and yellow (the angle
 * of a colour's Cb and Cr from grey, in degrees: on from hue[1] to hue[2],
 * fading out to hue[0] and hue[3]), with some colour for its light (the
 * size of Cb and Cr over the luma: on from colour[1]), and not black (luma,
 * on from luma[1]). Neither the hue nor the colour for the light changes
 * with how brightly a face is lit, or lifted by low light (which scales
 * colour with the light), so the lightest and darkest skin, skin under a
 * warm lamp, and a face low light lifts are all skin alike. Greys, blues,
 * greens, reds and yellows are not.
 */
export const SKIN = { hue: [114, 118, 158, 164], colour: [0.008, 0.02], luma: [0.03, 0.08] } as const

/** A number as a GLSL float. */
const glsl = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n))

export interface LookPass {
  /** The frame with the touch-up drawn on it, or null when it couldn't be (the caller sends the frame as it is). */
  draw(frame: VideoFrame, touchUp: TouchUp): VideoFrame | null
  /** Whether this browser's graphics were lost (the GPU reset, or the tab was starved of it). */
  lost(): boolean
  dispose(): void
}

const VERTEX = `#version 300 es
in vec2 p;
out vec2 uv;
void main() { uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`

// The frame is uploaded top row first, so it is read upside down (flip); what this pass drew is read as drawn.
const SMOOTH = `#version 300 es
precision highp float;
uniform sampler2D src;
uniform vec2 stepUv;
uniform float flip;
in vec2 uv;
out vec4 o;
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec2 at(vec2 q) { return vec2(q.x, mix(q.y, 1.0 - q.y, flip)); }
void main() {
  vec3 c = texture(src, at(uv)).rgb;
  float y = luma(c);
  vec3 sum = c;
  float wsum = 1.0;
  for (int i = 1; i <= 4; i++) {
    float s = exp(-float(i * i) / 8.0);
    for (int k = -1; k <= 1; k += 2) {
      vec3 n = texture(src, at(uv + stepUv * float(i * k))).rgb;
      float d = luma(n) - y;
      float w = s * exp(-d * d / 0.0128);
      sum += n * w;
      wsum += w;
    }
  }
  o = vec4(sum / wsum, 1.0);
}`

const COMPOSITE = `#version 300 es
precision highp float;
uniform sampler2D frame;
uniform sampler2D smoothed;
uniform vec2 texel;
uniform float strength;
in vec2 uv;
out vec4 o;
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec3 c = texture(frame, vec2(uv.x, 1.0 - uv.y)).rgb;
  if (strength > 0.0) {
    vec3 s = texture(smoothed, uv).rgb;
    float y = luma(s);
    vec2 chroma = vec2(-0.168736 * s.r - 0.331264 * s.g + 0.5 * s.b, 0.5 * s.r - 0.418688 * s.g - 0.081312 * s.b);
    float hue = length(chroma) > 0.0 ? degrees(atan(chroma.y, chroma.x)) : 0.0;
    float skin = smoothstep(${glsl(SKIN.hue[0])}, ${glsl(SKIN.hue[1])}, hue) * (1.0 - smoothstep(${glsl(SKIN.hue[2])}, ${glsl(SKIN.hue[3])}, hue))
      * smoothstep(${glsl(SKIN.colour[0])}, ${glsl(SKIN.colour[1])}, length(chroma) / max(y, 0.001)) * smoothstep(${glsl(SKIN.luma[0])}, ${glsl(SKIN.luma[1])}, y);
    float gx = luma(texture(smoothed, uv + vec2(texel.x, 0.0)).rgb) - luma(texture(smoothed, uv - vec2(texel.x, 0.0)).rgb);
    float gy = luma(texture(smoothed, uv + vec2(0.0, texel.y)).rgb) - luma(texture(smoothed, uv - vec2(0.0, texel.y)).rgb);
    float edge = smoothstep(0.05, 0.14, length(vec2(gx, gy)));
    c = mix(c, s, strength * skin * (1.0 - edge));
  }
  o = vec4(c, 1.0);
}`

/** The WebGL2 pass, on its own canvas. Throws, in words, where this browser can't draw it. */
export function makeLookPass(): LookPass {
  const canvas = new OffscreenCanvas(2, 2)
  const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false })
  if (!gl) throw new Error("This browser can't draw a touch-up.")
  let isLost = false
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault()
    isLost = true
  })

  const program = (fragment: string) => {
    const p = gl.createProgram()!
    for (const [type, src] of [
      [gl.VERTEX_SHADER, VERTEX],
      [gl.FRAGMENT_SHADER, fragment],
    ] as const) {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      gl.attachShader(p, s)
      gl.deleteShader(s)
    }
    gl.bindAttribLocation(p, 0, "p")
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("This browser couldn't draw a touch-up.")
    const u = (name: string) => gl.getUniformLocation(p, name)
    return { p, u }
  }
  const smooth = program(SMOOTH)
  const composite = program(COMPOSITE)

  // One triangle over the whole target.
  const vao = gl.createVertexArray()
  gl.bindVertexArray(vao)
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

  const texture = () => {
    const t = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, t)
    for (const [k, v] of [
      [gl.TEXTURE_MIN_FILTER, gl.LINEAR],
      [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
      [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
      [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
    ]) gl.texParameteri(gl.TEXTURE_2D, k, v)
    return t
  }
  /** A texture to draw into, with its framebuffer. */
  const target = (width: number, height: number) => {
    const t = texture()
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    const fb = gl.createFramebuffer()!
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0)
    return { t, fb, width, height }
  }
  type Target = ReturnType<typeof target>
  const drop = (x: Target | null) => {
    if (!x) return
    gl.deleteTexture(x.t)
    gl.deleteFramebuffer(x.fb)
  }
  const frameTexture = texture()
  let half: [Target, Target] | null = null

  const run = (into: Target | null, prog: ReturnType<typeof program>, set: () => void) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, into?.fb ?? null)
    gl.viewport(0, 0, into?.width ?? canvas.width, into?.height ?? canvas.height)
    gl.useProgram(prog.p)
    set()
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
  const bind = (unit: number, t: WebGLTexture, at: WebGLUniformLocation | null) => {
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.uniform1i(at, unit)
  }
  const drawComposite = (into: Target | null, strength: number, smoothed: WebGLTexture) =>
    run(into, composite, () => {
      bind(0, frameTexture, composite.u("frame"))
      bind(1, smoothed, composite.u("smoothed"))
      gl.uniform2f(composite.u("texel"), 2 / canvas.width, 2 / canvas.height)
      gl.uniform1f(composite.u("strength"), strength)
    })

  return {
    lost: () => isLost || gl.isContextLost(),
    draw(frame, touchUp) {
      if (isLost || gl.isContextLost()) return null
      try {
        const width = frame.displayWidth
        const height = frame.displayHeight
        if (canvas.width !== width || canvas.height !== height || !half) {
          canvas.width = width
          canvas.height = height
          half?.forEach(drop)
          half = [target(Math.ceil(width / 2), Math.ceil(height / 2)), target(Math.ceil(width / 2), Math.ceil(height / 2))]
        }
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, frameTexture)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame)

        const strength = TOUCH_UP_STRENGTH[touchUp]
        const [a, b] = half
        if (strength > 0) {
          run(a, smooth, () => {
            bind(0, frameTexture, smooth.u("src"))
            gl.uniform2f(smooth.u("stepUv"), 2 / width, 0)
            gl.uniform1f(smooth.u("flip"), 1)
          })
          run(b, smooth, () => {
            bind(0, a.t, smooth.u("src"))
            gl.uniform2f(smooth.u("stepUv"), 0, 1 / b.height)
            gl.uniform1f(smooth.u("flip"), 0)
          })
        }
        drawComposite(null, strength, b.t)
        return new VideoFrame(canvas, { timestamp: frame.timestamp ?? 0 })
      } catch {
        return null
      }
    },
    dispose() {
      half?.forEach(drop)
      gl.deleteTexture(frameTexture)
      gl.deleteBuffer(buffer)
      gl.deleteVertexArray(vao)
      gl.deleteProgram(smooth.p)
      gl.deleteProgram(composite.p)
      gl.getExtension("WEBGL_lose_context")?.loseContext()
    },
  }
}
