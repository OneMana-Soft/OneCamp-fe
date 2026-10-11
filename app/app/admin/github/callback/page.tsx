"use client"

/**
 * Where GitHub sends an admin back after they approve the app: it hands the
 * code to the server, then returns them to Admin, Integrations, where they
 * started.
 *
 * In the app's own voice and frame: it said "GitHub Connected!", "Connection
 * Failed" and "Please wait" on a raw grey tile with a spinner, and its way
 * back was a text button to Admin's first tab. Now the connections tile while
 * it works, the plug when it is done and the error spot when it is not, each
 * with one way back to Integrations.
 *
 * Design v3 (admin A22): a 64px plug spot with a 16px spinner over its
 * corner while it connects, then the plug alone, or the error spot with the
 * reason and "Back to Integrations".
 */

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams, useRouter } from "next/navigation"
import axiosInstance from "@/lib/axiosInstance"
import { PostEndpointUrl } from "@/services/endPoints"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { Loader2 } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { SpotError, SpotPlug } from "@/components/ui/graphics"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"

const INTEGRATIONS = "/app/admin?tab=integrations"
const START_AGAIN = "Start again from Admin, Integrations."

const GitHubCallbackPage = () => {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading")
  const [errorMsg, setErrorMsg] = useState("")
  // The code is good for one exchange: a second POST (an effect run twice)
  // was refused and could turn a success into "Couldn't connect".
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const error = searchParams.get("error")
    const errorDescription = searchParams.get("error_description")

    // GitHub refused, or the admin said no: GitHub's own words.
    if (error) {
      setStatus("error")
      setErrorMsg(errorDescription || `GitHub said “${error}”. ${START_AGAIN}`)
      return
    }

    if (!code) {
      setStatus("error")
      setErrorMsg(`GitHub sent no sign-in code back. ${START_AGAIN}`)
      return
    }

    const exchangeCode = async () => {
      try {
        await axiosInstance.post(PostEndpointUrl.GitHubCallback, { code, state: state || "" })
        setStatus("success")
        setTimeout(() => {
          router.push(INTEGRATIONS)
        }, 2000)
      } catch (err) {
        setStatus("error")
        setErrorMsg(apiErrorMessage(err, `GitHub didn't finish connecting. ${START_AGAIN}`))
      }
    }

    void exchangeCode()
  }, [searchParams, router])

  return (
    <main id="main-content" className="flex h-full items-center justify-center bg-background px-4">
      {status === "loading" && (
        <div role="status">
          <EmptyState
            tone="accent"
            headingLevel={1}
            illustration={
              <span data-callback-spot="" className="cfg-callback-spot">
                <SpotPlug size={64} hue={ADMIN_GROUP_HUE.connections} />
                <span data-spinner="" aria-hidden="true">
                  <Loader2 className="size-4 animate-spin text-ink-3" />
                </span>
              </span>
            }
            title="Connecting GitHub…"
            description="Finishing the sign-in GitHub started. This takes a moment."
          />
        </div>
      )}

      {status === "success" && (
        <EmptyState
          tone="accent"
          headingLevel={1}
          illustration={<SpotPlug size={64} hue={ADMIN_GROUP_HUE.connections} />}
          title="GitHub is connected"
          description="Taking you back to Admin, Integrations, to link a repository."
          action={
            <Button asChild variant="outline" size="sm">
              <Link href={INTEGRATIONS}>Go back now</Link>
            </Button>
          }
        />
      )}

      {status === "error" && (
        <EmptyState
          tone="accent"
          headingLevel={1}
          illustration={<SpotError size={64} />}
          title="Couldn't connect GitHub"
          description={errorMsg}
          action={
            <Button asChild size="sm">
              <Link href={INTEGRATIONS}>Back to Integrations</Link>
            </Button>
          }
        />
      )}
    </main>
  )
}

export default GitHubCallbackPage
