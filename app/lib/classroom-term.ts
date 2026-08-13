export const TERM_SEASONS = ["fall", "winter", "spring", "summer"] as const
export type TermSeason = (typeof TERM_SEASONS)[number]

export const termSeasonOptions = TERM_SEASONS.map((season) => ({
  label: season.charAt(0).toUpperCase() + season.slice(1),
  value: season,
}))

/**
 * Formats a classroom's term as e.g. "Fall 2026".
 * @param termSeason - One of `TERM_SEASONS`.
 * @param termYear - The term's calendar year.
 * @returns The capitalized season and year, space-separated.
 */
export function formatTerm(termSeason: string, termYear: number): string {
  return `${termSeason.charAt(0).toUpperCase()}${termSeason.slice(1)} ${termYear}`
}
