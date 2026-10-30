/**
 * The member's own Slack DMs, as the server keeps them (business/SlackImport
 * member_read.go): their reads, starting one with their own token, stopping
 * one, and what one noted. Only the Slack DMs card reaches this, and it loads
 * on its own, so no settings page's first load carries it.
 */

import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import type { SlackImportError, SlackImportJob } from "@/services/slackImportService"

/** Where the member's reads are: GET to list, POST to start, /{id}/notes and /{id}/stop. */
const MY_SLACK_DMS = "/me/slack/dms"

/** A member's own reads of their Slack DMs, newest first, and whether their team has imported Slack. */
export interface MySlackReads {
  reads: SlackImportJob[]
  team_imported: boolean
}

/** The SWR key of the member's own reads. */
export const MY_SLACK_DMS_KEY = MY_SLACK_DMS

/** The member's reads. Quiet when it fails: the card isn't drawn, and nothing else depends on it. */
export async function getMySlackReads(): Promise<MySlackReads> {
  const res = await axiosInstance.get(MY_SLACK_DMS, OWN_ERRORS)
  return { reads: res.data?.reads ?? [], team_imported: !!res.data?.team_imported }
}

/**
 * Brings the member's own Slack DMs, group DMs and private channels into their
 * team's import, with their own token. The read runs on the server and plans
 * and runs itself; the token is held for the read alone and never kept. A
 * refusal comes back in its own words.
 */
export async function bringMySlackDMs(token: string): Promise<{ job_id: string }> {
  const res = await axiosInstance.post(MY_SLACK_DMS, { token }, OWN_ERRORS)
  return res.data
}

/** Stops one of the member's reads. What has come across stays. */
export async function stopMySlackRead(jobId: string): Promise<void> {
  await axiosInstance.post(`${MY_SLACK_DMS}/${encodeURIComponent(jobId)}/stop`, undefined, OWN_ERRORS)
}

/** What one of the member's reads noted: which conversations or files Slack didn't give, and why. */
export async function getMySlackReadNotes(jobId: string): Promise<SlackImportError[]> {
  const res = await axiosInstance.get(`${MY_SLACK_DMS}/${encodeURIComponent(jobId)}/notes`, OWN_ERRORS)
  return res.data?.notes ?? []
}
