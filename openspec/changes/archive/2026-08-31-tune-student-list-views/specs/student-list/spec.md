## Purpose

Defines the behavior of the students index page: its two views (a compact grid
"roster wall" and a detailed list), how the chosen view is selected and
remembered, pagination, multi-select with bulk delete, and how each student's
classroom assignment is displayed.

## ADDED Requirements

### Requirement: View mode selection and persistence

The students index SHALL support two view modes, `grid` and `list`, and SHALL
remember the viewer's most recent choice across visits.

- When the request carries a `view` query parameter of `grid` or `list`, that
  value SHALL determine the rendered view and SHALL be persisted as the viewer's
  stored preference.
- When no valid `view` query parameter is present, the rendered view SHALL be the
  viewer's stored preference.
- When there is neither a valid `view` query parameter nor a stored preference,
  the rendered view SHALL be `list`.
- The stored preference SHALL be written server-side when a `view` query
  parameter is present; a request without that parameter SHALL NOT rewrite the
  stored preference.
- Switching views SHALL reset pagination to the first page.

#### Scenario: First-ever visit defaults to list

- **WHEN** a viewer opens the students index with no `view` query parameter and no
  stored preference
- **THEN** the list view is rendered

#### Scenario: Query parameter overrides stored preference

- **WHEN** a viewer whose stored preference is `list` opens the students index
  with `?view=grid`
- **THEN** the grid view is rendered
- **AND** the stored preference is updated to `grid`

#### Scenario: Stored preference is used when no parameter is present

- **WHEN** a viewer whose stored preference is `grid` opens the students index
  with no `view` query parameter
- **THEN** the grid view is rendered

#### Scenario: Toggling the view persists the new choice

- **WHEN** a viewer in list view activates the grid-view toggle
- **THEN** the grid view is rendered
- **AND** a subsequent visit with no `view` query parameter renders the grid view
- **AND** the page is reset to page 1

### Requirement: Grid view presentation

The grid view SHALL present each student as a compact card showing the student's
photo (or initials placeholder), name, and classroom assignment, and nothing
else — it SHALL NOT provide a sort control or a per-card actions menu.

- A card's student name SHALL be truncated with an ellipsis on a single line when
  it is wider than the card, rather than wrapping to multiple lines.
- A card's classroom label SHALL be shown as a badge. When the label is wider
  than the card, it SHALL be truncated with an ellipsis rather than overflowing
  the card's bounds, and the full classroom name SHALL remain available on hover.
- A student with no classroom SHALL show an "Unassigned" label.
- Activating a card (other than its checkbox) SHALL navigate to that student's
  detail page.

#### Scenario: Long student name is truncated, not wrapped

- **WHEN** the grid view renders a student whose name is wider than the card
- **THEN** the name is shown on a single line, truncated with an ellipsis

#### Scenario: Long classroom name is truncated, not overflowing

- **WHEN** the grid view renders a student whose formatted classroom name is wider
  than the card
- **THEN** the badge text is truncated with an ellipsis within the card
- **AND** the untruncated classroom name is available via the badge's hover text

#### Scenario: Unassigned student in grid view

- **WHEN** the grid view renders a student with no classroom assignment
- **THEN** the card shows an "Unassigned" label

#### Scenario: Opening a student from the grid

- **WHEN** a viewer activates a student card away from its checkbox
- **THEN** the app navigates to that student's detail page

### Requirement: List view presentation

The list view SHALL present students in a table with columns for the student's
photo, name, roster ID, classroom assignment, and per-row actions.

- The name, roster ID, and classroom columns SHALL be sortable, toggling between
  ascending and descending order; changing the sort SHALL reset pagination to the
  first page.
- Each row SHALL offer edit and delete actions.
- Activating a row (other than its checkbox or actions control) SHALL navigate to
  that student's detail page.
- A student with no classroom SHALL show an "Unassigned" label.

#### Scenario: Sorting by a column

- **WHEN** a viewer activates the classroom column header
- **THEN** the students are reordered by classroom ascending
- **AND** activating the same header again reorders them descending
- **AND** the page is reset to page 1

#### Scenario: Opening a student from the list

- **WHEN** a viewer activates a table row away from its checkbox and actions
  control
- **THEN** the app navigates to that student's detail page

### Requirement: Multi-select and bulk delete

Both views SHALL let the viewer select multiple students on the current page and
delete them in one action.

- The grid view SHALL show a selection checkbox on every card that becomes
  visible on hover or keyboard focus and remains visible while the card is
  selected; the list view SHALL show a selection checkbox in each row plus a
  select-all-on-page control in the header.
- A selected card or row SHALL be visually distinguished from an unselected one.
- Activating a selection checkbox SHALL toggle only that selection and SHALL NOT
  navigate to the student's detail page.
- While at least one student is selected, a bulk-action bar SHALL be shown
  reporting the selection count and offering "Clear" and "Delete" actions; the
  same bar SHALL serve both views.
- The delete action SHALL require confirmation before permanently deleting the
  selected students, and SHALL report the count in the confirmation prompt.
- The selection SHALL be cleared whenever the page, search query, sort, or view
  changes.

#### Scenario: Selecting and deleting in grid view

- **WHEN** a viewer in grid view selects two students' checkboxes
- **THEN** the bulk-action bar shows "2 selected"
- **AND** activating "Delete" and confirming permanently removes both students
- **AND** the selection is cleared

#### Scenario: Selecting a card does not open the student

- **WHEN** a viewer activates a card's selection checkbox
- **THEN** the card's selection toggles
- **AND** the app does not navigate to the student's detail page

#### Scenario: Selection clears on navigation within the page

- **WHEN** a viewer has students selected and then changes the page, search query,
  sort, or view
- **THEN** the selection is cleared

### Requirement: Pagination

The students index SHALL paginate results server-side, showing 20 students per
page in list view and 24 per page in grid view.

- The page SHALL show a range summary of the form "Showing X–Y of N students".
- Page navigation controls SHALL be shown only when there is more than one page,
  with previous/next controls disabled at the first/last page.

#### Scenario: Page size differs by view

- **WHEN** the list view renders the first page for a roster of 29 students
- **THEN** it shows students 1–20 and a summary "Showing 1–20 of 29 students"
- **AND** the grid view's first page shows students 1–24

#### Scenario: Navigating to the next page

- **WHEN** a viewer on page 1 activates the next-page control
- **THEN** the URL reflects page 2 and the next batch of students is shown

### Requirement: Empty states

The students index SHALL show a distinct empty state when the roster is empty and
when a search returns no matches.

#### Scenario: No students at all

- **WHEN** the viewer has no students and no active search
- **THEN** the page shows a "No students yet" empty state with an action to add a
  student

#### Scenario: Search with no matches

- **WHEN** an active search matches no students
- **THEN** the page shows a "No students found" empty state with an action to
  clear the search
