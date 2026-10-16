"use client"

import * as React from 'react'
import { useAIAvailable } from '@/hooks/useClientConfig'
import type { EditionGate } from './registry'

/**
 * The gate a doc surface reads the registry through: AI items only where AI is
 * on (useAIAvailable: never on the AI-free edition, nor where an admin turned
 * it off or no provider is set up). One object while it holds, so a host's
 * memo doesn't run again for it.
 */
export function useEditionGate(): EditionGate {
  const ai = useAIAvailable()
  return React.useMemo(() => ({ ai }), [ai])
}
