// The playful layer's graphics, in one place: identity (hues, marks, tiles),
// the motif (rings, orbit, arc, spark), the progress ring and the spot
// illustrations. Edition-neutral: nothing here imports the AI edition or
// anything demo-only (lib/editionBoundary.test.ts).
export { HUE_CLASS, avatarHueClass, cx } from "./hues"
export { IdentityMark, type IdentityMarkProps, type IdentityMarkVariant } from "./IdentityMark"
export { Tile, type TileProps, type TileSize } from "./Tile"
export { Arc, Orbit, Rings, Spark, SPARK_PATH, type MotifProps } from "./motifs"
export { ProgressRing, type ProgressRingProps } from "./ProgressRing"
export {
  SPOTS,
  SpotCalendar,
  SpotDocs,
  SpotError,
  SpotImported,
  SpotInbox,
  SpotPlug,
  SpotSearch,
  SpotTasks,
  SpotWelcome,
  type SpotProps,
} from "./spots"
