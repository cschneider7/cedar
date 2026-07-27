export type BreadcrumbHandle = {
  breadcrumb: (data: any) => string
  // The route's own `match.pathname` (from useMatches()) isn't reliable as a
  // link target for pathless layout routes - a layout with no `path` of its
  // own doesn't accumulate the prefix applied to its children, so it resolves
  // to the parent's pathname instead of e.g. "/classrooms". Each handle must
  // supply its real destination explicitly.
  to: string | ((data: any) => string)
}
