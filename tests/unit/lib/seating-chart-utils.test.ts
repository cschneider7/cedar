import { describe, expect, it, vi } from "vitest"
import type { SeatingChart, Student } from "~/lib/schemas"
import {
  BOUNDARY_NODE_ID,
  boundaryArea,
  buildBoundaryNode,
  buildInitialNodes,
  buildSeatingChartPayload,
  canvasExtent,
  computeColdCallProbabilities,
  computeRandomizeTableCount,
  createCanvasTable,
  DEFAULT_TABLE_COLS,
  DEFAULT_TABLE_ROWS,
  findNewTablePosition,
  getBoundary,
  getBoundaryMinSize,
  getSeatId,
  getSeatPosition,
  getTableGeometry,
  getTableNodeSize,
  getUnassignedStudents,
  MIN_BOUNDARY_SIZE,
  reorderNodes,
  TABLE_GAP,
  TABLE_OFFSET,
  type SeatingChartNode,
  type TableGeometry,
} from "~/lib/seating-chart-utils"

const DEFAULT_BOUNDARY = { width: 1080, height: 820 }

function makeStudent(id: string): Student {
  return { id, student_id: 1, name: id, classroom_id: "c1", image_url: null }
}

function makeSeatingChart(
  tables: Partial<SeatingChart["tables"][number]>[] = []
): SeatingChart {
  return {
    boundary_width: DEFAULT_BOUNDARY.width,
    boundary_height: DEFAULT_BOUNDARY.height,
    tables: tables.map((table, index) => ({
      table_number: index,
      rows: DEFAULT_TABLE_ROWS,
      cols: DEFAULT_TABLE_COLS,
      x_pos: 0,
      y_pos: 0,
      seat_assignments: [null, null, null, null],
      ...table,
    })),
  }
}

describe("createCanvasTable", () => {
  it("defaults to a 2x2 grid of seats", () => {
    const table = createCanvasTable({ x: TABLE_OFFSET, y: TABLE_OFFSET })

    expect(table.rows).toBe(DEFAULT_TABLE_ROWS)
    expect(table.cols).toBe(DEFAULT_TABLE_COLS)
    expect(table.seats).toHaveLength(DEFAULT_TABLE_ROWS * DEFAULT_TABLE_COLS)
  })

  it("places the table at the given position", () => {
    const table = createCanvasTable({ x: 100, y: 200 })

    expect(table.x_pos).toBe(100)
    expect(table.y_pos).toBe(200)
  })
})

describe("getSeatId", () => {
  it("combines the table id and the seat's row/col", () => {
    expect(getSeatId("a", 1, 2)).toBe("a:1:2")
  })
})

describe("buildInitialNodes", () => {
  it("returns just the boundary node when there are no tables", () => {
    expect(buildInitialNodes("c1", makeSeatingChart([]), new Map())).toEqual([
      buildBoundaryNode(DEFAULT_BOUNDARY.width, DEFAULT_BOUNDARY.height),
    ])
  })

  it("builds the boundary node from the seating chart's boundary dimensions", () => {
    const seatingChart = makeSeatingChart([])
    seatingChart.boundary_width = 500
    seatingChart.boundary_height = 700
    const nodes = buildInitialNodes("c1", seatingChart, new Map())

    expect(nodes[0]).toEqual(buildBoundaryNode(500, 700))
    expect(nodes[0].id).toBe(BOUNDARY_NODE_ID)
  })

  it("creates a table node followed by its seat nodes, in row-major canonical order", () => {
    const seatingChart = makeSeatingChart([{ x_pos: 40, y_pos: 60 }])
    const nodes = buildInitialNodes("c1", seatingChart, new Map())

    expect(nodes).toHaveLength(1 + 1 + DEFAULT_TABLE_ROWS * DEFAULT_TABLE_COLS)
    expect(nodes[1]).toEqual({
      id: "c1:0",
      type: "table",
      position: { x: 40, y: 60 },
      deletable: false,
      extent: boundaryArea(DEFAULT_BOUNDARY),
      data: {
        table_number: 0,
        rows: DEFAULT_TABLE_ROWS,
        cols: DEFAULT_TABLE_COLS,
      },
    })

    let i = 2
    for (let row = 0; row < DEFAULT_TABLE_ROWS; row++) {
      for (let col = 0; col < DEFAULT_TABLE_COLS; col++) {
        expect(nodes[i]).toEqual({
          id: getSeatId("c1:0", row, col),
          type: "seat",
          position: getSeatPosition(row, col),
          parentId: "c1:0",
          draggable: false,
          selectable: false,
          deletable: false,
          data: { row, col },
        })
        i++
      }
    }
  })

  it("pushes an assigned student node right after its seat, parented to it", () => {
    const student = makeStudent("s1")
    const seatingChart = makeSeatingChart([
      { seat_assignments: [null, "s1", null, null] },
    ])
    const nodes = buildInitialNodes(
      "c1",
      seatingChart,
      new Map([["s1", student]])
    )

    // 2x2, row-major: index 1 is row 0, col 1.
    const seatId = getSeatId("c1:0", 0, 1)
    const studentNode = nodes.find((n) => n.id === "s1")

    expect(studentNode).toEqual({
      id: "s1",
      type: "student",
      position: { x: 0, y: 0 },
      parentId: seatId,
      deletable: false,
      extent: canvasExtent(DEFAULT_BOUNDARY),
      data: { student },
    })
    expect(nodes.findIndex((n) => n.id === seatId)).toBeLessThan(
      nodes.findIndex((n) => n.id === "s1")
    )
  })

  it("warns and skips an assignment referencing an unknown student, still creating the seat", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const seatingChart = makeSeatingChart([
      { seat_assignments: ["ghost", null, null, null] },
    ])
    const nodes = buildInitialNodes("c1", seatingChart, new Map())

    expect(nodes.some((n) => n.type === "student")).toBe(false)
    expect(nodes.some((n) => n.id === getSeatId("c1:0", 0, 0))).toBe(true)
    expect(warn).toHaveBeenCalled()

    warn.mockRestore()
  })

  it("keeps every table ahead of its own seats across multiple tables", () => {
    const seatingChart = makeSeatingChart([{}, {}])
    const nodes = buildInitialNodes("c1", seatingChart, new Map())

    const tableAIndex = nodes.findIndex((n) => n.id === "c1:0")
    const tableBIndex = nodes.findIndex((n) => n.id === "c1:1")
    const seatOfAIndex = nodes.findIndex(
      (n) => n.id === getSeatId("c1:0", 0, 0)
    )
    const seatOfBIndex = nodes.findIndex(
      (n) => n.id === getSeatId("c1:1", 0, 0)
    )

    expect(tableAIndex).toBeLessThan(seatOfAIndex)
    expect(tableBIndex).toBeLessThan(seatOfBIndex)
  })

  it("supports a non-square grid, reading seat_assignments in row-major order", () => {
    const seatingChart = makeSeatingChart([
      {
        rows: 2,
        cols: 3,
        seat_assignments: [null, null, null, null, null, null],
      },
    ])
    const nodes = buildInitialNodes("c1", seatingChart, new Map())

    expect(nodes).toHaveLength(1 + 1 + 6)
    expect(nodes.some((n) => n.id === getSeatId("c1:0", 1, 2))).toBe(true)
  })
})

describe("buildSeatingChartPayload", () => {
  it("throws when the node list has no boundary node", () => {
    expect(() => buildSeatingChartPayload([])).toThrow()
  })

  it("returns no tables when there are no table nodes", () => {
    const nodes = [
      buildBoundaryNode(DEFAULT_BOUNDARY.width, DEFAULT_BOUNDARY.height),
    ]
    expect(buildSeatingChartPayload(nodes)).toEqual({
      boundary_width: DEFAULT_BOUNDARY.width,
      boundary_height: DEFAULT_BOUNDARY.height,
      tables: [],
    })
  })

  it("includes the boundary node's dimensions in the payload", () => {
    const nodes = [buildBoundaryNode(500, 700)]
    const payload = buildSeatingChartPayload(nodes)

    expect(payload.boundary_width).toBe(500)
    expect(payload.boundary_height).toBe(700)
  })

  it("fills seat_assignments with null for an unoccupied table", () => {
    const nodes = buildInitialNodes("c1", makeSeatingChart([{}]), new Map())
    const payload = buildSeatingChartPayload(nodes)

    expect(payload).toEqual({
      boundary_width: DEFAULT_BOUNDARY.width,
      boundary_height: DEFAULT_BOUNDARY.height,
      tables: [
        {
          table_number: 0,
          rows: DEFAULT_TABLE_ROWS,
          cols: DEFAULT_TABLE_COLS,
          x_pos: 0,
          y_pos: 0,
          seat_assignments: [null, null, null, null],
        },
      ],
    })
  })

  it("derives seat_assignments from parentId chains regardless of node array order", () => {
    const student = makeStudent("s1")
    const tableNode: SeatingChartNode = {
      id: "a",
      type: "table",
      position: { x: 0, y: 0 },
      deletable: false,
      data: { table_number: 0, rows: 2, cols: 2 },
    }
    const seatNodes: SeatingChartNode[] = []
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) {
        seatNodes.push({
          id: getSeatId("a", row, col),
          type: "seat",
          position: { x: 0, y: 0 },
          parentId: "a",
          draggable: false,
          selectable: false,
          deletable: false,
          data: { row, col },
        })
      }
    }
    const studentNode: SeatingChartNode = {
      id: "s1",
      type: "student",
      position: { x: 0, y: 0 },
      parentId: getSeatId("a", 1, 0),
      deletable: false,
      data: { student },
    }

    // Deliberately out of parent-before-child order.
    const payload = buildSeatingChartPayload([
      studentNode,
      tableNode,
      ...seatNodes,
      buildBoundaryNode(DEFAULT_BOUNDARY.width, DEFAULT_BOUNDARY.height),
    ])

    expect(payload.tables[0].seat_assignments).toEqual([null, null, "s1", null])
  })

  it("round-trips through buildInitialNodes", () => {
    const student = makeStudent("s1")
    const seatingChart = makeSeatingChart([
      { x_pos: 40, y_pos: 60, seat_assignments: [null, null, "s1", null] },
    ])
    const nodes = buildInitialNodes(
      "c1",
      seatingChart,
      new Map([["s1", student]])
    )
    const payload = buildSeatingChartPayload(nodes)

    expect(payload.tables[0].x_pos).toBe(40)
    expect(payload.tables[0].y_pos).toBe(60)
    expect(payload.tables[0].seat_assignments).toEqual([null, null, "s1", null])
  })

  it("round-trips a non-square grid, preserving rows/cols and seat order", () => {
    const student = makeStudent("s1")
    const seatingChart = makeSeatingChart([
      {
        rows: 2,
        cols: 3,
        seat_assignments: [null, null, null, null, "s1", null],
      },
    ])
    const nodes = buildInitialNodes(
      "c1",
      seatingChart,
      new Map([["s1", student]])
    )
    const payload = buildSeatingChartPayload(nodes)

    expect(payload.tables[0].rows).toBe(2)
    expect(payload.tables[0].cols).toBe(3)
    expect(payload.tables[0].seat_assignments).toEqual([
      null,
      null,
      null,
      null,
      "s1",
      null,
    ])
  })
})

describe("reorderNodes", () => {
  it("keeps a boundary node first, ahead of table/seat/student nodes", () => {
    const boundary = buildBoundaryNode(
      DEFAULT_BOUNDARY.width,
      DEFAULT_BOUNDARY.height
    )
    const table: SeatingChartNode = {
      id: "t",
      type: "table",
      position: { x: 0, y: 0 },
      deletable: false,
      data: { table_number: 0, rows: 2, cols: 2 },
    }

    const result = reorderNodes([table, boundary])

    expect(result).toEqual([boundary, table])
  })

  it("reorders a mix of nodes into table, then seat, then student", () => {
    const table: SeatingChartNode = {
      id: "t",
      type: "table",
      position: { x: 0, y: 0 },
      deletable: false,
      data: { table_number: 0, rows: 2, cols: 2 },
    }
    const seat: SeatingChartNode = {
      id: "s",
      type: "seat",
      position: { x: 0, y: 0 },
      parentId: "t",
      draggable: false,
      selectable: false,
      deletable: false,
      data: { row: 0, col: 0 },
    }
    const student: SeatingChartNode = {
      id: "st",
      type: "student",
      position: { x: 0, y: 0 },
      parentId: "s",
      deletable: false,
      data: { student: makeStudent("st") },
    }

    // Deliberately out of parent-before-child order.
    const result = reorderNodes([student, seat, table])

    expect(result).toEqual([table, seat, student])
  })

  it("preserves relative order within each group", () => {
    const tableA: SeatingChartNode = {
      id: "ta",
      type: "table",
      position: { x: 0, y: 0 },
      deletable: false,
      data: { table_number: 0, rows: 2, cols: 2 },
    }
    const tableB: SeatingChartNode = {
      id: "tb",
      type: "table",
      position: { x: 0, y: 0 },
      deletable: false,
      data: { table_number: 1, rows: 2, cols: 2 },
    }

    const result = reorderNodes([tableB, tableA])

    expect(result).toEqual([tableB, tableA])
  })
})

describe("getBoundary", () => {
  it("returns the boundary node's dimensions", () => {
    const nodes = [buildBoundaryNode(500, 700)]
    expect(getBoundary(nodes)).toEqual({ width: 500, height: 700 })
  })

  it("throws when no boundary node is present", () => {
    expect(() => getBoundary([])).toThrow()
  })
})

describe("boundaryArea", () => {
  it("clamps to [[0, 0], [width, height]]", () => {
    expect(boundaryArea({ width: 500, height: 700 })).toEqual([
      [0, 0],
      [500, 700],
    ])
  })
})

describe("getUnassignedStudents", () => {
  const students = [makeStudent("s1"), makeStudent("s2"), makeStudent("s3")]

  it("returns everyone when no students are on the canvas", () => {
    expect(getUnassignedStudents(students, [])).toEqual(students)
  })

  it("excludes a seated student", () => {
    const nodes: SeatingChartNode[] = [
      {
        id: "s2",
        type: "student",
        position: { x: 0, y: 0 },
        parentId: "seat-1",
        deletable: false,
        data: { student: makeStudent("s2") },
      },
    ]

    expect(getUnassignedStudents(students, nodes).map((s) => s.id)).toEqual([
      "s1",
      "s3",
    ])
  })

  it("excludes a free (unseated) student on the canvas", () => {
    const nodes: SeatingChartNode[] = [
      {
        id: "s3",
        type: "student",
        position: { x: 40, y: 40 },
        deletable: false,
        data: { student: makeStudent("s3") },
      },
    ]

    expect(getUnassignedStudents(students, nodes).map((s) => s.id)).toEqual([
      "s1",
      "s2",
    ])
  })
})

describe("getTableGeometry", () => {
  it("returns no entries when there are no nodes", () => {
    expect(getTableGeometry([])).toEqual([])
  })

  it("extracts rows/cols/position for each table node, ignoring seat and student nodes", () => {
    const nodes = buildInitialNodes(
      "c1",
      makeSeatingChart([
        { rows: 2, cols: 3, x_pos: 40, y_pos: 60 },
        { rows: 1, cols: 1, x_pos: 300, y_pos: 60, seat_assignments: [null] },
      ]),
      new Map()
    )

    expect(getTableGeometry(nodes)).toEqual([
      { rows: 2, cols: 3, x_pos: 40, y_pos: 60 },
      { rows: 1, cols: 1, x_pos: 300, y_pos: 60 },
    ])
  })
})

describe("findNewTablePosition", () => {
  const boundary = { width: 1080, height: 820 }

  it("fits at the top-left grid offset when there are no existing tables", () => {
    expect(
      findNewTablePosition(boundary, [], DEFAULT_TABLE_ROWS, DEFAULT_TABLE_COLS)
    ).toEqual({
      x: TABLE_OFFSET,
      y: TABLE_OFFSET,
    })
  })

  it("skips an occupied first slot and returns the next open one, row-major", () => {
    const size = { rows: DEFAULT_TABLE_ROWS, cols: DEFAULT_TABLE_COLS }
    const occupied: TableGeometry = {
      ...size,
      x_pos: TABLE_OFFSET,
      y_pos: TABLE_OFFSET,
    }

    const slot = findNewTablePosition(
      boundary,
      [occupied],
      DEFAULT_TABLE_ROWS,
      DEFAULT_TABLE_COLS
    )

    expect(slot).not.toBeNull()
    expect(slot).not.toEqual({ x: TABLE_OFFSET, y: TABLE_OFFSET })
    expect(slot!.y).toBe(TABLE_OFFSET)
    expect(slot!.x).toBeGreaterThan(TABLE_OFFSET)
  })

  it("returns null when the boundary is completely full", () => {
    const tiny = { width: MIN_BOUNDARY_SIZE, height: MIN_BOUNDARY_SIZE }
    const existing: TableGeometry = {
      rows: DEFAULT_TABLE_ROWS,
      cols: DEFAULT_TABLE_COLS,
      x_pos: TABLE_OFFSET,
      y_pos: TABLE_OFFSET,
    }

    expect(
      findNewTablePosition(
        tiny,
        [existing],
        DEFAULT_TABLE_ROWS,
        DEFAULT_TABLE_COLS
      )
    ).toBeNull()
  })

  it("leaves at least TABLE_GAP between a new table and an existing one", () => {
    const size = getTableNodeSize(DEFAULT_TABLE_ROWS, DEFAULT_TABLE_COLS)
    const existing: TableGeometry = {
      rows: DEFAULT_TABLE_ROWS,
      cols: DEFAULT_TABLE_COLS,
      x_pos: TABLE_OFFSET,
      y_pos: TABLE_OFFSET,
    }

    const slot = findNewTablePosition(
      boundary,
      [existing],
      DEFAULT_TABLE_ROWS,
      DEFAULT_TABLE_COLS
    )

    expect(slot).not.toBeNull()
    const xGap =
      slot!.x >= existing.x_pos
        ? slot!.x - (existing.x_pos + size.width)
        : existing.x_pos - (slot!.x + size.width)
    const yGap =
      slot!.y >= existing.y_pos
        ? slot!.y - (existing.y_pos + size.height)
        : existing.y_pos - (slot!.y + size.height)
    expect(xGap >= TABLE_GAP || yGap >= TABLE_GAP).toBe(true)
  })
})

describe("getBoundaryMinSize", () => {
  it("returns MIN_BOUNDARY_SIZE for an empty table list", () => {
    expect(getBoundaryMinSize([])).toEqual({
      width: MIN_BOUNDARY_SIZE,
      height: MIN_BOUNDARY_SIZE,
    })
  })

  it("grows past MIN_BOUNDARY_SIZE when a table sits far from the origin", () => {
    const farTable: TableGeometry = {
      rows: DEFAULT_TABLE_ROWS,
      cols: DEFAULT_TABLE_COLS,
      x_pos: 2000,
      y_pos: 3000,
    }

    const min = getBoundaryMinSize([farTable])

    expect(min.width).toBeGreaterThan(MIN_BOUNDARY_SIZE)
    expect(min.height).toBeGreaterThan(MIN_BOUNDARY_SIZE)
  })
})

describe("computeRandomizeTableCount", () => {
  it("needs no new tables when there are no students", () => {
    expect(computeRandomizeTableCount(0, 2, 8, 2, 2)).toEqual({
      neededNewTables: 0,
      totalTables: 2,
    })
  })

  it("needs no new tables when kept capacity already covers every student", () => {
    expect(computeRandomizeTableCount(8, 2, 8, 2, 2)).toEqual({
      neededNewTables: 0,
      totalTables: 2,
    })
  })

  it("computes an exact multiple of new tables when the deficit divides evenly", () => {
    expect(computeRandomizeTableCount(8, 0, 0, 2, 2)).toEqual({
      neededNewTables: 2,
      totalTables: 2,
    })
  })

  it("rounds a remainder deficit up rather than down", () => {
    // 9 students, 0 kept capacity, 2x2 tables -> ceil(9/4) = 3, not 2.
    expect(computeRandomizeTableCount(9, 0, 0, 2, 2)).toEqual({
      neededNewTables: 3,
      totalTables: 3,
    })
  })

  it("folds keptTableCount into totalTables alongside the new tables", () => {
    // 9 students, 4 kept capacity -> deficit 5, ceil(5/4) = 2 new tables.
    expect(computeRandomizeTableCount(9, 1, 4, 2, 2)).toEqual({
      neededNewTables: 2,
      totalTables: 3,
    })
  })
})

describe("computeColdCallProbabilities", () => {
  it("weights probability proportionally and sums to 1", () => {
    const students = [makeStudent("s1"), makeStudent("s2"), makeStudent("s3")]
    const result = computeColdCallProbabilities(students, {
      s1: 50,
      s2: 30,
      s3: 20,
    })

    expect(result.map((r) => r.probability)).toEqual([0.5, 0.3, 0.2])
    expect(result.reduce((sum, r) => sum + r.probability, 0)).toBeCloseTo(1)
  })

  it("sorts descending by probability", () => {
    const students = [makeStudent("s1"), makeStudent("s2"), makeStudent("s3")]
    const result = computeColdCallProbabilities(students, {
      s1: 10,
      s2: 70,
      s3: 20,
    })

    expect(result.map((r) => r.student.id)).toEqual(["s2", "s3", "s1"])
  })

  it("falls back to a uniform split when every weight is 0", () => {
    const students = [makeStudent("s1"), makeStudent("s2"), makeStudent("s3")]
    const result = computeColdCallProbabilities(students, {
      s1: 0,
      s2: 0,
      s3: 0,
    })

    expect(result.map((r) => r.probability)).toEqual([1 / 3, 1 / 3, 1 / 3])
  })

  it("gives a single student a probability of 1", () => {
    const students = [makeStudent("s1")]
    const result = computeColdCallProbabilities(students, { s1: 42 })

    expect(result).toEqual([{ student: students[0], probability: 1 }])
  })
})
