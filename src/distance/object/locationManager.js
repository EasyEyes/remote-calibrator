/**
 * locationManager.js
 *
 * Factory function for creating a location measurement state manager.
 * Encapsulates all state and methods needed to track location-based measurements
 * for _calibrateDistanceLocations with arbitrary measurement points.
 */

import { parseLocationEye } from './locationUtils'
import { checkConsecutiveMeasurementTolerance } from './locationUtils'

/**
 * Factory function to create a location measurement state manager.
 * This encapsulates all the state and methods needed to track location-based measurements.
 *
 * @param {string[]} calibrateDistanceLocations - Array of location strings to measure
 * @returns {object} State manager with methods to track and manage measurements
 *
 * @example
 * const manager = createLocationMeasurementManager(['cameraLeftEye', 'cameraRightEye', 'center'])
 *
 * // Get current location info
 * const info = manager.getCurrentLocationInfo()
 * // { index: 0, locEye: 'cameraLeftEye', location: 'camera', eye: 'left', isFirst: true, isLast: false }
 *
 * // Store a measurement
 * manager.storeMeasurement({ fOverWidth: 0.5, faceMeshSamples: [...] })
 *
 * // Advance to next location
 * const hasMore = manager.advanceToNext() // true if more locations remain
 *
 * // Check tolerance
 * const result = manager.checkTolerance(0.52, 1.15) // { pass: true, ... }
 *
 * // Get previous fOverWidth
 * const prev = manager.getPreviousFOverWidth() // 0.5
 *
 * // Reject measurements and go back
 * manager.rejectAndGoBack(2) // Removes last 2 measurements, resets index
 */
export function createLocationMeasurementManager(calibrateDistanceLocations) {
  // Private state
  let currentLocationIndex = 0
  let completedMeasurements = []

  return {
    /**
     * Get the current location index
     */
    getCurrentIndex() {
      return currentLocationIndex
    },

    /**
     * Get total number of locations
     */
    getTotalLocations() {
      return calibrateDistanceLocations.length
    },

    /**
     * Get all completed measurements
     */
    getCompletedMeasurements() {
      return [...completedMeasurements]
    },

    /**
     * Get current location info
     * @returns {object|null} Location info or null if all locations measured
     */
    getCurrentLocationInfo() {
      if (currentLocationIndex >= calibrateDistanceLocations.length) {
        return null
      }
      const locEye = calibrateDistanceLocations[currentLocationIndex]
      const parsed = parseLocationEye(locEye)
      return {
        index: currentLocationIndex,
        locEye,
        location: parsed.location,
        eye: parsed.eye,
        isFirst: currentLocationIndex === 0,
        isLast: currentLocationIndex === calibrateDistanceLocations.length - 1,
      }
    },

    /**
     * Advance to next location
     * @returns {boolean} True if there are more locations to measure
     */
    advanceToNext() {
      currentLocationIndex++
      console.log(
        `Advanced to location index ${currentLocationIndex} of ${calibrateDistanceLocations.length}`,
      )
      return currentLocationIndex < calibrateDistanceLocations.length
    },

    /**
     * Store a completed measurement
     * @param {object} measurementData - The measurement data to store
     */
    storeMeasurement(measurementData) {
      const locEye = calibrateDistanceLocations[currentLocationIndex]
      const parsed = parseLocationEye(locEye)
      completedMeasurements.push({
        locationIndex: currentLocationIndex,
        locEye,
        location: parsed.location,
        eye: parsed.eye,
        ...measurementData,
        timestamp: Date.now(),
      })
      console.log(
        `Stored measurement for location ${currentLocationIndex}:`,
        measurementData,
      )
    },

    /**
     * Get the previous measurement's fOverWidth
     * @returns {number|null}
     */
    getPreviousFOverWidth() {
      if (completedMeasurements.length === 0) return null
      const prev = completedMeasurements[completedMeasurements.length - 1]
      return prev.fOverWidth
    },

    /**
     * Check tolerance against previous measurement
     * @param {number} currentFOverWidth
     * @param {number} allowedRatio
     * @returns {object} Tolerance check result
     */
    checkTolerance(currentFOverWidth, allowedRatio) {
      const previousFOverWidth = this.getPreviousFOverWidth()
      return checkConsecutiveMeasurementTolerance(
        currentFOverWidth,
        previousFOverWidth,
        allowedRatio,
      )
    },

    /**
     * Reject last N measurements and go back
     * @param {number} count - Number of measurements to reject (default 2)
     */
    rejectAndGoBack(count = 2) {
      console.log(`Rejecting last ${count} measurements`)
      for (let i = 0; i < count && completedMeasurements.length > 0; i++) {
        const rejected = completedMeasurements.pop()
        console.log(
          `  Rejected measurement at location ${rejected.locationIndex}`,
        )
      }
      // Go back to the first rejected location
      currentLocationIndex = Math.max(0, currentLocationIndex - count)
      console.log(`Reset to location index ${currentLocationIndex}`)
    },

    /**
     * Reset the manager to initial state
     */
    reset() {
      currentLocationIndex = 0
      completedMeasurements = []
      console.log('Location measurement manager reset')
    },

    /**
     * Check if all locations have been measured
     * @returns {boolean}
     */
    isComplete() {
      return completedMeasurements.length >= calibrateDistanceLocations.length
    },

    /**
     * Calculate final calibration values from all measurements
     * @returns {object} Calibration summary with geometric means
     */
    calculateFinalCalibration() {
      if (completedMeasurements.length === 0) {
        return null
      }

      const allFOverWidths = completedMeasurements.map(m => m.fOverWidth)
      const allFactors = completedMeasurements.map(m => m.factorCmPx)

      // Geometric mean of fOverWidth values
      const geometricMeanFOverWidth = Math.pow(
        allFOverWidths.reduce((a, b) => a * b, 1),
        1 / allFOverWidths.length,
      )

      // Geometric mean of calibration factors
      const geometricMeanFactor = Math.pow(
        allFactors.reduce((a, b) => a * b, 1),
        1 / allFactors.length,
      )

      return {
        measurements: [...completedMeasurements],
        totalMeasurements: completedMeasurements.length,
        allFOverWidths,
        allFactors,
        geometricMeanFOverWidth,
        geometricMeanFactor: Math.round(geometricMeanFactor),
        firstMeasurement: completedMeasurements[0],
        lastMeasurement:
          completedMeasurements[completedMeasurements.length - 1],
      }
    },
  }
}
