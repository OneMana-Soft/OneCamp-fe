import type { Page } from "@playwright/test"

// Giphy's card as business/Command/giphy.go draws it, and the GIF at Giphy's own
// address, as its Send posts it. Shared by the specs that run /giphy:
// slashCommands (from every box) and phoneComposerRoom (a phone's sheet).
export const GIF = "https://media.giphy.com/media/launch/giphy.gif"

/**
 * Answers the GIF in the browser with a picture the app ships: it has no
 * outside network. At Giphy's address it is drawn as a real one is, straight
 * into <img>; a path on the app's own host was fetched as OneCamp's media, from
 * the API, which no stub answers. Registered after stubBackend, so it wins.
 */
export async function serveGif(page: Page) {
  await page.route(GIF, (route) => route.fulfill({ path: "public/apple-touch-icon.png", contentType: "image/png" }))
}
export const giphyCard = (trigger: string) => ({
  response_type: "ephemeral", trigger_id: trigger,
  blocks: [
    { type: "context", text: { type: "mrkdwn", text: "Giphy results for *launch* (1/15)" } },
    { type: "image", image_url: GIF, alt_text: "launch" },
    { type: "actions", elements: [
      { type: "button", text: { type: "plain_text", text: "Shuffle" }, action_id: "giphy_shuffle" },
      { type: "button", text: { type: "plain_text", text: "Send" }, action_id: "giphy_send", style: "primary" },
      { type: "button", text: { type: "plain_text", text: "Cancel" }, action_id: "giphy_cancel", style: "danger" },
    ] },
  ],
})
