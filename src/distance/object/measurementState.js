/**
 * measurementState.js
 *
 * Factory function for creating the ruler measurement iteration state.
 * Tracks individual ruler measurements, consistency checking between
 * consecutive pairs, and geometric mean calculation.
 *
 * Faithfully reproduces the logic from legacy distance.js lines 3737-3752
 * and the checkLastTwoObjectMeasurements helper (lines 3387-3416).
 */

import { debugLog } from './debugLogger'

/**
 * Check whether the last two measurements are consistent.
 * Reproduces legacy checkLastTwoObjectMeasurements (distance.js lines 3387-3416).
 *
 * @param {Array<{objectLengthCm: number}>} measurements
 * @param {number} threshold - Allowed ratio (e.g. 1.1)
 * @returns {{indices: [number, number], values: [number, number]}|null}
 */
function checkLastTwoMeasurements(measurements, threshold) {
  if (measurements.length < 2) return null

  const lastIndex = measurements.length - 1
  const secondLastIndex = measurements.length - 2

  const m1Cm = measurements[secondLastIndex].objectLengthCm
  const m2Cm = measurements[lastIndex].objectLengthCm

  // Round to integer percentage before testing so the accept/reject
  // decision is consistent with what the participant sees.
  const roundedPct = Math.round((100 * m2Cm) / m1Cm)
  const lower = Math.round(100 / threshold)
  const upper = Math.round(100 * threshold)

  debugLog(
    'measurementState',
    `Checking last two: M1=${m1Cm.toFixed(1)}cm, M2=${m2Cm.toFixed(1)}cm, ` +
      `ratio=${roundedPct}%, interval=[${lower}%, ${upper}%]`,
  )

  if (roundedPct >= lower && roundedPct <= upper) {
    debugLog('measurementState', 'Last two measurements are consistent')
    return { indices: [secondLastIndex, lastIndex], values: [m1Cm, m2Cm] }
  }

  debugLog('measurementState', 'Last two measurements are NOT consistent')
  return null
}

/**
 * Create a measurement state manager for ruler-based object measurements.
 *
 * @param {object} params
 * @param {number} params.objectMeasurementCount - Requested number of measurements
 * @param {boolean} params.isPaperSelectionModeBool - Whether paper selection mode is active
 * @returns {object} State manager
 */
export function createMeasurementState({
  objectMeasurementCount,
  isPaperSelectionModeBool,
}) {
  let currentIteration = 1
  let totalIterations = isPaperSelectionModeBool
    ? 1
    : Math.max(1, Math.floor(objectMeasurementCount || 1))
  let measurements = []
  let consistentPair = null
  let lastAttemptWasTooShortBool = false
  let rejectionCount = 0
  let factorRejectionCount = 0

  return {
    /** Current iteration number (1-based). */
    get currentIteration() {
      return currentIteration
    },
    set currentIteration(value) {
      currentIteration = value
    },

    /** Total iterations expected. */
    get totalIterations() {
      return totalIterations
    },
    set totalIterations(value) {
      totalIterations = value
    },

    /** Whether the last attempt was too short. */
    get lastAttemptWasTooShortBool() {
      return lastAttemptWasTooShortBool
    },
    set lastAttemptWasTooShortBool(value) {
      lastAttemptWasTooShortBool = value
    },

    /**
     * Legacy alias: pageController uses `lastAttemptWasTooShort` (without Bool suffix).
     */
    get lastAttemptWasTooShort() {
      return lastAttemptWasTooShortBool
    },
    set lastAttemptWasTooShort(value) {
      lastAttemptWasTooShortBool = value
    },

    /** Number of rejections (too short or mismatched). */
    get rejectionCount() {
      return rejectionCount
    },
    set rejectionCount(value) {
      rejectionCount = value
    },

    /** Number of page 3/4 factor mismatch rejections. */
    get factorRejectionCount() {
      return factorRejectionCount
    },
    set factorRejectionCount(value) {
      factorRejectionCount = value
    },

    /** All recorded measurements. Mutable array -- callers can push directly. */
    get measurements() {
      return measurements
    },
    set measurements(value) {
      measurements = value
    },

    /** The consistent pair found, if any. */
    get consistentPair() {
      return consistentPair
    },
    set consistentPair(value) {
      consistentPair = value
    },

    /** Whether all required iterations are complete. */
    get isComplete() {
      return currentIteration >= totalIterations
    },

    /**
     * Record a new measurement.
     * @param {object} data - Measurement data including objectLengthCm
     */
    recordMeasurement(data) {
      measurements.push(data)
      debugLog(
        'measurementState',
        `Measurement ${currentIteration} saved: ${data.objectLengthCm?.toFixed(1)} cm`,
      )
    },

    /** Advance to the next iteration. */
    advanceIteration() {
      currentIteration++
    },

    /** Increment the rejection counter. */
    incrementRejectionCount() {
      rejectionCount++
      debugLog('measurementState', `Rejection count: ${rejectionCount}`)
    },

    /** Increment the factor rejection counter. */
    incrementFactorRejectionCount() {
      factorRejectionCount++
    },

    /**
     * Check consistency of the last two measurements.
     * @param {number} threshold - Allowed ratio (e.g. 1.1)
     * @returns {{indices: [number, number], values: [number, number]}|null}
     */
    checkConsistency(threshold) {
      const result = checkLastTwoMeasurements(measurements, threshold)
      if (result) {
        consistentPair = result
      }
      return result
    },

    /**
     * Get the geometric mean of the consistent pair.
     * @returns {number|null}
     */
    getGeometricMean() {
      if (!consistentPair) return null
      return Math.sqrt(consistentPair.values[0] * consistentPair.values[1])
    },

    /**
     * Full reset for starting over with a new object.
     * Legacy: distance.js lines 8839-8846
     */
    resetForNewObject() {
      measurements = []
      currentIteration = 1
      consistentPair = null
      lastAttemptWasTooShortBool = false
      rejectionCount = 0
      factorRejectionCount = 0
    },
  }
}
