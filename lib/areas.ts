/** Each area's hue, once; lib/areas.test.ts says why. */
export const AREA_HUE = { chat: "sky", calls: "berry", docs: "dusk", projects: "moss", calendar: "sun", tables: "lake", agents: "agent" } as const

export type Area = keyof typeof AREA_HUE

export const areaHue = (area: Area) => AREA_HUE[area]
