// The projects area's check-ins slice: a channel's automatic check-ins,
// GET/POST /ch/{channel}/checkins; one check-in is /ch/checkins/{id}/edit|pause|delete|ask.
// A slice of its own (services/endpoints/<area>.<slice>.ts, V-305): a reader outside
// the area that goes through useCheckIns (the demo guide on Home) loads these routes,
// not the whole of projects.ts.
export enum CheckInRoutes {
  Base = "/ch",
}
