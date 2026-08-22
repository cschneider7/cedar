import { SearchIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useRevalidator } from "react-router"
import { StudentAvatar } from "~/components/student-avatar"
import { Alert, AlertDescription } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "~/components/ui/combobox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { Empty, EmptyDescription, EmptyTitle } from "~/components/ui/empty"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "~/components/ui/input-group"
import {
  Item,
  ItemContent,
  ItemFooter,
  ItemGroup,
  ItemHeader,
  ItemMedia,
  ItemTitle,
} from "~/components/ui/item"
import { ScrollArea } from "~/components/ui/scroll-area"
import { Spinner } from "~/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group"
import type { Separation, Student } from "~/lib/schemas"

type SeatingPreference = "front" | "back" | null

function buildPreferences(
  students: Student[]
): Record<string, SeatingPreference> {
  return Object.fromEntries(
    students.map((s) => [s.id, s.seating_preference ?? null])
  )
}

function buildAvoided(
  students: Student[],
  separations: Separation[]
): Record<string, Set<string>> {
  const map = Object.fromEntries(
    students.map((s): [string, Set<string>] => [s.id, new Set()])
  )
  for (const separation of separations) {
    map[separation.student_id_a]?.add(separation.student_id_b)
    map[separation.student_id_b]?.add(separation.student_id_a)
  }
  return map
}

/** One student's row/back preference plus who they're kept apart from. */
function StudentPreferenceRow({
  student,
  otherStudents,
  preference,
  avoidedIds,
  onPreferenceChange,
  onAvoidedChange,
}: {
  student: Student
  otherStudents: Student[]
  preference: SeatingPreference
  avoidedIds: Set<string>
  onPreferenceChange: (value: SeatingPreference) => void
  onAvoidedChange: (ids: string[]) => void
}) {
  const anchor = useComboboxAnchor()
  const avoidedStudents = otherStudents.filter((s) => avoidedIds.has(s.id))

  return (
    <Item variant="outline" size="sm" className="flex-col items-stretch">
      <ItemHeader>
        <ItemMedia variant="image">
          <StudentAvatar
            student={student}
            className="size-full rounded-full text-xs"
          />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>{student.name}</ItemTitle>
        </ItemContent>
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          value={preference ? [preference] : ["none"]}
          onValueChange={(value) => {
            const next = value[0]
            onPreferenceChange(
              !next || next === "none" ? null : (next as "front" | "back")
            )
          }}
        >
          <ToggleGroupItem value="none">None</ToggleGroupItem>
          <ToggleGroupItem value="front">Front</ToggleGroupItem>
          <ToggleGroupItem value="back">Back</ToggleGroupItem>
        </ToggleGroup>
      </ItemHeader>
      <ItemFooter className="justify-start gap-2">
        <span className="shrink-0 text-xs text-muted-foreground">Avoid</span>
        <Combobox
          items={otherStudents}
          multiple
          value={avoidedStudents}
          onValueChange={(value: Student[]) =>
            onAvoidedChange(value.map((s) => s.id))
          }
          itemToStringLabel={(s: Student) => s.name}
          isItemEqualToValue={(a: Student, b: Student) => a.id === b.id}
        >
          <ComboboxChips
            ref={anchor}
            className="min-w-0 flex-1 border-input bg-transparent"
          >
            <ComboboxValue>
              {(items: Student[]) =>
                items.map((item) => (
                  <ComboboxChip key={item.id} aria-label={item.name}>
                    <span className="max-w-24 truncate">{item.name}</span>
                  </ComboboxChip>
                ))
              }
            </ComboboxValue>
            <ComboboxChipsInput disabled={otherStudents.length === 0} />
          </ComboboxChips>
          <ComboboxContent anchor={anchor}>
            <ComboboxEmpty>No students found.</ComboboxEmpty>
            <ComboboxList>
              {(item: Student) => (
                <ComboboxItem key={item.id} value={item}>
                  <Item
                    variant="default"
                    size="xs"
                    className="w-full border-none bg-transparent p-0"
                  >
                    <ItemMedia variant="image">
                      <StudentAvatar
                        student={item}
                        className="size-full rounded-full text-[8px]"
                      />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{item.name}</ItemTitle>
                    </ItemContent>
                  </Item>
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </ItemFooter>
    </Item>
  )
}

/**
 * Combined dialog for a classroom's seating preferences: each student's
 * row preference (front/back/none) and who they should be kept apart from.
 * Nothing is sent to the backend until Save is pressed.
 */
export function SeatingPreferencesDialog({
  open,
  onOpenChange,
  students,
  separations,
  initialSearch,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  students: Student[]
  separations: Separation[]
  initialSearch?: string
}) {
  const [preferences, setPreferences] = useState<
    Record<string, SeatingPreference>
  >({})
  const [avoided, setAvoided] = useState<Record<string, Set<string>>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const revalidator = useRevalidator()

  const sortedStudents = useMemo(
    () => [...students].sort((a, b) => a.name.localeCompare(b.name)),
    [students]
  )
  const otherStudentsById = useMemo(() => {
    const map = new Map<string, Student[]>()
    for (const student of students) {
      map.set(
        student.id,
        sortedStudents.filter((s) => s.id !== student.id)
      )
    }
    return map
  }, [students, sortedStudents])

  const visibleStudents = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) {
      return sortedStudents
    }
    return sortedStudents.filter((s) => s.name.toLowerCase().includes(query))
  }, [sortedStudents, search])

  useEffect(() => {
    if (!open) {
      return
    }
    setPreferences(buildPreferences(students))
    setAvoided(buildAvoided(students, separations))
    setError(null)
    setSearch(initialSearch ?? "")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, students, separations])

  function handleAvoidedChange(studentId: string, nextIds: string[]) {
    setAvoided((prev) => {
      const prevSet = prev[studentId] ?? new Set<string>()
      const nextSet = new Set(nextIds)
      const next: Record<string, Set<string>> = {
        ...prev,
        [studentId]: nextSet,
      }

      for (const otherId of prevSet) {
        if (!nextSet.has(otherId)) {
          const otherSet = new Set(next[otherId] ?? prev[otherId])
          otherSet.delete(studentId)
          next[otherId] = otherSet
        }
      }
      for (const otherId of nextSet) {
        if (!prevSet.has(otherId)) {
          const otherSet = new Set(next[otherId] ?? prev[otherId])
          otherSet.add(studentId)
          next[otherId] = otherSet
        }
      }
      return next
    })
  }

  async function handleSave() {
    setIsSaving(true)
    setError(null)

    const changedPreferences = students.filter(
      (s) => (s.seating_preference ?? null) !== preferences[s.id]
    )

    const initialAvoided = buildAvoided(students, separations)
    const addedPairs: [string, string][] = []
    const seenPairs = new Set<string>()
    for (const student of students) {
      for (const otherId of avoided[student.id] ?? []) {
        const key = [student.id, otherId].sort().join(":")
        if (seenPairs.has(key)) {
          continue
        }
        seenPairs.add(key)
        if (!initialAvoided[student.id]?.has(otherId)) {
          addedPairs.push([student.id, otherId])
        }
      }
    }
    const removedSeparations = separations.filter(
      (s) => !avoided[s.student_id_a]?.has(s.student_id_b)
    )

    const results = await Promise.allSettled([
      ...changedPreferences.map((student) =>
        fetch(`/students/${student.id}/edit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            seating_preference: preferences[student.id],
          }),
        }).then((response) => {
          if (!response.ok) {
            throw new Error(`Failed to update ${student.name}`)
          }
        })
      ),
      ...addedPairs.map(([studentIdA, studentIdB]) =>
        fetch(`/classrooms/separations/new`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            student_id_a: studentIdA,
            student_id_b: studentIdB,
          }),
        }).then((response) => {
          if (!response.ok) {
            throw new Error("Failed to add a separation")
          }
        })
      ),
      ...removedSeparations.map((separation) =>
        fetch(`/classrooms/separations/${separation.id}/delete`, {
          method: "POST",
        }).then((response) => {
          if (!response.ok) {
            throw new Error("Failed to remove a separation")
          }
        })
      ),
    ])

    setIsSaving(false)
    await revalidator.revalidate()

    const failedCount = results.filter((r) => r.status === "rejected").length
    if (failedCount > 0) {
      setError(
        `Failed to save ${failedCount} change${failedCount === 1 ? "" : "s"}.`
      )
      return
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="select-none sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Seating Preferences</DialogTitle>
          <DialogDescription>
            Manage how each student should be seated when generating random
            seating charts.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {sortedStudents.length === 0 ? (
          <Empty>
            <EmptyTitle>No students yet</EmptyTitle>
            <EmptyDescription>
              Add students to this classroom's roster.
            </EmptyDescription>
          </Empty>
        ) : (
          <>
            <div className="px-3">
              <InputGroup>
                <InputGroupInput
                  placeholder="Search students..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search students"
                />
                <InputGroupAddon>
                  <SearchIcon />
                </InputGroupAddon>
              </InputGroup>
            </div>
            <ScrollArea className="h-96">
              {visibleStudents.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">
                  No students found.
                </p>
              ) : (
                <ItemGroup className="p-3">
                  {visibleStudents.map((student) => (
                    <StudentPreferenceRow
                      key={student.id}
                      student={student}
                      otherStudents={otherStudentsById.get(student.id) ?? []}
                      preference={preferences[student.id] ?? null}
                      avoidedIds={avoided[student.id] ?? new Set()}
                      onPreferenceChange={(value) =>
                        setPreferences((prev) => ({
                          ...prev,
                          [student.id]: value,
                        }))
                      }
                      onAvoidedChange={(ids) =>
                        handleAvoidedChange(student.id, ids)
                      }
                    />
                  ))}
                </ItemGroup>
              )}
            </ScrollArea>
          </>
        )}
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>
            Cancel
          </DialogClose>
          <Button type="button" disabled={isSaving} onClick={handleSave}>
            {isSaving && <Spinner />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
