"use client"

import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"

/**
 * What the ways past the free plan cost, from GET /plan/prices: an admin's, or
 * the demo's shared visitor's (a member is refused). The server asks the
 * storefront for them only when this is read, and keeps them an hour, so the
 * page reads them once and never again on focus or reconnect.
 *
 * Every figure is the storefront's: the rupee charge and the dollar figure it
 * worked out from it at its daily rate. Nothing here types a price. While
 * loading, offline, or when the server couldn't reach the storefront,
 * `available` is false: the page then links the pricing page instead.
 */

export interface Money {
  /** The storefront's dollar figure, when it has one. */
  usd?: number
  inr: number
}

export interface PlanOfferPrice extends Money {
  /** How many people the Cloud size is for. */
  seats: number
}

interface PricesResponse {
  data?: {
    available: boolean
    licence?: Money
    cloud?: PlanOfferPrice
    cloud_yearly?: Money & { free_months?: number }
    business?: PlanOfferPrice
    rate_at?: string
    charged_in?: "INR" | "USD"
    charge_usd?: boolean
  }
}

const ONCE = { revalidateOnFocus: false, revalidateOnReconnect: false, revalidateIfStale: false }

/** `enabled: false` asks nothing (someone the server would refuse). */
export function usePlanPrices({ enabled = true }: { enabled?: boolean } = {}) {
  const { data } = useFetch<PricesResponse>(enabled ? GetEndpointUrl.PlanPrices : "", undefined, ONCE)
  const p = data?.data
  return {
    available: p?.available === true,
    licence: p?.licence,
    cloud: p?.cloud,
    cloudYearly: p?.cloud_yearly,
    business: p?.business,
    rateAt: p?.rate_at,
    chargedIn: p?.charged_in,
    /** Buyers outside India are charged the licence's dollar price. */
    chargeUsd: p?.charge_usd === true,
  }
}
