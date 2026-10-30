/**
 * The demo's intake form (business/DemoSeed showcase.go, package 9 R4), as
 * the project's admins read it and as a visitor gets it: a bug opens its
 * steps, how soon sets the priority, the date the due date, the kind a tag,
 * and "About you" is a page of its own. Shared by the forms, public form and
 * rules specs.
 */

import type { FormField } from "../lib/forms/forms"

export const FORM_ID = "f1a2b3c4-d5e6-4f70-8a9b-0c1d2e3f4a5b"
export const FORM_TOKEN = "4f7a1c9e2b8d6a3f5c0e7b12"

export const launchForm = {
  id: FORM_ID,
  token: FORM_TOKEN,
  title: "Launch requests",
  description: "Need something from the launch team? Tell us here and it lands on our board.",
  active: true,
  priority: "medium",
  title_field: "what",
  confirmation: "Thanks! It's on the launch team's board now, and we'll reply by email.",
  submissions: 12,
  fields: [
    { id: "what", label: "What do you need?", type: "short_text", required: true },
    { id: "email", label: "Your email", type: "email", required: true },
    { id: "kind", label: "What kind of request is it?", type: "select", required: false, options: ["Copy", "Design", "A bug"], maps_to: "tags" },
    {
      id: "steps", label: "How do we see the bug?", type: "long_text", required: true, help: "The page, what you did, and what happened.",
      show_if: { question: "kind", op: "is", values: ["A bug"] },
    },
    // Package 9 R4b: a bug can bring its screenshots.
    { id: "shot", label: "A screenshot", type: "file", required: false, help: "If you have one: where it goes wrong.", show_if: { question: "kind", op: "is", values: ["A bug"] } },
    {
      id: "soon", label: "How soon do you need it?", type: "select", required: false, options: ["This week", "This month", "Whenever"],
      maps_to: "priority", map: { "This week": "high", "This month": "medium", Whenever: "low" },
    },
    { id: "by", label: "Needed by", type: "date", required: false, maps_to: "due" },
    { id: "about", label: "About you", type: "section", required: false, help: "So we know who to follow up with." },
    { id: "team", label: "Your team", type: "select", required: false, options: ["Sales", "Support", "Marketing", "Other"] },
    { id: "more", label: "Anything else", type: "long_text", required: false },
  ] as FormField[],
}

/** What a visitor is sent (GET /public/form): never what the answers fill, and what a file question takes. */
export const publicForm = {
  title: launchForm.title,
  description: launchForm.description,
  confirmation: launchForm.confirmation,
  files: { max: 5, mb: 10 },
  fields: launchForm.fields.map((f) => {
    const shown = { ...f }
    delete shown.maps_to
    delete shown.map
    return shown
  }),
}

export const bugForm = {
  id: "0b1c2d3e-4f50-4617-8829-3a4b5c6d7e8f", token: "9c8b7a6f5e4d3c2b1a0f9e8d", title: "Bug reports", description: "", active: false, priority: "high",
  title_field: "q1", confirmation: "", submissions: 0,
  fields: [{ id: "q1", label: "What broke?", type: "short_text", required: true }, { id: "q2", label: "Where?", type: "url", required: false }],
}

const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
const answer = (id: string, value: string) => ({ id, label: launchForm.fields.find((f) => f.id === id)!.label, value })

/** The latest answers, newest first, as GET .../submissions answers them. */
export const submissions = [
  { id: "s5", task_uuid: "a1111111-1111-4111-8111-111111111111", created_at: ago(18), answers: [answer("what", "A banner for the pricing page"), answer("email", "ana@example.com"), answer("kind", "Design"), answer("soon", "This week"), answer("team", "Marketing")] },
  { id: "s4", task_uuid: "a2222222-2222-4222-8222-222222222222", created_at: ago(140), answers: [answer("what", "The sign-up button does nothing on Safari"), answer("email", "joe@example.com"), answer("kind", "A bug"), answer("steps", "Open /signup in Safari 17, fill the form and press Create account. Nothing happens."),
    { ...answer("shot", "signup-safari.png"), values: ["signup-safari.png"], files: [{ id: "b1111111-1111-4111-8111-111111111111", name: "signup-safari.png", size: 48213, mime: "image/png" }] },
    answer("soon", "This week"), answer("team", "Support")] },
  { id: "s3", task_uuid: "a3333333-3333-4333-8333-333333333333", created_at: ago(60 * 26), answers: [answer("what", "Copy for the launch email"), answer("email", "kim@example.com"), answer("kind", "Copy"), answer("soon", "This month"), answer("team", "Sales")] },
  { id: "s2", task_uuid: "a4444444-4444-4444-8444-444444444444", created_at: ago(60 * 50), answers: [answer("what", "A 404 on the docs search"), answer("email", "lee@example.com"), answer("kind", "A bug"), answer("steps", "Search for 'billing' on the docs."), answer("soon", "Whenever")] },
  { id: "s1", task_uuid: "a5555555-5555-4555-8555-555555555555", created_at: ago(60 * 24 * 6), answers: [{ Label: "What do you need?", Value: "Screenshots for the press kit" }, { Label: "Your email", Value: "sam@example.com" }] },
]

/** The workspace's Vendors table and its columns (GET /tables, /tables/{id}/fields), which a form can add rows to (package 9 R4b). */
export const VENDORS = "c0ffee00-1111-4222-8333-444455556666"
export const tables = [{ id: VENDORS, name: "Vendors", visibility: "workspace" }, { id: "c0ffee00-1111-4222-8333-777788889999", name: "Launch budget", visibility: "workspace" }]
export const vendorColumns = [
  { id: "d1000000-0000-4000-8000-000000000001", table_id: VENDORS, name: "Vendor", type: "text", config: "{}", position: 0, required: true, primary: true },
  { id: "d1000000-0000-4000-8000-000000000002", table_id: VENDORS, name: "Contact", type: "email", config: "{}", position: 1, required: true },
  { id: "d1000000-0000-4000-8000-000000000003", table_id: VENDORS, name: "Tier", type: "select", position: 2, config: JSON.stringify({ options: [{ id: "o1", label: "Gold" }, { id: "o2", label: "Silver" }, { id: "o3", label: "Bronze" }] }) },
  { id: "d1000000-0000-4000-8000-000000000004", table_id: VENDORS, name: "Spend", type: "rollup", position: 3, config: JSON.stringify({ relation: "x", aggregate: "sum" }) },
]

/** The demo's "Vendor sign-up": a form whose answers add a row to Vendors, a question for each column it fills. */
export const vendorForm = {
  id: "0b1c2d3e-4f50-4617-8829-3a4b5c6d7e90", token: "7e6d5c4b3a2f1e0d9c8b7a6f", title: "Vendor sign-up", description: "", active: true, priority: "medium",
  title_field: "", confirmation: "", submissions: 3, target_table: VENDORS,
  fields: [
    { id: "v1", label: "Vendor", type: "short_text", required: true, maps_to: `column:${vendorColumns[0].id}` },
    { id: "v2", label: "Contact", type: "email", required: true, maps_to: `column:${vendorColumns[1].id}` },
    { id: "v3", label: "Tier", type: "select", required: false, options: ["Gold", "Silver", "Bronze"], maps_to: `column:${vendorColumns[2].id}` },
  ],
}
