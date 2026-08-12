import type { SeatingChart, Student } from "~/lib/schemas"
import type { Table } from "~/lib/types"

export const BOUNDARY_NODE_ID = "__boundary__"

export const CANVAS_PADDING = 1000
export const GRID_STEP = 20

export const DEFAULT_TABLE_ROWS = 2
export const DEFAULT_TABLE_COLS = 2
export const MAX_TABLE_DIMENSION = 15
export const TABLE_OFFSET = GRID_STEP * 2
export const TABLE_GAP = GRID_STEP

export const SEAT_PADDING = 10
export const SEAT_NODE_SIZE = 90
export const STUDENT_NODE_SIZE = SEAT_NODE_SIZE

// Starting weight for a student being cold called
export const INITIAL_WEIGHT = 100

export type Point = { x: number; y: number }

export type TableNodeData = { table_number: number; rows: number; cols: number }
export type SeatNodeData = { row: number; col: number }
export type StudentNodeData = { student: Student }
export type BoundaryNodeData = { width: number; height: number }

export type SeatingChartBoundaryNode = {
  id: string
  type: "boundary"
  position: Point
  width: number
  height: number
  draggable: false
  selectable: false
  deletable: false
  selected?: boolean
  className?: string
  zIndex: number
  data: BoundaryNodeData
}
export type SeatingChartTableNode = {
  id: string
  type: "table"
  position: Point
  deletable: false // deletion goes through TableNode's toolbar, which cascades to seats/students
  selected?: boolean
  className?: string
  extent?: [[number, number], [number, number]] // clamped to the boundary node's current size, kept in sync at construction/update time
  data: TableNodeData
}
export type SeatingChartSeatNode = {
  id: string
  type: "seat"
  position: Point
  parentId: string // a seat always belongs to a table
  draggable: false
  selectable: false
  deletable: false
  selected?: boolean
  className?: string
  data: SeatNodeData
}
export type SeatingChartStudentNode = {
  id: string
  type: "student"
  position: Point
  parentId?: string // set == seated (value is the owning seat's id), unset == unassigned
  deletable: false
  selected?: boolean
  className?: string
  extent?: [[number, number], [number, number]] // clamped to canvasExtent(boundary), kept in sync at construction/update time
  data: StudentNodeData
}
export type SeatingChartNode =
  | SeatingChartBoundaryNode
  | SeatingChartTableNode
  | SeatingChartSeatNode
  | SeatingChartStudentNode

/**
 * Builds a seat node's id from its table id and grid coordinate.
 * @param tableId - Id of the owning table node
 * @param row - Seat's row index within the table
 * @param col - Seat's column index within the table
 * @returns The seat node's id
 */
export function getSeatId(tableId: string, row: number, col: number): string {
  return `${tableId}:${row}:${col}`
}

/**
 * Computes a seat's pixel position within its table from its grid coordinate.
 * @param row - Seat's row index within the table
 * @param col - Seat's column index within the table
 * @returns The seat's `{ x, y }` position relative to its table
 */
export function getSeatPosition(row: number, col: number): Point {
  const step = SEAT_NODE_SIZE + SEAT_PADDING
  return { x: SEAT_PADDING + col * step, y: SEAT_PADDING + row * step }
}

/**
 * Computes a table's rendered pixel size from its rows/cols.
 * @param rows - Number of seat rows
 * @param cols - Number of seat columns
 * @returns The table node's `{ width, height }` in pixels
 */
export function getTableNodeSize(
  rows: number,
  cols: number
): { width: number; height: number } {
  const dimSize = (n: number) =>
    n * (SEAT_NODE_SIZE + SEAT_PADDING) + SEAT_PADDING
  return { width: dimSize(cols), height: dimSize(rows) }
}

/**
 * Creates a new table's default seat grid at the given canvas position.
 * @param position - Canvas position for the new table
 * @returns A new table, ready to be added to the canvas
 */
export function createCanvasTable(position: Point): Table {
  return {
    id: crypto.randomUUID(), // Placeholder value
    tableNumber: 0, // Placeholder value
    x_pos: position.x,
    y_pos: position.y,
    rows: DEFAULT_TABLE_ROWS,
    cols: DEFAULT_TABLE_COLS,
    seats: Array(DEFAULT_TABLE_ROWS * DEFAULT_TABLE_COLS),
  }
}

/**
 * Builds the synthetic boundary node from a classroom's boundary dimensions.
 * @param width - Boundary width in pixels
 * @param height - Boundary height in pixels
 * @returns The boundary node
 */
export function buildBoundaryNode(
  width: number,
  height: number
): SeatingChartBoundaryNode {
  return {
    id: BOUNDARY_NODE_ID,
    type: "boundary",
    position: { x: 0, y: 0 },
    width,
    height,
    draggable: false,
    selectable: false,
    deletable: false,
    zIndex: -1,
    data: { width, height },
  }
}

/**
 * Computes the `extent` that clamps a table node to a boundary's bounds.
 * @param boundary - Boundary dimensions to clamp against
 * @returns A React Flow node `extent` tuple
 */
export function boundaryArea(boundary: {
  width: number
  height: number
}): [[number, number], [number, number]] {
  return [
    [0, 0],
    [boundary.width, boundary.height],
  ]
}

/**
 * Computes the `extent` that clamps a student node to the boundary plus a
 * CANVAS_PADDING margin, allowing a student to float near but not indefinitely
 * far from the boundary.
 * @param boundary - Boundary dimensions to clamp against
 * @returns A React Flow node `extent` tuple
 */
export function canvasExtent(boundary: {
  width: number
  height: number
}): [[number, number], [number, number]] {
  return [
    [-CANVAS_PADDING, -CANVAS_PADDING],
    [boundary.width + CANVAS_PADDING, boundary.height + CANVAS_PADDING],
  ]
}

/**
 * Reads the current boundary dimensions from a node list.
 * @param nodes - List of seating chart nodes
 * @returns The boundary node's dimensions
 */
export function getBoundary(nodes: SeatingChartNode[]): {
  width: number
  height: number
} {
  const boundaryNode = nodes.find(
    (n): n is SeatingChartBoundaryNode => n.type === "boundary"
  )
  if (!boundaryNode) {
    throw new Error("Seating chart nodes are missing a boundary node")
  }
  return boundaryNode.data
}

/**
 * Builds the initial state of the boundary, table, seat, and student nodes
 * @param classroomId - Id of the classroom the chart belongs to
 * @param seatingChart - Seating chart persisted state
 * @param studentsById - Map of students keyed by their id
 * @returns Initial seating chart canvas nodes, grouped boundary -> table -> seat -> student
 */
export function buildInitialNodes(
  classroomId: string,
  seatingChart: SeatingChart,
  studentsById: Map<string, Student>
): SeatingChartNode[] {
  const boundary = {
    width: seatingChart.boundary_width,
    height: seatingChart.boundary_height,
  }
  const nodes: SeatingChartNode[] = [
    buildBoundaryNode(boundary.width, boundary.height),
  ]

  for (const table of seatingChart.tables) {
    const tableId = `${classroomId}:${table.table_number}`

    const tableNode: SeatingChartTableNode = {
      id: tableId,
      type: "table",
      position: { x: table.x_pos, y: table.y_pos },
      deletable: false,
      extent: boundaryArea(boundary),
      data: {
        table_number: table.table_number,
        rows: table.rows,
        cols: table.cols,
      },
    }
    nodes.push(tableNode)

    for (let row = 0; row < table.rows; row++) {
      for (let col = 0; col < table.cols; col++) {
        const seatId = getSeatId(tableId, row, col)
        const seatNode: SeatingChartSeatNode = {
          id: seatId,
          type: "seat",
          position: getSeatPosition(row, col),
          parentId: tableId,
          draggable: false,
          selectable: false,
          deletable: false,
          data: { row, col },
        }
        nodes.push(seatNode)

        const seatIndex = row * table.cols + col
        const studentId = table.seat_assignments[seatIndex] ?? null
        if (!studentId) {
          continue
        }
        const student = studentsById.get(studentId)
        if (!student) {
          console.warn(
            "Invalid seat assignment: could not find student with id: %s",
            studentId
          )
          continue
        }

        const studentNode: SeatingChartStudentNode = {
          id: studentId,
          type: "student",
          position: { x: 0, y: 0 },
          parentId: seatId,
          deletable: false,
          extent: canvasExtent(boundary),
          data: { student },
        }
        nodes.push(studentNode)
      }
    }
  }

  return nodes
}

/**
 * Reorders nodes into boundary -> table -> seat -> student order (parents before children).
 * @param nodes - Unordered list of seating chart nodes
 * @returns List of nodes in the order boundary -> table -> seat -> student
 */
export function reorderNodes(nodes: SeatingChartNode[]): SeatingChartNode[] {
  return [
    ...nodes.filter((n) => n.type === "boundary"),
    ...nodes.filter((n) => n.type === "table"),
    ...nodes.filter((n) => n.type === "seat"),
    ...nodes.filter((n) => n.type === "student"),
  ]
}

/**
 * Converts canvas nodes back into a seating chart API payload.
 * @param nodes - List of table, seat, and student nodes
 * @returns Body payload to be used to call seating chart API
 */
export function buildSeatingChartPayload(
  nodes: SeatingChartNode[]
): SeatingChart {
  const tableNodes = nodes.filter(
    (n): n is SeatingChartTableNode => n.type === "table"
  )
  const seatNodes = nodes.filter(
    (n): n is SeatingChartSeatNode => n.type === "seat"
  )
  const studentNodes = nodes.filter(
    (n): n is SeatingChartStudentNode => n.type === "student"
  )
  const studentBySeatId = new Map(
    studentNodes
      .filter((student) => student.parentId)
      .map((student) => [student.parentId, student])
  )
  const boundary = getBoundary(nodes)

  return {
    boundary_width: boundary.width,
    boundary_height: boundary.height,
    tables: tableNodes.map((table, idx) => {
      const seats = seatNodes
        .filter((seat) => seat.parentId === table.id)
        .sort((a, b) => a.data.row - b.data.row || a.data.col - b.data.col)
      const seat_assignments = seats.map(
        (seat) => studentBySeatId.get(seat.id)?.id ?? null
      )

      return {
        table_number: idx,
        rows: table.data.rows,
        cols: table.data.cols,
        x_pos: table.position.x,
        y_pos: table.position.y,
        seat_assignments,
      }
    }),
  }
}

/**
 * Gets the list of students that aren't currently on the seating chart canvas
 * @param students - List of students
 * @param nodes - List of seating chart nodes
 * @returns List of unassigned students
 */
export function getUnassignedStudents(
  students: Student[],
  nodes: SeatingChartNode[]
): Student[] {
  const studentsOnCanvas = new Set(
    nodes.filter((n) => n.type === "student").map((n) => n.id)
  )
  return students.filter((s) => !studentsOnCanvas.has(s.id))
}

export type TableGeometry = {
  rows: number
  cols: number
  x_pos: number
  y_pos: number
}

/**
 * Extracts each table's current geometry from canvas nodes.
 * @param nodes - List of seating chart nodes
 * @returns One entry per table node, in node order
 */
export function getTableGeometry(nodes: SeatingChartNode[]): TableGeometry[] {
  return nodes
    .filter((n): n is SeatingChartTableNode => n.type === "table")
    .map((table) => ({
      rows: table.data.rows,
      cols: table.data.cols,
      x_pos: table.position.x,
      y_pos: table.position.y,
    }))
}

export const MIN_BOUNDARY_SIZE =
  2 * TABLE_OFFSET +
  getTableNodeSize(DEFAULT_TABLE_ROWS, DEFAULT_TABLE_COLS).width

/**
 * Checks whether two axis-aligned rectangles overlap.
 * @param aPos - First rectangle's top-left position
 * @param aSize - First rectangle's dimensions
 * @param bPos - Second rectangle's top-left position
 * @param bSize - Second rectangle's dimensions
 * @returns Whether the rectangles overlap
 */
export function overlaps(
  aPos: Point,
  aSize: { width: number; height: number },
  bPos: Point,
  bSize: { width: number; height: number }
): boolean {
  return (
    aPos.x < bPos.x + bSize.width &&
    aPos.x + aSize.width > bPos.x &&
    aPos.y < bPos.y + bSize.height &&
    aPos.y + aSize.height > bPos.y
  )
}

/**
 * Finds the first open, in-boundary spot for a new table via a row-major
 * grid-step scan, or `null` if none exists.
 * @param boundary - Current boundary dimensions
 * @param existingTables - Geometry of tables already on the canvas
 * @param newTableRows - Row count for the new table
 * @param newTableCols - Column count for the new table
 * @returns The new table's position, or `null` if no space is available
 */
export function findNewTablePosition(
  boundary: { width: number; height: number },
  existingTables: TableGeometry[],
  newTableRows: number,
  newTableCols: number
): Point | null {
  const { width: tableWidth, height: tableHeight } = getTableNodeSize(
    newTableRows,
    newTableCols
  )
  for (
    let y = TABLE_OFFSET;
    y <= boundary.height - TABLE_OFFSET - tableHeight;
    y += GRID_STEP
  ) {
    for (
      let x = TABLE_OFFSET;
      x <= boundary.width - TABLE_OFFSET - tableWidth;
      x += GRID_STEP
    ) {
      const pos = { x, y }
      const marginPos = { x: x - TABLE_GAP, y: y - TABLE_GAP }
      const marginSize = {
        width: tableWidth + 2 * TABLE_GAP,
        height: tableHeight + 2 * TABLE_GAP,
      }
      const collides = existingTables.some((t) =>
        overlaps(
          marginPos,
          marginSize,
          { x: t.x_pos, y: t.y_pos },
          getTableNodeSize(t.rows, t.cols)
        )
      )
      if (!collides) {
        return pos
      }
    }
  }
  return null
}

/**
 * Computes the smallest boundary that still fits existing tables.
 * @param existingTables - Geometry of tables already on the canvas
 * @returns The minimum `{ width, height }` the boundary can be shrunk to
 */
export function getBoundaryMinSize(existingTables: TableGeometry[]): {
  width: number
  height: number
} {
  let maxExtentX = 0
  let maxExtentY = 0
  for (const t of existingTables) {
    const size = getTableNodeSize(t.rows, t.cols)
    maxExtentX = Math.max(maxExtentX, t.x_pos + size.width)
    maxExtentY = Math.max(maxExtentY, t.y_pos + size.height)
  }
  return {
    width: Math.max(MIN_BOUNDARY_SIZE, maxExtentX + TABLE_OFFSET),
    height: Math.max(MIN_BOUNDARY_SIZE, maxExtentY + TABLE_OFFSET),
  }
}

export const RANDOMIZE_TABLE_COUNT_WARNING_THRESHOLD = 20

/**
 * Computes how many new tables a randomize request would create.
 * @param numStudents - Number of students to seat
 * @param numExistingTables - Number of tables being retained
 * @param numExistingSeats - Total seats across kept tables
 * @param newTableRows - Row count for each new table
 * @param newTableCols - Column count for each new table
 * @returns The number of new tables needed and the resulting total table count
 */
export function computeRandomizeTableCount(
  numStudents: number,
  numExistingTables: number,
  numExistingSeats: number,
  newTableRows: number,
  newTableCols: number
): { neededNewTables: number; totalTables: number } {
  const seatsPerNewTable = newTableRows * newTableCols
  const neededNewTables =
    seatsPerNewTable > 0
      ? Math.ceil(
          Math.max(0, numStudents - numExistingSeats) / seatsPerNewTable
        )
      : 0
  return { neededNewTables, totalTables: numExistingTables + neededNewTables }
}

export type ColdCallProbability = { student: Student; probability: number }

/**
 * Estimates each student's chance of being picked next from their current
 * cold-call weights, sorted most to least likely.
 * @param students - Students to include in the estimate
 * @param weights - Current cold-call weight per student id
 * @returns One entry per student, descending by probability
 */
export function computeColdCallProbabilities(
  students: Student[],
  weights: Record<string, number>
): ColdCallProbability[] {
  const totalWeight = students.reduce((sum, s) => sum + (weights[s.id] ?? 0), 0)
  return students
    .map((student) => ({
      student,
      probability:
        totalWeight === 0
          ? 1 / students.length
          : (weights[student.id] ?? 0) / totalWeight,
    }))
    .sort((a, b) => b.probability - a.probability)
}
