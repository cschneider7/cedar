import { Show } from "@clerk/react-router"
import { Search } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useFetcher, useRouteLoaderData } from "react-router"
import { Badge } from "~/components/ui/badge"
import { InputGroup, InputGroupAddon, InputGroupInput } from "~/components/ui/input-group"
import { Item, ItemContent, ItemTitle } from "~/components/ui/item"
import { Popover, PopoverContent } from "~/components/ui/popover"
import type { loader as quickSearchLoader } from "~/routes/api/quick-search"
import type { loader as rootLoader } from "~/root"

const SEARCH_DEBOUNCE_MS = 300
const MAX_CLASSROOM_MATCHES = 5

/**
 * Topbar quick search: filters classrooms instantly and looks up matching
 * students with a short debounce.
 */
function SearchDropdown() {
  const rootData = useRouteLoaderData<typeof rootLoader>("root")
  const classrooms = rootData?.classrooms ?? []
  const fetcher = useFetcher<typeof quickSearchLoader>()
  const inputRef = useRef<HTMLInputElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [open, setOpen] = useState(false)

  // No PopoverTrigger (see below), so Base UI's outside-press dismissal
  // never fires — it needs a registered trigger. Close on outside click by hand.
  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (inputRef.current?.contains(target)) return
      if (contentRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [open])

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [query])

  useEffect(() => {
    if (!debouncedQuery) return
    fetcher.load(`/api/quick-search?q=${encodeURIComponent(debouncedQuery)}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery])

  const matchedClassrooms = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return classrooms
      .filter(
        (classroom) =>
          classroom.subject.toLowerCase().includes(q) ||
          `period ${classroom.period}`.includes(q)
      )
      .slice(0, MAX_CLASSROOM_MATCHES)
  }, [classrooms, query])

  const matchedStudents = query.trim() ? (fetcher.data?.students ?? []) : []
  const hasQuery = query.trim().length > 0
  const hasResults = matchedClassrooms.length > 0 || matchedStudents.length > 0

  function closeAndClear() {
    setOpen(false)
    setQuery("")
    setDebouncedQuery("")
  }

  return (
    // No PopoverTrigger: merging its props onto InputGroup broke typing
    // (added a conflicting role="button"). Anchored via inputRef instead.
    <Popover open={open && hasQuery} onOpenChange={setOpen}>
      <InputGroup className="max-w-48 min-w-25">
        <InputGroupInput
          ref={inputRef}
          aria-label="Search classrooms and students"
          placeholder="Search..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(e.target.value.trim().length > 0)
          }}
          onFocus={() => {
            if (query.trim().length > 0) setOpen(true)
          }}
        />
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
      </InputGroup>
      <PopoverContent
        ref={contentRef}
        anchor={inputRef}
        align="end"
        // Disable Base UI's focus management: it moves focus into the first
        // result on open, and refocuses the input on close (re-triggering onFocus).
        initialFocus={false}
        finalFocus={false}
        className="w-72 max-w-[calc(100vw-2rem)] p-2"
      >
        {!hasResults ? (
          <p className="p-2 text-sm text-muted-foreground">No results</p>
        ) : (
          <div className="flex flex-col gap-1">
            {matchedClassrooms.map((classroom) => (
              <Item
                key={classroom.id}
                size="sm"
                render={
                  <Link
                    to={`/classrooms/${classroom.id}`}
                    onClick={closeAndClear}
                  />
                }
              >
                <ItemContent>
                  <ItemTitle>
                    Period {classroom.period} — {classroom.subject}
                  </ItemTitle>
                </ItemContent>
                <Badge variant="secondary">Classroom</Badge>
              </Item>
            ))}
            {matchedStudents.map((student) => (
              <Item
                key={student.id}
                size="sm"
                render={
                  <Link to={`/students/${student.id}`} onClick={closeAndClear} />
                }
              >
                <ItemContent>
                  <ItemTitle>{student.name}</ItemTitle>
                </ItemContent>
                <Badge variant="secondary">Student</Badge>
              </Item>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

/**
 * Wraps `SearchDropdown` so it doesn't render for a signed-out visitor.
 */
export function TopbarSearch() {
  return (
    <Show when="signed-in">
      <SearchDropdown />
    </Show>
  )
}
