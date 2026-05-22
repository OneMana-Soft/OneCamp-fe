"use client"

import React, { useEffect, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import axiosInstance from "@/lib/axiosInstance"
import { PostEndpointUrl } from "@/services/endPoints"
import { Github, CheckCircle2, XCircle, Loader2 } from "@/lib/icons";

const GitHubCallbackPage = () => {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading")
  const [errorMsg, setErrorMsg] = useState("")

  useEffect(() => {
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const error = searchParams.get("error")
    const errorDescription = searchParams.get("error_description")

    // Handle GitHub denial or error
    if (error) {
      setStatus("error")
      setErrorMsg(errorDescription || error || "Authorization was denied or failed.")
      return
    }

    if (!code) {
      setStatus("error")
      setErrorMsg("No authorization code received from GitHub.")
      return
    }

    const exchangeCode = async () => {
      try {
        await axiosInstance.post(PostEndpointUrl.GitHubCallback, { code, state: state || "" })
        setStatus("success")
        setTimeout(() => {
          router.push("/app/admin?tab=integrations")
        }, 2000)
      } catch (err: any) {
        setStatus("error")
        setErrorMsg(err?.response?.data?.error || "Failed to connect GitHub. Please try again.")
      }
    }

    exchangeCode()
  }, [searchParams, router])

  return (
    <div className="flex items-center justify-center h-full bg-background/50">
      <div className="text-center p-8 max-w-md">
        <div className="mx-auto mb-6 bg-gray-900 dark:bg-gray-100 p-4 rounded-2xl w-fit">
          <Github className="h-8 w-8 text-white dark:text-gray-900" />
        </div>

        {status === "loading" && (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto mb-3" />
            <h2 className="text-lg font-semibold mb-1">Connecting GitHub...</h2>
            <p className="text-sm text-muted-foreground">Exchanging authorization code. Please wait.</p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-3" />
            <h2 className="text-lg font-semibold mb-1">GitHub Connected!</h2>
            <p className="text-sm text-muted-foreground">Redirecting you back to the admin dashboard...</p>
          </>
        )}

        {status === "error" && (
          <>
            <XCircle className="h-8 w-8 text-destructive mx-auto mb-3" />
            <h2 className="text-lg font-semibold mb-1">Connection Failed</h2>
            <p className="text-sm text-muted-foreground mb-4">{errorMsg}</p>
            <button
              onClick={() => router.push("/app/admin")}
              className="text-sm text-primary hover:underline"
            >
              Return to Admin Dashboard
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default GitHubCallbackPage
