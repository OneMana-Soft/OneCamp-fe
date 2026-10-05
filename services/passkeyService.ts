// Passkeys: signing in with one (public, plain fetch like the other sign-in
// methods) and managing your own (signed in, through the app's axios).

import axiosInstance from "@/lib/axiosInstance"
import { assertionToJSON, creationToJSON, toCreationOptions, toRequestOptions } from "@/lib/auth/webauthn"

const backend = process.env.NEXT_PUBLIC_BACKEND_URL || "/"

export interface Passkey {
  id: string
  name: string
  created_at: string
  last_used_at: string | null
}

type Ceremony = { options: Parameters<typeof toRequestOptions>[0]; ceremony: string }

async function json<T>(res: Response): Promise<{ ok: boolean; data?: T; msg: string }> {
  const body = await res.json().catch(() => ({}))
  return { ok: res.ok, data: body?.data, msg: body?.msg || "Something went wrong. Try again." }
}

/**
 * Signs in with a passkey. Resolves ok on success, a message to show on a
 * refusal, or null when the person cancelled the browser's prompt.
 */
export async function signInWithPasskey(): Promise<{ ok: true } | { ok: false; msg: string | null }> {
  const begin = await json<Ceremony>(await fetch(`${backend}auth/passkey/begin`, { method: "POST", credentials: "include" }))
  if (!begin.ok || !begin.data) return { ok: false, msg: begin.msg }
  const credential = (await navigator.credentials.get({ publicKey: toRequestOptions(begin.data.options) })) as PublicKeyCredential | null
  if (!credential) return { ok: false, msg: null }
  const finish = await json<unknown>(
    await fetch(`${backend}auth/passkey/finish?ceremony=${encodeURIComponent(begin.data.ceremony)}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(assertionToJSON(credential)),
    }),
  )
  return finish.ok ? { ok: true } : { ok: false, msg: finish.msg }
}

export const listPasskeys = async () => (await axiosInstance.get<{ data: Passkey[] }>("/auth/passkeys")).data.data ?? []

/** Adds a passkey on this device. Null when the person cancelled. */
export async function addPasskey(name: string): Promise<Passkey | null> {
  const begin = (await axiosInstance.post<{ data: Ceremony }>("/auth/passkeys/begin")).data.data
  const credential = (await navigator.credentials.create({ publicKey: toCreationOptions(begin.options) })) as PublicKeyCredential | null
  if (!credential) return null
  const res = await axiosInstance.post<{ data: Passkey }>(
    `/auth/passkeys/finish?ceremony=${encodeURIComponent(begin.ceremony)}&name=${encodeURIComponent(name)}`,
    creationToJSON(credential),
  )
  return res.data.data
}

export const renamePasskey = (id: string, name: string) => axiosInstance.post(`/auth/passkeys/${id}/rename`, { name })
export const removePasskey = (id: string) => axiosInstance.post(`/auth/passkeys/${id}/delete`)
