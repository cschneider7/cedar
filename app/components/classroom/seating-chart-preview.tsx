import { ArrowUpRightIcon, Maximize2Icon } from "lucide-react"
import { StudentAvatar } from "~/components/student-avatar"
import { Button } from "~/components/ui/button"
import type { SeatingChart, Student } from "~/lib/schemas"
import {
  getSeatPosition,
  getTableNodeSize,
  SEAT_NODE_SIZE,
} from "~/lib/seating-chart-utils"

/**
 * Fully static, non-interactive preview of the seating chart: plain SVG
 * geometry with no React Flow instance, so hovering it never captures the
 * page's own scroll/pan/zoom the way the real editable canvas does.
 */
export function SeatingChartPreview({
  seatingChart,
  students,
  onNavigateTab,
}: {
  seatingChart: SeatingChart
  students: Student[]
  onNavigateTab: (tab: string) => void
}) {
  const studentsById = new Map(students.map((s) => [s.id, s]))

  return (
    <div className="relative h-96 overflow-hidden rounded-lg border bg-muted/20">
      <Button
        size="sm"
        variant="link"
        aria-label="Edit seating chart"
        className="absolute top-2 right-2 z-10"
        onClick={() => onNavigateTab("seating-chart")}
      >
        Edit <ArrowUpRightIcon data-icon="inline-end" />
      </Button>
      <svg
        viewBox={`0 0 ${seatingChart.boundary_width} ${seatingChart.boundary_height}`}
        preserveAspectRatio="xMidYMid meet"
        className="size-full"
      >
        {seatingChart.tables.map((table) => {
          const { width, height } = getTableNodeSize(table.rows, table.cols)
          return (
            <g
              key={table.table_number}
              transform={`translate(${table.x_pos}, ${table.y_pos})`}
            >
              <rect
                width={width}
                height={height}
                rx={12}
                className="fill-card stroke-border"
                strokeWidth={2}
              />
              {Array.from({ length: table.rows }).map((_, row) =>
                Array.from({ length: table.cols }).map((_, col) => {
                  const { x, y } = getSeatPosition(row, col)
                  const studentId =
                    table.seat_assignments[row * table.cols + col]
                  const student = studentId
                    ? studentsById.get(studentId)
                    : undefined
                  return (
                    <g
                      key={`${row}:${col}`}
                      transform={`translate(${x}, ${y})`}
                    >
                      <rect
                        width={SEAT_NODE_SIZE}
                        height={SEAT_NODE_SIZE}
                        rx={8}
                        className="fill-muted/40 stroke-border"
                        strokeWidth={1}
                        strokeDasharray="4 3"
                      />
                      {student && (
                        <foreignObject
                          width={SEAT_NODE_SIZE}
                          height={SEAT_NODE_SIZE}
                        >
                          <StudentAvatar
                            student={student}
                            className="size-full rounded-lg text-sm"
                          />
                        </foreignObject>
                      )}
                    </g>
                  )
                })
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
