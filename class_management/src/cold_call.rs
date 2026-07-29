use rand::prelude::*;
use uuid::Uuid;

pub const WEIGHT_INCREMENT: u32 = 10;

/// Errors that can occur while picking a cold-call student.
#[derive(Debug, PartialEq)]
pub enum ColdCallError {
    /// The candidate list was empty.
    EmptyList,
}

/// Picks a random student for a cold call, weighted by `weight`, then
/// adjusts weights so the picked student won't be picked again immediately
/// after and everyone else is more likely next time.
///
/// If every candidate's weight is 0 (e.g. a single-student list already
/// floored to 0), falls back to a uniform pick among all candidates rather
/// than erroring — otherwise the picker would become unusable exactly once
/// fairness has cycled through everyone.
pub fn pick_cold_call_student(
    students: Vec<(Uuid, u32)>,
) -> Result<(Uuid, Vec<(Uuid, u32)>), ColdCallError> {
    if students.is_empty() {
        return Err(ColdCallError::EmptyList);
    }

    let mut rng = rand::rng();
    let total_weight: u32 = students.iter().map(|(_, w)| w).sum();

    let (picked_id, _) = if total_weight == 0 {
        *students.choose(&mut rng).expect("students is non-empty")
    } else {
        *students
            .choose_weighted(&mut rng, |(_, w)| *w)
            .expect("students is non-empty and total_weight > 0")
    };

    let updated = students
        .into_iter()
        .map(|(id, weight)| {
            let weight = if id == picked_id {
                0
            } else {
                weight.saturating_add(WEIGHT_INCREMENT)
            };
            (id, weight)
        })
        .collect();

    Ok((picked_id, updated))
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::*;

    #[test]
    fn empty_list_returns_error() {
        let result = pick_cold_call_student(vec![]);
        assert_eq!(result, Err(ColdCallError::EmptyList));
    }

    #[test]
    fn single_student_always_picked_and_stays_pickable_after_flooring() {
        let id = Uuid::new_v4();
        let mut weight = 10;

        for _ in 0..5 {
            let (picked_id, updated) = pick_cold_call_student(vec![(id, weight)]).unwrap();
            assert_eq!(picked_id, id);
            assert_eq!(updated.len(), 1);
            weight = updated[0].1;
        }
        assert_eq!(weight, 0);
    }

    #[test]
    fn picked_student_weight_is_zeroed_and_others_increment_by_fixed_amount() {
        let picked = Uuid::new_v4();
        let other_a = Uuid::new_v4();
        let other_b = Uuid::new_v4();
        // Weight 0 for the others so `picked` is the only possible pick.
        let students = vec![(picked, 100), (other_a, 0), (other_b, 0)];

        let (picked_id, updated) = pick_cold_call_student(students).unwrap();
        assert_eq!(picked_id, picked);

        let by_id: HashMap<Uuid, u32> = updated.into_iter().collect();
        assert_eq!(by_id[&picked], 0);
        assert_eq!(by_id[&other_a], WEIGHT_INCREMENT);
        assert_eq!(by_id[&other_b], WEIGHT_INCREMENT);
    }

    #[test]
    fn weight_zero_student_is_never_picked_while_others_have_weight() {
        let excluded = Uuid::new_v4();
        let students = vec![
            (excluded, 0),
            (Uuid::new_v4(), 50),
            (Uuid::new_v4(), 50),
            (Uuid::new_v4(), 50),
        ];

        for _ in 0..200 {
            let (picked_id, _) = pick_cold_call_student(students.clone()).unwrap();
            assert_ne!(picked_id, excluded);
        }
    }

    #[test]
    fn all_zero_weights_falls_back_to_uniform_pick() {
        let students: Vec<(Uuid, u32)> = (0..4).map(|_| (Uuid::new_v4(), 0)).collect();
        let ids: Vec<Uuid> = students.iter().map(|(id, _)| *id).collect();

        let (picked_id, _) = pick_cold_call_student(students).unwrap();
        assert!(ids.contains(&picked_id));
    }
}
