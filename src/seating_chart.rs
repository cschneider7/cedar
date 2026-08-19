use rand::seq::SliceRandom;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::schema::{SeatingPreference, TableSchema};

/// Maximum allowed value for a table's `rows` or `cols`.
pub const MAX_TABLE_DIMENSION: i16 = 15;
const GRID_STEP: i32 = 20;
const TABLE_OFFSET: i32 = GRID_STEP * 2; // 40
const TABLE_GAP: i32 = GRID_STEP; // minimum space left between two packed tables
const SEAT_PADDING: i32 = 10;
const SEAT_NODE_SIZE: i32 = 90;

/// Errors that can occur while proposing a randomized seating chart.
#[derive(Debug)]
pub enum SeatingChartError {
    /// The boundary has no room left to place all the needed new tables.
    NotEnoughRoom,
}

/// A table's grid shape and canvas position, used to describe a classroom's
/// existing tables when proposing a randomized chart.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TableGeometry {
    pub rows: i16,
    pub cols: i16,
    pub x_pos: i32,
    pub y_pos: i32,
}

/// Converts a table's grid shape into its full pixel footprint (width, height).
fn table_pixel_size(rows: i16, cols: i16) -> (i32, i32) {
    let row_pixels = (rows as i32) * (SEAT_NODE_SIZE + SEAT_PADDING) + SEAT_PADDING;
    let col_pixels = (cols as i32) * (SEAT_NODE_SIZE + SEAT_PADDING) + SEAT_PADDING;
    (row_pixels, col_pixels)
}

/// Reports whether two axis-aligned rectangles, each given as a
/// position/size pair, overlap.
fn overlaps(a_pos: (i32, i32), a_size: (i32, i32), b_pos: (i32, i32), b_size: (i32, i32)) -> bool {
    a_pos.0 < b_pos.0 + b_size.0
        && a_pos.0 + a_size.0 > b_pos.0
        && a_pos.1 < b_pos.1 + b_size.1
        && a_pos.1 + a_size.1 > b_pos.1
}

/// Finds the first open, in-boundary spot for a new table via a row-major
/// grid-step scan, or `None` if none exists.
fn find_new_table_position(
    boundary_width: i32,
    boundary_height: i32,
    existing: &[TableSchema],
    rows: i16,
    cols: i16,
) -> Option<(i32, i32)> {
    let table_size = table_pixel_size(rows, cols);
    let mut y = TABLE_OFFSET;
    while y <= boundary_height - TABLE_OFFSET - table_size.1 {
        let mut x = TABLE_OFFSET;
        while x <= boundary_width - TABLE_OFFSET - table_size.0 {
            let pos = (x, y);
            let collides = existing.iter().any(|t| {
                overlaps(
                    (pos.0 - TABLE_GAP, pos.1 - TABLE_GAP),
                    (table_size.0 + 2 * TABLE_GAP, table_size.1 + 2 * TABLE_GAP),
                    (t.x_pos, t.y_pos),
                    table_pixel_size(t.rows, t.cols),
                )
            });
            if !collides {
                return Some(pos);
            }
            x += GRID_STEP;
        }
        y += GRID_STEP;
    }
    None
}

/// Builds an unoccupied table of the given shape and position, with every
/// seat assignment set to `None`.
fn create_empty_table(rows: i16, cols: i16, x_pos: i32, y_pos: i32) -> TableSchema {
    TableSchema {
        table_number: 0, // corrected once the final table order is known
        rows,
        cols,
        x_pos,
        y_pos,
        seat_assignments: vec![None; rows as usize * cols as usize],
    }
}

/// Builds a proposed seating chart: kept tables augmented with just enough
/// new tables to seat every student, then students shuffled in at random.
/// Errors if the boundary can't fit all the needed new tables.
pub fn build_randomized_chart(
    students: Vec<(Uuid, Option<SeatingPreference>)>,
    keep_existing_tables: bool,
    existing_tables: Vec<TableGeometry>,
    new_table_rows: i16,
    new_table_cols: i16,
    boundary_width: i32,
    boundary_height: i32,
) -> Result<Vec<TableSchema>, SeatingChartError> {
    let mut table_pool: Vec<TableSchema> = if keep_existing_tables {
        existing_tables
            .iter()
            .map(|t| create_empty_table(t.rows, t.cols, t.x_pos, t.y_pos))
            .collect()
    } else {
        Vec::new()
    };

    let kept_capacity: i64 = table_pool
        .iter()
        .map(|t| t.rows as i64 * t.cols as i64)
        .sum();

    let seats_per_new_table = new_table_rows as i64 * new_table_cols as i64;
    let deficit = students.len() as i64 - kept_capacity;
    let needed_new_tables = if deficit > 0 && seats_per_new_table > 0 {
        (deficit + seats_per_new_table - 1) / seats_per_new_table
    } else {
        0
    };

    for _ in 0..needed_new_tables {
        let (x_pos, y_pos) = find_new_table_position(
            boundary_width,
            boundary_height,
            &table_pool,
            new_table_rows,
            new_table_cols,
        )
        .ok_or(SeatingChartError::NotEnoughRoom)?;
        table_pool.push(create_empty_table(
            new_table_rows,
            new_table_cols,
            x_pos,
            y_pos,
        ));
    }

    struct SeatRef {
        table_index: usize,
        seat_index: usize,
        seat_y: i32,
    }

    // Step 1: compute each seat's absolute canvas y (row-major, matching
    // getSeatPosition in app/lib/seating-chart-utils.ts).
    let mut seats: Vec<SeatRef> = Vec::new();
    for (table_index, table) in table_pool.iter().enumerate() {
        let cols = table.cols as usize;
        for seat_index in 0..table.seat_assignments.len() {
            let row = (seat_index / cols) as i32;
            let seat_y = table.y_pos + SEAT_PADDING + row * (SEAT_NODE_SIZE + SEAT_PADDING);
            seats.push(SeatRef {
                table_index,
                seat_index,
                seat_y,
            });
        }
    }

    // Step 2: partition students by preference, shuffle each group independently.
    let mut front_students: Vec<Uuid> = Vec::new();
    let mut back_students: Vec<Uuid> = Vec::new();
    let mut none_students: Vec<Uuid> = Vec::new();
    for (id, pref) in students {
        match pref {
            Some(SeatingPreference::Front) => front_students.push(id),
            Some(SeatingPreference::Back) => back_students.push(id),
            None => none_students.push(id),
        }
    }
    let mut rng = rand::rng();
    front_students.shuffle(&mut rng);
    back_students.shuffle(&mut rng);
    none_students.shuffle(&mut rng);

    // Step 3: shuffle first (randomizes ties on seat_y), then stable-sort ascending.
    seats.shuffle(&mut rng);
    seats.sort_by_key(|s| s.seat_y);

    let n = seats.len();
    let front_take = front_students.len().min(n);
    let back_take = back_students.len().min(n - front_take);
    let back_start = n - back_take;

    let mut assignment: Vec<Option<Uuid>> = vec![None; n];

    // Step 4: front group -> first front_take seats in sorted order.
    for (i, id) in front_students[..front_take].iter().enumerate() {
        assignment[i] = Some(*id);
    }
    // Step 5: back group -> last back_take seats in sorted order.
    for (i, id) in back_students[..back_take].iter().enumerate() {
        assignment[back_start + i] = Some(*id);
    }
    // Step 6: everyone else (none group + front/back overflow) shuffled
    // together into whatever seats remain.
    let mut leftover: Vec<Uuid> = front_students[front_take..]
        .iter()
        .chain(back_students[back_take..].iter())
        .chain(none_students.iter())
        .copied()
        .collect();
    leftover.shuffle(&mut rng);
    let mut leftover_iter = leftover.into_iter();
    for slot in &mut assignment[front_take..back_start] {
        *slot = leftover_iter.next();
    }

    // Write assignments back into table_pool via each seat's identity.
    for (slot, seat_ref) in assignment.into_iter().zip(seats.iter()) {
        table_pool[seat_ref.table_index].seat_assignments[seat_ref.seat_index] = slot;
    }

    for (index, table) in table_pool.iter_mut().enumerate() {
        table.table_number = index as i32;
    }

    Ok(table_pool)
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::*;

    const BOUNDARY: (i32, i32) = (10_000, 10_000);

    fn students(n: usize) -> Vec<(Uuid, Option<SeatingPreference>)> {
        (0..n).map(|_| (Uuid::new_v4(), None)).collect()
    }

    fn students_with_preference(
        n: usize,
        pref: SeatingPreference,
    ) -> Vec<(Uuid, Option<SeatingPreference>)> {
        (0..n).map(|_| (Uuid::new_v4(), Some(pref))).collect()
    }

    fn student_ids(students: &[(Uuid, Option<SeatingPreference>)]) -> Vec<Uuid> {
        students.iter().map(|(id, _)| *id).collect()
    }

    fn geometry(tables: &[TableSchema]) -> Vec<(i16, i16, i32, i32)> {
        tables
            .iter()
            .map(|t| (t.rows, t.cols, t.x_pos, t.y_pos))
            .collect()
    }

    fn assigned_ids(tables: &[TableSchema]) -> Vec<Uuid> {
        tables
            .iter()
            .flat_map(|t| t.seat_assignments.iter().filter_map(|s| *s))
            .collect()
    }

    #[test]
    fn no_existing_tables_seats_every_student_exactly_once() {
        let roster = students(5);
        let tables =
            build_randomized_chart(roster.clone(), false, vec![], 2, 2, BOUNDARY.0, BOUNDARY.1)
                .unwrap();

        let capacity: usize = tables.iter().map(|t| t.seat_assignments.len()).sum();
        assert!(capacity >= roster.len());

        let assigned: HashSet<Uuid> = assigned_ids(&tables).into_iter().collect();
        assert_eq!(assigned, student_ids(&roster).into_iter().collect());
    }

    #[test]
    fn sufficient_kept_capacity_creates_no_new_tables() {
        let existing = vec![TableGeometry {
            rows: 2,
            cols: 2,
            x_pos: 40,
            y_pos: 40,
        }];
        let tables = build_randomized_chart(
            students(4),
            true,
            existing.clone(),
            2,
            2,
            BOUNDARY.0,
            BOUNDARY.1,
        )
        .unwrap();

        assert_eq!(tables.len(), 1);
        assert_eq!(
            geometry(&tables),
            vec![(
                existing[0].rows,
                existing[0].cols,
                existing[0].x_pos,
                existing[0].y_pos
            )]
        );
    }

    #[test]
    fn insufficient_capacity_creates_expected_new_table_count_with_remainder() {
        // 9 students, 2x2 (4-seat) new tables, no kept capacity -> ceil(9/4) = 3, not 2.
        let tables =
            build_randomized_chart(students(9), false, vec![], 2, 2, BOUNDARY.0, BOUNDARY.1)
                .unwrap();
        assert_eq!(tables.len(), 3);
    }

    #[test]
    fn zero_students_creates_no_new_tables_and_leaves_kept_seats_empty() {
        let existing = vec![TableGeometry {
            rows: 2,
            cols: 2,
            x_pos: 40,
            y_pos: 40,
        }];
        let tables =
            build_randomized_chart(vec![], true, existing, 2, 2, BOUNDARY.0, BOUNDARY.1).unwrap();

        assert_eq!(tables.len(), 1);
        assert!(tables[0].seat_assignments.iter().all(|s| s.is_none()));
    }

    #[test]
    fn keep_true_with_no_existing_tables_behaves_like_keep_false() {
        let with_keep =
            build_randomized_chart(students(5), true, vec![], 2, 2, BOUNDARY.0, BOUNDARY.1)
                .unwrap();
        let without_keep =
            build_randomized_chart(students(5), false, vec![], 2, 2, BOUNDARY.0, BOUNDARY.1)
                .unwrap();

        assert_eq!(geometry(&with_keep), geometry(&without_keep));
    }

    #[test]
    fn new_tables_avoid_overlapping_a_kept_table() {
        let existing = vec![TableGeometry {
            rows: 2,
            cols: 2,
            x_pos: 40,
            y_pos: 40,
        }];
        // Kept capacity 4, 5 students -> exactly one new 2x2 table needed.
        let tables =
            build_randomized_chart(students(5), true, existing, 2, 2, BOUNDARY.0, BOUNDARY.1)
                .unwrap();

        assert_eq!(tables.len(), 2);
        assert_ne!((tables[1].x_pos, tables[1].y_pos), (40, 40));
    }

    #[test]
    fn new_tables_avoid_overlapping_each_other_from_an_empty_pool() {
        // 3x3 tables (pixel size 297) are larger than the old fixed grid spacing, so
        // a naive next-slot heuristic would still overlap the first table.
        let tables =
            build_randomized_chart(students(10), false, vec![], 3, 3, BOUNDARY.0, BOUNDARY.1)
                .unwrap();

        assert_eq!(tables.len(), 2);
        assert!(!overlaps(
            (tables[0].x_pos, tables[0].y_pos),
            table_pixel_size(tables[0].rows, tables[0].cols),
            (tables[1].x_pos, tables[1].y_pos),
            table_pixel_size(tables[1].rows, tables[1].cols),
        ));
    }

    #[test]
    fn no_duplicate_assignments_across_kept_and_new_tables() {
        let existing = vec![TableGeometry {
            rows: 2,
            cols: 2,
            x_pos: 40,
            y_pos: 40,
        }];
        let roster = students(10);
        let tables =
            build_randomized_chart(roster.clone(), true, existing, 2, 2, BOUNDARY.0, BOUNDARY.1)
                .unwrap();

        let assigned = assigned_ids(&tables);
        let unique: HashSet<Uuid> = assigned.iter().copied().collect();
        assert_eq!(assigned.len(), unique.len());
        assert_eq!(unique, student_ids(&roster).into_iter().collect());
    }

    #[test]
    fn errors_when_boundary_too_small_for_needed_tables() {
        // A boundary that fits exactly one 2x2 table has no room for a second.
        let tiny_boundary = 2 * TABLE_OFFSET + table_pixel_size(2, 2).0;
        let result = build_randomized_chart(
            students(8),
            false,
            vec![],
            2,
            2,
            tiny_boundary,
            tiny_boundary,
        );

        assert!(matches!(result, Err(SeatingChartError::NotEnoughRoom)));
    }

    #[test]
    fn packs_new_tables_within_constrained_boundary_without_overlap() {
        // Boundary just big enough for a 2x2 grid of 2x2 tables (4 tables),
        // sized to the grid-aligned spacing the scan actually lands on
        // between slots (a table's edge, plus the required gap, rounded up
        // to the next GRID_STEP multiple).
        let table_size = table_pixel_size(2, 2).0;
        let spacing = (table_size + TABLE_GAP + GRID_STEP - 1) / GRID_STEP * GRID_STEP;
        let boundary = 2 * TABLE_OFFSET + spacing + table_size;
        let tables =
            build_randomized_chart(students(16), false, vec![], 2, 2, boundary, boundary).unwrap();

        assert_eq!(tables.len(), 4);
        for table in &tables {
            let size = table_pixel_size(table.rows, table.cols);
            assert!(table.x_pos >= TABLE_OFFSET);
            assert!(table.y_pos >= TABLE_OFFSET);
            assert!(table.x_pos + size.0 <= boundary - TABLE_OFFSET);
            assert!(table.y_pos + size.1 <= boundary - TABLE_OFFSET);
        }
        for i in 0..tables.len() {
            for j in (i + 1)..tables.len() {
                assert!(!overlaps(
                    (tables[i].x_pos, tables[i].y_pos),
                    table_pixel_size(tables[i].rows, tables[i].cols),
                    (tables[j].x_pos, tables[j].y_pos),
                    table_pixel_size(tables[j].rows, tables[j].cols),
                ));
            }
        }
    }

    fn seat_y_for(table: &TableSchema, seat_index: usize) -> i32 {
        let row = (seat_index / table.cols as usize) as i32;
        table.y_pos + SEAT_PADDING + row * (SEAT_NODE_SIZE + SEAT_PADDING)
    }

    /// Every `(student_id, seat_y)` pair for seats that ended up occupied,
    /// across every table in the result.
    fn assigned_seat_ys(tables: &[TableSchema]) -> Vec<(Uuid, i32)> {
        tables
            .iter()
            .flat_map(|t| {
                t.seat_assignments
                    .iter()
                    .enumerate()
                    .filter_map(move |(i, s)| s.map(|id| (id, seat_y_for(t, i))))
            })
            .collect()
    }

    #[test]
    fn front_preference_students_get_front_row_seats() {
        // 3 rows x 2 cols = 6 seats; row 0 has exactly 2 seats, matching the
        // front-preference roster size exactly so every front student must
        // land in the lowest seat_y row.
        let existing = vec![TableGeometry {
            rows: 3,
            cols: 2,
            x_pos: 40,
            y_pos: 40,
        }];
        let front = students_with_preference(2, SeatingPreference::Front);
        let front_ids: HashSet<Uuid> = student_ids(&front).into_iter().collect();
        let tables =
            build_randomized_chart(front, true, existing, 2, 2, BOUNDARY.0, BOUNDARY.1).unwrap();

        let front_seat_ys: Vec<i32> = assigned_seat_ys(&tables)
            .into_iter()
            .filter(|(id, _)| front_ids.contains(id))
            .map(|(_, y)| y)
            .collect();
        assert_eq!(front_seat_ys.len(), 2);
        let min_row_y = tables[0].y_pos + SEAT_PADDING;
        assert!(front_seat_ys.iter().all(|&y| y == min_row_y));
    }

    #[test]
    fn back_preference_students_get_back_row_seats() {
        // 3 rows x 2 cols = 6 seats; row 2 (the last row) has exactly 2
        // seats, matching the back-preference roster size exactly so every
        // back student must land in the highest seat_y row.
        let existing = vec![TableGeometry {
            rows: 3,
            cols: 2,
            x_pos: 40,
            y_pos: 40,
        }];
        let back = students_with_preference(2, SeatingPreference::Back);
        let back_ids: HashSet<Uuid> = student_ids(&back).into_iter().collect();
        let tables =
            build_randomized_chart(back, true, existing, 2, 2, BOUNDARY.0, BOUNDARY.1).unwrap();

        let back_seat_ys: Vec<i32> = assigned_seat_ys(&tables)
            .into_iter()
            .filter(|(id, _)| back_ids.contains(id))
            .map(|(_, y)| y)
            .collect();
        assert_eq!(back_seat_ys.len(), 2);
        let max_row_y = tables[0].y_pos + SEAT_PADDING + 2 * (SEAT_NODE_SIZE + SEAT_PADDING);
        assert!(back_seat_ys.iter().all(|&y| y == max_row_y));
    }

    #[test]
    fn mixed_front_and_back_preferences_both_respected() {
        // 3 rows x 2 cols = 6 seats; 2 front + 2 none + 2 back fills the
        // table exactly, so the algorithm has no slack to place any group
        // outside its expected band of rows.
        let existing = vec![TableGeometry {
            rows: 3,
            cols: 2,
            x_pos: 40,
            y_pos: 40,
        }];
        let front = students_with_preference(2, SeatingPreference::Front);
        let back = students_with_preference(2, SeatingPreference::Back);
        let none = students(2);
        let front_ids: HashSet<Uuid> = student_ids(&front).into_iter().collect();
        let back_ids: HashSet<Uuid> = student_ids(&back).into_iter().collect();

        let mut roster = front;
        roster.extend(back);
        roster.extend(none);

        let tables =
            build_randomized_chart(roster, true, existing, 2, 2, BOUNDARY.0, BOUNDARY.1).unwrap();
        let assigned = assigned_seat_ys(&tables);

        let front_max_y = assigned
            .iter()
            .filter(|(id, _)| front_ids.contains(id))
            .map(|(_, y)| *y)
            .max()
            .unwrap();
        let back_min_y = assigned
            .iter()
            .filter(|(id, _)| back_ids.contains(id))
            .map(|(_, y)| *y)
            .min()
            .unwrap();
        let non_front_min_y = assigned
            .iter()
            .filter(|(id, _)| !front_ids.contains(id))
            .map(|(_, y)| *y)
            .min()
            .unwrap();
        let non_back_max_y = assigned
            .iter()
            .filter(|(id, _)| !back_ids.contains(id))
            .map(|(_, y)| *y)
            .max()
            .unwrap();

        assert!(front_max_y <= non_front_min_y);
        assert!(back_min_y >= non_back_max_y);
    }

    #[test]
    fn preference_contention_gives_a_random_subset_the_preferred_seats() {
        // 4 rows x 1 col = 4 seats, each row a distinct seat_y (50/150/250/
        // 350). 3 front-preferring students plus 1 none student fills the
        // table exactly, so 3 front students must contend for seats, only
        // one of which (seat_y 350) can go to the non-preferring student.
        let existing = vec![TableGeometry {
            rows: 4,
            cols: 1,
            x_pos: 40,
            y_pos: 40,
        }];
        let front = students_with_preference(3, SeatingPreference::Front);
        let none = students(1);
        let front_ids: HashSet<Uuid> = student_ids(&front).into_iter().collect();
        let none_ids: HashSet<Uuid> = student_ids(&none).into_iter().collect();

        let mut roster = front;
        roster.extend(none);
        let roster_ids: HashSet<Uuid> = student_ids(&roster).into_iter().collect();

        let tables =
            build_randomized_chart(roster, true, existing, 2, 2, BOUNDARY.0, BOUNDARY.1).unwrap();
        let assigned = assigned_seat_ys(&tables);

        // No panic, and everyone is seated exactly once (capacity == roster size).
        assert_eq!(assigned.len(), 4);
        let assigned_ids: HashSet<Uuid> = assigned.iter().map(|(id, _)| *id).collect();
        assert_eq!(assigned_ids, roster_ids);

        // The single highest seat (seat_y 350, the only one front students
        // don't need) must go to the no-preference student, and every front
        // student must land strictly above it.
        let max_seat_y = tables[0].y_pos + SEAT_PADDING + 3 * (SEAT_NODE_SIZE + SEAT_PADDING);
        for (id, y) in &assigned {
            if none_ids.contains(id) {
                assert_eq!(*y, max_seat_y);
            }
            if front_ids.contains(id) {
                assert!(*y < max_seat_y);
            }
        }
    }

    #[test]
    fn single_row_of_seats_seats_everyone_without_double_assignment() {
        // 1 row x 3 cols = 3 seats, all in the same (only) row, so there's no
        // front/back row distinction to check. This locks in the invariant
        // that `front_take + back_take <= n` protects against: a table too
        // short to have separate front/back rows must still seat everyone
        // exactly once without panicking or double-assigning a seat.
        let existing = vec![TableGeometry {
            rows: 1,
            cols: 3,
            x_pos: 40,
            y_pos: 40,
        }];
        let front = students_with_preference(1, SeatingPreference::Front);
        let back = students_with_preference(1, SeatingPreference::Back);
        let none = students(1);

        let mut roster = front;
        roster.extend(back);
        roster.extend(none);
        let roster_ids: HashSet<Uuid> = student_ids(&roster).into_iter().collect();

        let tables =
            build_randomized_chart(roster, true, existing, 2, 2, BOUNDARY.0, BOUNDARY.1).unwrap();
        let assigned = assigned_ids(&tables);

        assert_eq!(assigned.len(), 3);
        let unique: HashSet<Uuid> = assigned.iter().copied().collect();
        assert_eq!(assigned.len(), unique.len());
        assert_eq!(unique, roster_ids);
    }

    #[test]
    fn zero_preference_students_matches_plain_shuffle_regression() {
        let roster = students(5);
        let tables =
            build_randomized_chart(roster.clone(), false, vec![], 2, 2, BOUNDARY.0, BOUNDARY.1)
                .unwrap();

        let capacity: usize = tables.iter().map(|t| t.seat_assignments.len()).sum();
        assert!(capacity >= roster.len());

        let assigned: HashSet<Uuid> = assigned_ids(&tables).into_iter().collect();
        assert_eq!(assigned, student_ids(&roster).into_iter().collect());
    }

    #[test]
    fn front_group_seats_are_always_at_or_below_median_seat_y_when_capacity_allows() {
        // 4 rows x 2 cols = 8 seats; 4 front-preferring students (exactly
        // half) plus 4 none students fills the table exactly.
        let existing = vec![TableGeometry {
            rows: 4,
            cols: 2,
            x_pos: 40,
            y_pos: 40,
        }];
        let front = students_with_preference(4, SeatingPreference::Front);
        let none = students(4);
        let front_ids: HashSet<Uuid> = student_ids(&front).into_iter().collect();

        let mut roster = front;
        roster.extend(none);

        let tables =
            build_randomized_chart(roster, true, existing, 2, 2, BOUNDARY.0, BOUNDARY.1).unwrap();
        let assigned = assigned_seat_ys(&tables);

        let mut seat_ys: Vec<i32> = assigned.iter().map(|(_, y)| *y).collect();
        seat_ys.sort();
        let median = seat_ys[seat_ys.len() / 2];

        for (id, y) in &assigned {
            if front_ids.contains(id) {
                assert!(*y <= median);
            }
        }
    }

    #[test]
    fn new_tables_are_placed_with_a_gap_not_touching() {
        // 3 students, 1-seat tables, no kept capacity -> 3 new tables, each
        // packed as tightly as possible against the last.
        let tables =
            build_randomized_chart(students(3), false, vec![], 1, 1, BOUNDARY.0, BOUNDARY.1)
                .unwrap();

        assert_eq!(tables.len(), 3);
        let size = table_pixel_size(1, 1);
        for i in 0..tables.len() {
            for j in (i + 1)..tables.len() {
                let (a, b) = (&tables[i], &tables[j]);
                let x_gap = if a.x_pos <= b.x_pos {
                    b.x_pos - (a.x_pos + size.0)
                } else {
                    a.x_pos - (b.x_pos + size.0)
                };
                let y_gap = if a.y_pos <= b.y_pos {
                    b.y_pos - (a.y_pos + size.1)
                } else {
                    a.y_pos - (b.y_pos + size.1)
                };
                // Two non-overlapping tables must be separated by at least
                // TABLE_GAP along whichever axis actually separates them.
                assert!(x_gap >= TABLE_GAP || y_gap >= TABLE_GAP);
            }
        }
    }
}
