import type { AxiosError } from "axios"

/** The server's own message for a failed request (written for people), or a
 *  plain fallback. */
export const serverMessage = (e: unknown, fallback = "Something went wrong. Try again.") =>
  ((e as AxiosError<{ msg?: string }>)?.response?.data?.msg as string | undefined) || fallback
