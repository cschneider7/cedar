## 1. View-mode tracking cleanup

- [x] 1.1 Flip the default in `app/lib/view-mode-cookie.ts` from `"grid"` to `"list"` (both the `parseViewModeCookie` no-cookie return and the not-`"list"` fallback) and verify `tests/unit/lib/view-mode-cookie.test.ts` passes after its "defaults to grid" cases are updated to expect `"list"`.
- [x] 1.2 Delete `app/hooks/use-student-view-mode.ts` and remove its import from `app/routes/students/student-home.tsx`; verify `npm run typecheck` reports no dangling references.
- [x] 1.3 In `student-home.tsx`'s `loader`, keep `viewMode = viewParam ?? parseViewModeCookie(Cookie) ?? "list"` and return a `Set-Cookie: serializeViewModeCookie(viewMode)` header only when a valid `view` param is present; verify a new `student-home.test.ts` case asserts the header is set with `?view=` and absent without it.
- [x] 1.4 Collapse `handleViewModeChange` to a single `updateParams` call that sets `view` and resets `page=1` (no `document.cookie` write); verify `tests/e2e/students.spec.ts` "grid/list toggle persists via cookie" still passes (cookie now set by the loader response).

## 2. Grid selection parity

- [x] 2.1 Build the `@tanstack/react-table` instance unconditionally and render the grid branch by mapping over `table.getRowModel().rows` instead of `studentsPage.students`; verify grid view still renders one card per student (`npm run test:e2e` grid pagination spec).
- [x] 2.2 Lift the bulk-action bar (selected-count + Clear + DeleteConfirmDialog) out of the `viewMode === "list"` branch so it renders above both views, preserving the fixed-height/`invisible` placeholder; verify it appears in grid view once a card is selected.
- [x] 2.3 Add a selection checkbox to `StudentCard` wired to `row.getIsSelected()` / `row.toggleSelected()`, with `stopPropagation` on the checkbox so it never triggers the card's `Link` navigation; the checkbox is hidden by default and revealed on card hover or keyboard focus, and stays visible whenever the card is selected; verify clicking the checkbox toggles selection without navigating.
- [x] 2.4 Apply a selected-state style (ring + background) to a selected card; verify selected and unselected cards are visually distinct.
- [x] 2.5 Add a `tests/e2e/students.spec.ts` case: in grid view, select two cards, confirm the bulk bar shows "2 selected", delete, and assert both students are gone and the selection cleared.

## 3. Card text truncation

- [x] 3.1 In `StudentCard`, give the footer `min-w-0`, drop `shrink-0` from the badge (or override via className), add `truncate` to the badge text, and set the badge's `title` to the full `formatClassroomName` string; verify a student on a long-named classroom renders an ellipsis inside the card with no horizontal overflow past the card border.
- [x] 3.2 In `StudentCard`, truncate the student name to a single line with an ellipsis (override `ItemTitle`'s `flex`/`w-fit` so `line-clamp`/`truncate` takes effect, constrain `ItemContent` with `min-w-0`); verify a long name renders on one line with an ellipsis instead of wrapping.

## 4. Full-suite verification

- [x] 4.1 Run `npm run typecheck`, `npm test`, and `npm run test:e2e` and verify all pass.
- [x] 4.2 Run `npx prettier --check .` on the touched files and verify formatting is clean.
