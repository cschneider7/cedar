export type BreadcrumbHandle = {
  breadcrumb: (data: any) => string
  // A pathless layout route's own `match.pathname` (from useMatches()) isn't
  // reliable here — it resolves to the parent's path, not e.g. "/classrooms".
  to: string | ((data: any) => string)
}
