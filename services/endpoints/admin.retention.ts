// The admin area's retention slice: the retention rules that remove old items
// for good and the legal holds that outrank them (components/admin/LegalHoldsCard).
// Rules: GET /admin/retention/rules, GET .../{kind}/preview?days=N, PUT .../{kind}.
// Holds: GET/POST /admin/retention/holds, PATCH .../{id}, POST .../{id}/release,
// GET .../{id}/items/{kind} and GET .../{id}/export/{kind}.
// A slice of its own (services/endpoints/<area>.<slice>.ts, V-305): only that
// lazy card loads these routes.
export enum RetentionRoutes {
  Rules = "/admin/retention/rules",
  Holds = "/admin/retention/holds",
}
