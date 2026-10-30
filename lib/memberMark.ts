// Set while a member uses the app in this browser; every sign-out clears it.
export const MEMBER_KEY = "onecamp:member"

export function rememberMember(): void {
  try {
    localStorage.setItem(MEMBER_KEY, "1")
  } catch {
    /* storage blocked */
  }
}

export function forgetMember(): void {
  try {
    localStorage.removeItem(MEMBER_KEY)
  } catch {
    /* storage blocked */
  }
}

export function rememberedMember(): boolean {
  try {
    return localStorage.getItem(MEMBER_KEY) === "1"
  } catch {
    return false
  }
}
