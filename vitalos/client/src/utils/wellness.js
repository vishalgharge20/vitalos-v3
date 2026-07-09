// src/utils/wellness.js
//
// Two composite scores Apple Health doesn't hand you directly, computed
// the same honest way as the Sleep Score: simple, transparent heuristics,
// always labeled "(est.)" wherever they're shown — not a clinical claim.

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

/**
 * Strain (est.), 0–21 scale — modeled loosely on Whoop's cardiovascular
 * load scale. Built from exercise minutes + active calories, since that's
 * what Apple Health actually gives us (no real strain algorithm here).
 */
export function computeStrain(today) {
  const exerciseMin = today?.activity?.exerciseMinutes ?? 0
  const activeCal = today?.activity?.calories ?? 0
  if (!exerciseMin && !activeCal) return null
  const raw = exerciseMin * 1.2 + activeCal / 15
  return Math.round(clamp(raw / 8, 0, 21) * 10) / 10
}

/**
 * Recovery (est.), 0–100 — blends today's resting heart rate (relative to
 * your own recent baseline, not a population norm) with the Sleep Score.
 * Whoop derives this from HRV, which Apple Health doesn't expose in a
 * comparable way, so this is a deliberately simpler stand-in.
 */
export function computeRecovery(today, recentDays) {
  const restingToday = today?.heart?.resting
  const sleepScore = today?.sleep?.score

  const restingValues = (recentDays || [])
    .map((d) => d?.heart?.resting)
    .filter((v) => v != null)

  if (restingToday == null && sleepScore == null) return null

  let hrScore = null
  if (restingToday != null && restingValues.length >= 3) {
    const min = Math.min(...restingValues)
    const max = Math.max(...restingValues)
    hrScore = max === min ? 70 : clamp(100 - ((restingToday - min) / (max - min)) * 100, 0, 100)
  }

  if (hrScore != null && sleepScore != null) {
    return Math.round(hrScore * 0.5 + sleepScore * 0.5)
  }
  return Math.round(hrScore ?? sleepScore)
}