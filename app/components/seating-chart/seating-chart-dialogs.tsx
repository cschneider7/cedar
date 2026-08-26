import { UsersRoundIcon } from "lucide-react"
import React, { useEffect, useState } from "react"
import { useFetcher } from "react-router"
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
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group"
import { Spinner } from "~/components/ui/spinner"
import { Switch } from "~/components/ui/switch"
import type { RandomizeSeatingChartOptions, SeatingChart } from "~/lib/schemas"
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
      <DialogContent className="select-none sm:max-w-sm">
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
      <DialogContent className="select-none sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Boundary Size</DialogTitle>
        </DialogHeader>
        <form id="boundary-size-form" onSubmit={handleSubmit}>
          <FieldGroup>
            <div className="flex items-center gap-2">
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
            </div>
          </FieldGroup>
        </form>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>
            Cancel
          </DialogClose>
          <Button type="submit" form="boundary-size-form">
            Save
          </Button>
        </DialogFooter>
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
      <AlertDialogContent size="sm" className="select-none">
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
