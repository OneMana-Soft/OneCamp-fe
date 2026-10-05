// Passkeys in the browser. The server sends WebAuthn options as JSON with
// binary fields base64url-encoded; the browser API wants ArrayBuffers, and
// answers with them. These helpers convert both ways, so no library is needed.

export const b64urlToBuffer = (s: string): ArrayBuffer => {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out.buffer
}

export const bufferToB64url = (b: ArrayBuffer | ArrayBufferView): string => {
  const bytes = b instanceof ArrayBuffer ? new Uint8Array(b) : new Uint8Array(b.buffer, b.byteOffset, b.byteLength)
  let bin = ""
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

type Descriptor = { id: string; type: "public-key"; transports?: AuthenticatorTransport[] }
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the server's options are passed through as given
type ServerOptions = { publicKey: Record<string, any> }

/** Whether this browser can use passkeys at all. */
export const passkeysSupported = () =>
  typeof window !== "undefined" && typeof window.PublicKeyCredential === "function" && !!navigator.credentials

const descriptors = (list?: Descriptor[]) => list?.map((d) => ({ ...d, id: b64urlToBuffer(d.id) }))

/** Server creation options → what navigator.credentials.create wants. */
export function toCreationOptions(json: ServerOptions): PublicKeyCredentialCreationOptions {
  const pk = json.publicKey
  return {
    ...pk,
    challenge: b64urlToBuffer(pk.challenge),
    user: { ...pk.user, id: b64urlToBuffer(pk.user.id) },
    excludeCredentials: descriptors(pk.excludeCredentials),
  } as PublicKeyCredentialCreationOptions
}

/** Server request options → what navigator.credentials.get wants. */
export function toRequestOptions(json: ServerOptions): PublicKeyCredentialRequestOptions {
  const pk = json.publicKey
  return { ...pk, challenge: b64urlToBuffer(pk.challenge), allowCredentials: descriptors(pk.allowCredentials) } as PublicKeyCredentialRequestOptions
}

/** A new passkey as JSON for the server. */
export function creationToJSON(c: PublicKeyCredential) {
  const r = c.response as AuthenticatorAttestationResponse
  return {
    id: c.id,
    rawId: bufferToB64url(c.rawId),
    type: c.type,
    response: {
      clientDataJSON: bufferToB64url(r.clientDataJSON),
      attestationObject: bufferToB64url(r.attestationObject),
      transports: typeof r.getTransports === "function" ? r.getTransports() : undefined,
    },
    clientExtensionResults: c.getClientExtensionResults?.() ?? {},
  }
}

/** A sign-in answer as JSON for the server. */
export function assertionToJSON(c: PublicKeyCredential) {
  const r = c.response as AuthenticatorAssertionResponse
  return {
    id: c.id,
    rawId: bufferToB64url(c.rawId),
    type: c.type,
    response: {
      clientDataJSON: bufferToB64url(r.clientDataJSON),
      authenticatorData: bufferToB64url(r.authenticatorData),
      signature: bufferToB64url(r.signature),
      userHandle: r.userHandle ? bufferToB64url(r.userHandle) : undefined,
    },
    clientExtensionResults: c.getClientExtensionResults?.() ?? {},
  }
}

/** Words for a browser refusal; null when the person simply cancelled. */
export function passkeyErrorMessage(e: unknown): string | null {
  const name = (e as { name?: string })?.name
  if (name === "NotAllowedError" || name === "AbortError") return null
  if (name === "InvalidStateError") return "That passkey is already added on this device."
  if (name === "SecurityError") return "Passkeys don't work on this address. Open OneCamp at its usual address and try again."
  return "Your browser couldn't use a passkey. Try again, or use another way to sign in."
}
