import { CopyableCode } from "@/components/ui/copyable-code"
import { apiUrl } from "@/lib/utils/apiUrl"

/**
 * The admin's steps for Outlook Calendar (B7): an Azure app for work and
 * personal accounts (the "common" tenant), the address it sends people back
 * to (the API's GET /connector/oauth/callback, with the app's own Copy), a
 * secret, and the two fields under the steps. They sit on the Microsoft card
 * in Admin, Integrations, where the admin acts (DESIGN-BUILD-117 F1); the
 * calendar says one line and links here. The address is said in words when
 * the API's isn't known: a guessed one would be copied without being read.
 */
export function OutlookHowTo() {
  const address = apiUrl("connector/oauth/callback")
  return (
    <ol data-outlook-how="" className="list-decimal space-y-1.5 pl-4 text-xs text-muted-foreground text-pretty marker:font-medium marker:text-foreground">
      <li>In the Azure portal, add an app under App registrations, for accounts in any organisation and personal Microsoft accounts (the &ldquo;common&rdquo; tenant).</li>
      <li className="space-y-1.5">
        <span className="block">Give it this Web redirect address:</span>
        {address ? (
          <CopyableCode value={address} label="redirect address" />
        ) : (
          <span className="block">
            <code className="text-foreground">/connector/oauth/callback</code> on your API&apos;s address.
          </span>
        )}
      </li>
      <li>Make a client secret under Certificates &amp; secrets.</li>
      <li>Paste its client ID and secret here, then save.</li>
    </ol>
  )
}
