/**
 * The window event hooks/useMqttMessageHandler raises with a call's state, for
 * the call's own pages (useCallSession). The handler loads with every page, so
 * it writes the name itself, without this import; a test holds the two equal.
 */
export const CALL_STATE_EVENT = "onecamp:call-state"
