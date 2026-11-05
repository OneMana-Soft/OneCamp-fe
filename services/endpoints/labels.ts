// The labels area (miro-44 L): the workspace's sensitivity labels and the label
// a board or a doc carries. Members: GET /labels (the labels and the rules a
// label can carry), GET/PUT /labels/items/{kind}/{id}. Admins define, change
// and remove them: POST /admin/labels, PATCH /admin/labels/{id},
// POST /admin/labels/{id}/remove.
// A slice of its own (services/endpoints/<area>.<slice>.ts, V-305): the pages that
// show a label (lib/labels/labelCore) and the admin card load these routes.
export enum LabelRoutes {
  Labels = "/labels",
  Items = "/labels/items",
  Admin = "/admin/labels",
}
