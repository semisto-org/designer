/** The last EcoIndex measurement of a screen (EcoMeasurement#as_summary). */
export type EcoScreen = {
  screen: string
  environment: 'production' | 'test_copy'
  url: string
  score: number
  grade: string
  domElements: number
  requests: number
  kilobytes: number
  gesGrams: number
  waterCentiliters: number
  commit: string | null
  measuredAt: string
  /** Scores of the last measurements, oldest first, this one last. */
  history: number[]
}
