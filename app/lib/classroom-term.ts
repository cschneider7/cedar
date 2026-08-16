import type { Classroom } from "~/lib/schemas"

export const TERM_SEASONS = ["fall", "winter", "spring", "summer"] as const
export type TermSeason = (typeof TERM_SEASONS)[number]

export const termSeasonOptions = TERM_SEASONS.map((season) => ({
  label: season.charAt(0).toUpperCase() + season.slice(1),
  value: season,
}))

const TERM_SEASON_CODES: Record<TermSeason, string> = {
  fall: "FA",
  winter: "WI",
  spring: "SP",
  summer: "SU",
}

/**
 * Formats a classroom's term as e.g. "Fall 2026".
 * @param termSeason - One of `TERM_SEASONS`.
 * @param termYear - The term's calendar year.
 * @returns The capitalized season and year, space-separated.
 */
export function formatTerm(termSeason: string, termYear: number): string {
  return `${termSeason.charAt(0).toUpperCase()}${termSeason.slice(1)} ${termYear}`
}

/**
 * Formats a classroom's term as a compact code, e.g. "FA26".
 * @param termSeason - One of `TERM_SEASONS`.
 * @param termYear - The term's calendar year.
 * @returns The season's 2-letter code plus the year's last 2 digits.
 */
export function formatTermAbbreviation(
  termSeason: TermSeason,
  termYear: number
): string {
  return `${TERM_SEASON_CODES[termSeason]}${String(termYear).slice(-2)}`
}

/**
 * Formats a classroom's compact display name, e.g. "[FA26] Math 2 (Per 3)".
 * @param classroom - The classroom's subject, period, and term fields.
 * @returns The composed `[Term] Subject (Per #)` name.
 */
export function formatClassroomName(
  classroom: Pick<Classroom, "subject" | "period" | "term_season" | "term_year">
): string {
  const term = formatTermAbbreviation(
    classroom.term_season,
    classroom.term_year
  )
  return `[${term}] ${classroom.subject} (Per ${classroom.period})`
}
