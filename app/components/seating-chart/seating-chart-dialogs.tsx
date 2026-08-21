import { UsersRoundIcon, XIcon } from "lucide-react"
import React, { useEffect, useMemo, useState } from "react"
import { useFetcher } from "react-router"
import { StudentAvatar } from "~/components/student-avatar"
import { Alert, AlertDescription } from "~/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group"
import { ScrollArea } from "~/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { Spinner } from "~/components/ui/spinner"
import { Switch } from "~/components/ui/switch"
import { useDeleteResource } from "~/hooks/use-delete-resource"
import type {
  RandomizeSeatingChartOptions,
  SeatingChart,
  Separation,
  Student,
} from "~/lib/schemas"
import {
  computeRandomizeTableCount,
  DEFAULT_TABLE_COLS,
  DEFAULT_TABLE_ROWS,
  getBoundaryMinSize,
  GRID_STEP,
  MAX_TABLE_DIMENSION,
  RANDOMIZE_TABLE_COUNT_WARNING_THRESHOLD,
  type TableGeometry,
} from "~/lib/seating-chart-utils"
import type { action as createSeparationAction } from "~/routes/classrooms/create-separation"
import type { action as randomizeSeatingChartAction } from "~/routes/classrooms/randomize-seating-chart"

/** Dialog for generating a randomized seating chart, applied as an unsaved canvas edit. */
export function RandomSeatingChartDialog({
  classroomId,
  studentCount,
  keptTables,
  boundary,
  onGenerate,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  classroomId: string
  studentCount: number
  keptTables: TableGeometry[]
  boundary: { width: number; height: number }
  onGenerate: (chart: SeatingChart) => void
}) {
  const [keepExisting, setKeepExisting] = useState(keptTables.length > 0)
  const [sizeMode, setSizeMode] = useState<"default" | "custom">("default")
  const [customRows, setCustomRows] = useState(DEFAULT_TABLE_ROWS)
  const [customCols, setCustomCols] = useState(DEFAULT_TABLE_COLS)

  const fetcher = useFetcher<typeof randomizeSeatingChartAction>()
  const isSubmitting = fetcher.state !== "idle"

  useEffect(() => {
    if (!props.open) {
      return
    }
    setKeepExisting(keptTables.length > 0)
    setSizeMode("default")
    setCustomRows(DEFAULT_TABLE_ROWS)
    setCustomCols(DEFAULT_TABLE_COLS)
  }, [props.open])

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      onGenerate(fetcher.data.seatingChart)
    }
  }, [fetcher.state, fetcher.data])

  const rows = sizeMode === "default" ? DEFAULT_TABLE_ROWS : customRows
  const cols = sizeMode === "default" ? DEFAULT_TABLE_COLS : customCols

  const keptCapacity = keepExisting
    ? keptTables.reduce((sum, t) => sum + t.rows * t.cols, 0)
    : 0
  const { neededNewTables, totalTables } = computeRandomizeTableCount(
    studentCount,
    keepExisting ? keptTables.length : 0,
    keptCapacity,
    rows,
    cols
  )

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const payload: RandomizeSeatingChartOptions = {
      keep_existing_tables: keepExisting,
      new_table_rows: rows,
      new_table_cols: cols,
      existing_tables: keepExisting ? keptTables : [],
      boundary_width: boundary.width,
      boundary_height: boundary.height,
    }
    fetcher.submit(payload, {
      method: "post",
      action: `/classrooms/${classroomId}/randomize-seating-chart`,
      encType: "application/json",
    })
  }

  return (
    <Dialog {...props}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Randomize Seating Chart</DialogTitle>
          <DialogDescription>
            Generate a random seating chart. Tables will automatically be
            created to seat every student.
          </DialogDescription>
        </DialogHeader>
        {fetcher.data && !fetcher.data.ok && (
          <Alert variant="destructive">
            <AlertDescription>{fetcher.data.error}</AlertDescription>
          </Alert>
        )}
        <form id="randomize-seating-chart-form" onSubmit={handleSubmit}>
          <FieldGroup>
            <FieldSet className="w-full max-w-xs">
              <FieldLegend>Options</FieldLegend>
              <Field orientation="horizontal">
                <FieldLabel htmlFor="table-retain">
                  Keep Existing Tables
                </FieldLabel>
                <Switch
                  id="table-retain"
                  checked={keepExisting}
                  onCheckedChange={setKeepExisting}
                  disabled={keptTables.length === 0}
                />
              </Field>
            </FieldSet>
            <FieldSeparator />
            <FieldSet className="w-full max-w-xs">
              <FieldLegend>Size of New Tables</FieldLegend>
              <RadioGroup
                defaultValue="default"
                onValueChange={(value) =>
                  setSizeMode(value as "default" | "custom")
                }
              >
                <Field orientation="horizontal">
                  <RadioGroupItem value="default" id="table-size-default" />
                  <FieldLabel
                    htmlFor="table-size-default"
                    className="font-normal"
                  >
                    Default
                  </FieldLabel>
                  <FieldDescription>2 × 2</FieldDescription>
                </Field>
                <div className="flex items-center gap-2">
                  <Field orientation="horizontal">
                    <RadioGroupItem value="custom" id="table-size-custom" />
                    <FieldLabel
                      htmlFor="table-size-custom"
                      className="font-normal"
                    >
                      Custom
                    </FieldLabel>
                  </Field>
                  <Field orientation="horizontal" className="max-w-15 self-end">
                    <Input
                      id="table-size-rows"
                      disabled={sizeMode !== "custom"}
                      type="number"
                      min={1}
                      max={MAX_TABLE_DIMENSION}
                      value={customRows}
                      onChange={(e) => setCustomRows(Number(e.target.value))}
                    />
                  </Field>
                  <FieldDescription>×</FieldDescription>
                  <Field orientation="horizontal" className="max-w-15 self-end">
                    <Input
                      id="table-size-cols"
                      disabled={sizeMode !== "custom"}
                      type="number"
                      min={1}
                      max={MAX_TABLE_DIMENSION}
                      value={customCols}
                      onChange={(e) => setCustomCols(Number(e.target.value))}
                    />
                  </Field>
                </div>
              </RadioGroup>
            </FieldSet>
            {totalTables > RANDOMIZE_TABLE_COUNT_WARNING_THRESHOLD && (
              <Alert>
                <AlertDescription>
                  This will create a lot of tables. Are you sure?
                </AlertDescription>
              </Alert>
            )}
          </FieldGroup>
        </form>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            type="submit"
            form="randomize-seating-chart-form"
            disabled={isSubmitting || studentCount === 0}
          >
            {isSubmitting && <Spinner />}
            Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Dialog for resizing the seating chart's boundary, floored to fit existing tables. */
export function BoundarySizeDialog({
  boundary,
  tables,
  onSave,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  boundary: { width: number; height: number }
  tables: TableGeometry[]
  onSave: (boundary: { width: number; height: number }) => void
}) {
  const min = getBoundaryMinSize(tables)
  const [width, setWidth] = useState(boundary.width)
  const [height, setHeight] = useState(boundary.height)

  useEffect(() => {
    if (!props.open) {
      return
    }
    setWidth(boundary.width)
    setHeight(boundary.height)
  }, [props.open])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    onSave({
      width: Math.max(min.width, width),
      height: Math.max(min.height, height),
    })
  }

  return (
    <Dialog {...props}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Boundary Size</DialogTitle>
            <DialogDescription>
              Nothing is saved until you click Save.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="boundary-width">Width</FieldLabel>
              <Input
                id="boundary-width"
                type="number"
                min={min.width}
                step={GRID_STEP}
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="boundary-height">Height</FieldLabel>
              <Input
                id="boundary-height"
                type="number"
                min={min.height}
                step={GRID_STEP}
                value={height}
                onChange={(e) => setHeight(Number(e.target.value))}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Confirmation dialog for clearing every seat assignment on the chart. */
export function UnassignAllDialog({
  onUnassignAll,
  ...props
}: React.ComponentProps<typeof AlertDialog> & {
  onUnassignAll: () => void
}) {
  return (
    <AlertDialog {...props}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive">
            <UsersRoundIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>Unassign all students?</AlertDialogTitle>
          <AlertDialogDescription>
            This clears every seat assignment on this chart. It isn't saved
            until you click Save.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="outline">Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onUnassignAll}>
            Unassign All
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** A student's avatar + name, sized for an inline list row. */
function StudentTag({ student }: { student?: Student }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1.5">
      {student && (
        <StudentAvatar
          student={student}
          className="size-6 shrink-0 rounded-full text-[9px]"
        />
      )}
      <span className="truncate">{student?.name ?? "Unknown student"}</span>
    </span>
  )
}

/** One "keep apart" pair row, with its own delete flow so removing one pair
 * doesn't block another still in flight. */
function SeparationRow({
  separation,
  studentsById,
  onRemoved,
}: {
  separation: Separation
  studentsById: Map<string, Student>
  onRemoved: (id: string) => void
}) {
  const { isDeleting, submit } = useDeleteResource({
    successMessage: "Pair removed",
    onDeleted: () => onRemoved(separation.id),
  })

  const studentA = studentsById.get(separation.student_id_a)
  const studentB = studentsById.get(separation.student_id_b)

  function handleRemove() {
    submit(null, {
      method: "post",
      action: `/classrooms/separations/${separation.id}/delete`,
    })
  }

  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm">
      <StudentTag student={studentA} />
      <span aria-hidden="true" className="shrink-0 text-muted-foreground">
        ↔
      </span>
      <StudentTag student={studentB} />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="shrink-0"
        disabled={isDeleting}
        onClick={handleRemove}
        aria-label={`Remove separation between ${studentA?.name ?? "Unknown student"} and ${studentB?.name ?? "Unknown student"}`}
      >
        {isDeleting ? <Spinner /> : <XIcon />}
      </Button>
    </div>
  )
}

/** Dialog for managing "keep apart" pairs: students who shouldn't be seated
 * at the same table when the chart is randomized. */
export function KeepApartDialog({
  students,
  separations,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  students: Student[]
  separations: Separation[]
}) {
  const [pairs, setPairs] = useState(separations)
  const [studentAId, setStudentAId] = useState<string | null>(null)
  const [studentBId, setStudentBId] = useState<string | null>(null)
  const addFetcher = useFetcher<typeof createSeparationAction>()
  const isAdding = addFetcher.state !== "idle"

  const studentsById = useMemo(
    () => new Map(students.map((s) => [s.id, s])),
    [students]
  )
  // Alphabetical, so a roster of 20-30+ students is scannable in both the
  // picker dropdowns and the pair list below.
  const sortedStudents = useMemo(
    () => [...students].sort((a, b) => a.name.localeCompare(b.name)),
    [students]
  )

  useEffect(() => {
    if (!props.open) {
      return
    }
    setPairs(separations)
    setStudentAId(null)
    setStudentBId(null)
  }, [props.open, separations])

  useEffect(() => {
    const data = addFetcher.data
    if (addFetcher.state === "idle" && data?.ok) {
      // Guards against React StrictMode's dev-only double effect invocation
      // appending the same pair twice.
      setPairs((prev) =>
        prev.some((p) => p.id === data.separation.id)
          ? prev
          : [...prev, data.separation]
      )
      setStudentAId(null)
      setStudentBId(null)
    }
  }, [addFetcher.state, addFetcher.data])

  function handleRemoved(id: string) {
    setPairs((prev) => prev.filter((p) => p.id !== id))
  }

  const studentAOptions = sortedStudents.filter((s) => s.id !== studentBId)
  const studentBOptions = sortedStudents.filter((s) => s.id !== studentAId)
  const canAdd = !!studentAId && !!studentBId && studentAId !== studentBId

  const sortedPairs = useMemo(
    () =>
      [...pairs].sort((a, b) => {
        const nameA = studentsById.get(a.student_id_a)?.name ?? ""
        const nameB = studentsById.get(b.student_id_a)?.name ?? ""
        return nameA.localeCompare(nameB)
      }),
    [pairs, studentsById]
  )

  function handleAdd() {
    if (!canAdd) {
      return
    }
    addFetcher.submit(
      { student_id_a: studentAId, student_id_b: studentBId },
      {
        method: "post",
        action: "/classrooms/separations/new",
        encType: "application/json",
      }
    )
  }

  return (
    <Dialog {...props}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keep Apart</DialogTitle>
          <DialogDescription>
            Pairs of students who shouldn't be seated at the same table when
            randomizing.
          </DialogDescription>
        </DialogHeader>
        {addFetcher.data && !addFetcher.data.ok && (
          <Alert variant="destructive">
            <AlertDescription>{addFetcher.data.error}</AlertDescription>
          </Alert>
        )}
        <ScrollArea className="h-48 rounded-md border">
          <div className="flex flex-col gap-1 p-2">
            {sortedPairs.length === 0 && (
              <p className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                No pairs yet.
              </p>
            )}
            {sortedPairs.map((pair) => (
              <SeparationRow
                key={pair.id}
                separation={pair}
                studentsById={studentsById}
                onRemoved={handleRemoved}
              />
            ))}
          </div>
        </ScrollArea>
        {students.length < 2 ? (
          <p className="text-sm text-muted-foreground">
            Add at least two students to this classroom to create a pair.
          </p>
        ) : (
          <div className="flex items-end gap-2">
            <Field className="flex-1">
              <FieldLabel>Student</FieldLabel>
              <Select
                value={studentAId}
                onValueChange={setStudentAId}
                items={studentAOptions.map((s) => ({
                  label: s.name,
                  value: s.id,
                }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select student" />
                </SelectTrigger>
                <SelectContent className="min-w-56">
                  {studentAOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <StudentAvatar
                        student={s}
                        className="size-5 shrink-0 rounded-full text-[8px]"
                      />
                      <span className="min-w-0 truncate">{s.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field className="flex-1">
              <FieldLabel>Student</FieldLabel>
              <Select
                value={studentBId}
                onValueChange={setStudentBId}
                items={studentBOptions.map((s) => ({
                  label: s.name,
                  value: s.id,
                }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select student" />
                </SelectTrigger>
                <SelectContent className="min-w-56">
                  {studentBOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <StudentAvatar
                        student={s}
                        className="size-5 shrink-0 rounded-full text-[8px]"
                      />
                      <span className="min-w-0 truncate">{s.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Button
              type="button"
              disabled={!canAdd || isAdding}
              onClick={handleAdd}
            >
              {isAdding && <Spinner />}
              Add
            </Button>
          </div>
        )}
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>
            Close
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
