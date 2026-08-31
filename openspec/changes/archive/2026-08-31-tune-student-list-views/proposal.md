## Why

The students index page (`app/routes/students/student-home.tsx`) offers a grid and a
list view, but the grid is underpowered next to the list and has a visible layout
bug: a classroom badge whose text is wider than the 160px card spills past the
card's border. Separately, the code that tracks which view the user picked keeps
the same fact in two places (a URL `?view=` param and a cookie, plus a
`useState`-shaped hook whose value is never read), and spends effort reconciling
them on every toggle.

## What Changes

- **Classroom badge no longer overflows the grid card.** The badge truncates in
  place with an ellipsis and exposes the full classroom name via a `title`
  attribute.
- **Grid view gains row selection and bulk delete**, reaching parity with the list
  view on multi-select. Each card's selection checkbox appears on hover or
  keyboard focus and stays visible while the card is selected; the bulk-action
  bar is shared by both views. The grid stays a "lean roster wall" otherwise — no
  sort control and no per-card actions menu are added, and both the student name
  and the classroom badge truncate rather than wrap or overflow.
- **List view becomes the default on first load** (previously grid), for a visitor
  with no `?view=` param and no stored preference.
- **View-mode tracking is simplified.** The `?view=` URL param becomes the single
  source of truth; the loader persists the choice to the `students-view-mode`
  cookie via `Set-Cookie` when the param is present. The
  `app/hooks/use-student-view-mode.ts` hook and its client-side `document.cookie`
  write are removed. No behavior change to `?view=` links or cookie persistence —
  only where the write happens.

## Capabilities

### New Capabilities

- `student-list`: The students index page — its grid and list views, view-mode
  selection and persistence, pagination, multi-select and bulk actions, and how a
  student's classroom assignment is displayed in each view.

### Modified Capabilities

<!-- None: no student-list spec exists yet. -->

## Impact

- **Frontend, students index only** — the change is isolated to the students index
  route and its helpers; `grep` confirms no other route or component reads the
  view-mode machinery.
  - `app/routes/students/student-home.tsx` — grid renders over the shared
    `@tanstack/react-table` row model; bulk-action bar lifts out of the
    `viewMode` branch; `StudentCard` gains a selection checkbox; loader sets
    `Set-Cookie`; `handleViewModeChange` collapses to a single `updateParams`
    call; the `useStudentViewMode` import is dropped.
  - `app/hooks/use-student-view-mode.ts` — **deleted**.
  - `app/lib/view-mode-cookie.ts` — default flips `"grid"` → `"list"`;
    `serializeViewModeCookie` is now called from the loader.
  - Page-size split (20 list / 24 grid) is unchanged.
- **Tests**
  - `tests/unit/lib/view-mode-cookie.test.ts` — "defaults to grid" cases flip to
    list.
  - `tests/unit/routes/students/student-home.test.ts` — default `viewMode` /
    page-size expectations; add coverage for the loader `Set-Cookie` header.
  - `tests/e2e/students.spec.ts` — "Default is grid" assertions flip to list;
    add a grid-view bulk-select/delete path.
- **No backend changes.** No API, schema, or migration impact.
