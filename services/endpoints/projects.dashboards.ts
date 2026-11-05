// The projects area's dashboards slice (B9-b3; backend router/dashboards.go):
// GET/POST /project/dashboards (yours and the workspace's), a project's at
// GET/POST /project/{project}/dashboards; one is /project/dashboards/{id}
// (POST to rename or share it), with /data?tz=, /delete, /restore, /arrange
// and /widgets (+ /{widget}, /{widget}/delete, /{widget}/restore).
// A slice of its own (services/endpoints/<area>.<slice>.ts): only the
// dashboards page loads it.
export enum DashboardRoutes {
  Dashboards = "/project/dashboards",
  Project = "/project",
}
