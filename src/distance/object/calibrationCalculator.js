/**
 * calibrationCalculator.js
 *
 * Pure functions for calculating calibration factors, building the final
 * data object, and sanitizing values for PsychoJS compatibility.
 *
 * Faithfully reproduces the logic from legacy distance.js lines 7669-7818
 * (objectTestFinishFunction calculation section).
 */

import { debugLog, debugError } from './debugLogger'

/**
 * Recursively sanitize a value: replace NaN numbers with 0, leave null/undefined as-is.
 * Prevents PsychoJS "unable to convert NaN to a number" errors.
 *
 * Legacy: distance.js lines 7793-7805
 *
 * @param {*} val
 * @returns {*}
 */
export function sanitizeValue(val) {
  if (val === null || val === undefined) return val
  if (typeof val === 'number' && isNaN(val)) return 0
  if (Array.isArray(val)) return val.map(sanitizeValue)
  if (typeof val === 'object') {
    const sanitized = {}
    for (const key in val) {
      sanitized[key] = sanitizeValue(val[key])
    }
    return sanitized
  }
  return val
}

/**
 * Sanitize all top-level keys of a data object in-place.
 *
 * Legacy: distance.js lines 7807-7810
 *
 * @param {object} data
 * @returns {object} The same object, mutated
 */
export function sanitizeDataObject(data) {
  Object.keys(data).forEach(key => {
    data[key] = sanitizeValue(data[key])
  })
  return data
}

/**
 * Filter NaN values from face mesh samples and round to integers.
 *
 * Legacy: distance.js lines 7707-7712
 *
 * @param {number[]} samples
 * @returns {number[]}
 */
export function filterAndRoundSamples(samples) {
  return samples.filter(s => !isNaN(s)).map(s => Math.round(s))
}

/**
 * Calculate calibration factors from the two measurement pages.
 *
 * Legacy: distance.js lines 7720-7789
 *
 * @param {object} RC - RemoteCalibrator instance (reads page3FactorCmPx, page4FactorCmPx, etc.)
 * @param {number[]} faceMeshSamplesPage3
 * @param {number[]} faceMeshSamplesPage4
 * @returns {{
 *   distance1FactorCmPx: number,
 *   distance2FactorCmPx: number,
 *   averageFactorCmPx: number,
 *   page3Average: number,
 *   page4Average: number,
 * }}
 */
export function calculateCalibrationFactors(
  RC,
  faceMeshSamplesPage3,
  faceMeshSamplesPage4,
) {
  const validPage3Samples = faceMeshSamplesPage3.filter(s => !isNaN(s))
  const validPage4Samples = faceMeshSamplesPage4.filter(s => !isNaN(s))

  const page3Average = validPage3Samples.length
    ? validPage3Samples.reduce((a, b) => a + b, 0) / validPage3Samples.length
    : 0
  const page4Average = validPage4Samples.length
    ? validPage4Samples.reduce((a, b) => a + b, 0) / validPage4Samples.length
    : 0

  const distance1FactorCmPx = RC.page3FactorCmPx
  const distance2FactorCmPx = RC.page4FactorCmPx

  const averageFactorCmPx = Math.round(
    Math.sqrt(distance1FactorCmPx * distance2FactorCmPx),
  )

  debugLog('calibration', {
    distance1FactorCmPx,
    distance2FactorCmPx,
    averageFactorCmPx,
    calibrationFOverWidth: RC.calibrationFOverWidth,
    fOverWidth1: RC.fOverWidth1,
    fOverWidth2: RC.fOverWidth2,
  })

  if (isNaN(averageFactorCmPx)) {
    debugError('calibration', 'averageFactorCmPx is NaN!')
  }
  if (!RC.calibrationFOverWidth || isNaN(RC.calibrationFOverWidth)) {
    debugError(
      'calibration',
      'RC.calibrationFOverWidth is missing or NaN! Distance tracking will produce NaN.',
    )
  }

  return {
    distance1FactorCmPx,
    distance2FactorCmPx,
    averageFactorCmPx,
    page3Average,
    page4Average,
  }
}

/**
 * Build the final calibration data object matching the legacy shape.
 *
 * Legacy: distance.js lines 7669-7818
 *
 * @param {object} params
 * @param {number} params.firstMeasurementCm - Object length in cm
 * @param {object} params.toFixedNumber - Utility function
 * @param {number} params.startX
 * @param {number} params.startY
 * @param {number} params.endX
 * @param {number} params.endY
 * @param {number} params.screenWidthPx
 * @param {number|null} params.objectLengthPx
 * @param {number|null} params.objectLengthMm
 * @param {number} params.ppi
 * @param {number|null} params.intraocularDistanceCm
 * @param {number[]} params.faceMeshSamplesPage3
 * @param {number[]} params.faceMeshSamplesPage4
 * @param {boolean} params.isPaperSelectionModeBool
 * @param {string|null} params.selectedPaperOption
 * @param {string|null} params.selectedPaperLabel
 * @param {Array} params.paperSelectionOptions
 * @param {number|null} params.selectedPaperLengthCm
 * @param {string|null} params.paperSuggestionValue
 * @param {object} params.calibrationFactors - Output of calculateCalibrationFactors
 * @returns {object} The data object ready for callback
 */
export function buildCalibrationData({
  firstMeasurementCm,
  toFixedNumber,
  startX,
  startY,
  endX,
  endY,
  screenWidthPx,
  objectLengthPx,
  objectLengthMm,
  ppi,
  intraocularDistanceCm,
  faceMeshSamplesPage3,
  faceMeshSamplesPage4,
  isPaperSelectionModeBool,
  selectedPaperOption,
  selectedPaperLabel,
  paperSelectionOptions,
  selectedPaperLengthCm,
  paperSuggestionValue,
  calibrationFactors,
}) {
  const data = {
    value: toFixedNumber(firstMeasurementCm, 1),
    timestamp: performance.now(),
    method: 'object',
    raw: {
      startX,
      startY,
      endX,
      endY,
      screenWidth: screenWidthPx,
      objectLengthPx,
      objectLengthMm,
      ppi,
      webcamToEyesCm: firstMeasurementCm,
      paperOption: isPaperSelectionModeBool ? selectedPaperOption : null,
      paperLabel: isPaperSelectionModeBool
        ? selectedPaperLabel ||
          paperSelectionOptions.find(o => o.key === selectedPaperOption)
            ?.label ||
          null
        : null,
      paperLengthCm: isPaperSelectionModeBool ? selectedPaperLengthCm : null,
      objectSuggestion: isPaperSelectionModeBool ? paperSuggestionValue : null,
    },
    intraocularDistanceCm,
    faceMeshSamplesPage3: filterAndRoundSamples(faceMeshSamplesPage3),
    faceMeshSamplesPage4: filterAndRoundSamples(faceMeshSamplesPage4),
    objectSuggestion: isPaperSelectionModeBool ? paperSuggestionValue : null,
    objectName: selectedPaperOption
      ? paperSelectionOptions.find(o => o.key === selectedPaperOption)?.label ||
        ''
      : null,
  }

  const {
    distance1FactorCmPx,
    distance2FactorCmPx,
    averageFactorCmPx,
    page3Average,
    page4Average,
  } = calibrationFactors

  data.calibrationFactor = isNaN(averageFactorCmPx) ? 0 : averageFactorCmPx
  data.distance1FactorCmPx = isNaN(distance1FactorCmPx)
    ? 0
    : distance1FactorCmPx
  data.distance2FactorCmPx = isNaN(distance2FactorCmPx)
    ? 0
    : distance2FactorCmPx

  sanitizeDataObject(data)

  data.viewingDistanceByObject1Cm = data.value
  data.viewingDistanceByObject2Cm = data.value
  data.page3Average = page3Average
  data.page4Average = page4Average

  return data
}
