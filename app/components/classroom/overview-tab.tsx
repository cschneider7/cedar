import { Background, ReactFlow, ReactFlowProvider } from "@xyflow/react"
import { useMemo } from "react"
import { nodeTypes } from "~/components/seating-chart/seating-chart-canvas"
import { Button } from "~/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"
import type { Classroom, SeatingChart, Student } from "~/lib/schemas"
import {
  buildInitialNodes,
  getTableGeometry,
  getUnassignedStudents,
  GRID_STEP,
} from "~/lib/seating-chart-utils"

/**
 * Read-only summary of the classroom: roster stats plus a locked preview of
 * the seating chart, with quick links to the other tabs.
 */
export function OverviewTab({
  classroom,
  students,
  seatingChart,
  onNavigateTab,
}: {
  classroom: Classroom
  students: Student[]
  seatingChart: SeatingChart
  onNavigateTab: (tab: string) => void
}) {
  const studentsById = useMemo(
    () => new Map(students.map((s) => [s.id, s])),
    [students]
  )
  const previewNodes = useMemo(
    () => buildInitialNodes(classroom.id, seatingChart, studentsById),
    [classroom.id, seatingChart, studentsById]
  )
  const tableCount = getTableGeometry(previewNodes).length
  const unassignedCount = getUnassignedStudents(students, previewNodes).length

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Students</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {students.length}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tables</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {tableCount}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Unassigned</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {unassignedCount}
          </CardContent>
        </Card>
      </div>
      <ReactFlowProvider>
        <div className="h-64 overflow-hidden rounded-lg border">
          <ReactFlow
            nodes={previewNodes}
            nodeTypes={nodeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            panOnDrag
            zoomOnScroll
            minZoom={0.25}
            maxZoom={2}
          >
            <Background gap={GRID_STEP} size={2} />
          </ReactFlow>
        </div>
      </ReactFlowProvider>
      <div className="grid gap-4 sm:grid-cols-3">
        <Button variant="secondary" onClick={() => onNavigateTab("roster")}>
          Manage Roster
        </Button>
        <Button
          variant="secondary"
          onClick={() => onNavigateTab("seating-chart")}
        >
          Edit Seating Chart
        </Button>
        <Button variant="secondary" onClick={() => onNavigateTab("cold-call")}>
          Cold Call
        </Button>
      </div>
    </div>
  )
}
