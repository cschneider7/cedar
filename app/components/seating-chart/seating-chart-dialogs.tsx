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
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
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
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Randomize Seating Chart</DialogTitle>
            <DialogDescription>
              Nothing is saved until you click Save.
            </DialogDescription>
          </DialogHeader>
          {fetcher.data && !fetcher.data.ok && (
            <Alert variant="destructive">
              <AlertDescription>{fetcher.data.error}</AlertDescription>
            </Alert>
          )}
          <FieldGroup>
            <Field orientation="horizontal">
              <Switch
                id="table-retain"
                checked={keepExisting}
                onCheckedChange={setKeepExisting}
                disabled={keptTables.length === 0}
              />
              <FieldContent>
                <FieldLabel className="font-normal">
                  Keep Existing Tables
                </FieldLabel>
                <FieldDescription>
                  Adds tables automatically if needed.
                </FieldDescription>
              </FieldContent>
            </Field>
            <FieldSet className="w-full max-w-xs">
              <FieldLegend variant="label">New Table Size</FieldLegend>
              <RadioGroup
                value={sizeMode}
                onValueChange={(value) =>
                  setSizeMode(value as "default" | "custom")
                }
              >
                <Field orientation="horizontal">
                  <RadioGroupItem value="default" id="table-size-default" />
                  <FieldLabel className="font-normal">Default</FieldLabel>
                  <FieldDescription>2 × 2</FieldDescription>
                </Field>
                <Field orientation="horizontal">
                  <RadioGroupItem value="custom" id="table-size-custom" />
                  <FieldLabel className="font-normal">Custom</FieldLabel>
                </Field>
                {sizeMode === "custom" && (
                  <div className="flex gap-2 pl-6">
                    <Field>
                      <FieldLabel
                        htmlFor="table-size-rows"
                        className="font-normal"
                      >
                        Rows
                      </FieldLabel>
                      <Input
                        id="table-size-rows"
                        type="number"
                        min={1}
                        max={MAX_TABLE_DIMENSION}
                        value={customRows}
                        onChange={(e) => setCustomRows(Number(e.target.value))}
                      />
                    </Field>
                    <Field>
                      <FieldLabel
                        htmlFor="table-size-cols"
                        className="font-normal"
                      >
                        Columns
                      </FieldLabel>
                      <Input
                        id="table-size-cols"
                        type="number"
                        min={1}
                        max={MAX_TABLE_DIMENSION}
                        value={customCols}
                        onChange={(e) => setCustomCols(Number(e.target.value))}
                      />
                    </Field>
                  </div>
                )}
              </RadioGroup>
            </FieldSet>
            <FieldDescription>
              {totalTables} table{totalTables === 1 ? "" : "s"} total
              {neededNewTables > 0 && `, ${neededNewTables} new`}
            </FieldDescription>
            {totalTables > RANDOMIZE_TABLE_COUNT_WARNING_THRESHOLD && (
              <Alert>
                <AlertDescription>
                  This will create a lot of tables. Are you sure?
                </AlertDescription>
              </Alert>
            )}
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={isSubmitting || studentCount === 0}>
              {isSubmitting && <Spinner />}
              Generate
            </Button>
          </DialogFooter>
        </form>
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
