import { backendBase } from "@/services/publicApi"

// Its own module rather than publicApi's: the public pages that call the server (a room's doorway, booking pages,
// intake forms) reach publicApi on their first load, and none of them draws this.

/** The workspace's logo, which its emails carry and a form with none of its own wears (GET /public/email/logo). */
export const workspaceLogoURL = () => `${backendBase}/public/email/logo`
