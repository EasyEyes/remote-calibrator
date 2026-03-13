/**
 * faceMeshCollector.js
 *
 * Functions for collecting Face Mesh interpupillary distance samples
 * and computing calibration values (fOverWidth, eye-to-foot distance).
 *
 * Faithfully reproduces the logic from legacy distance.js lines 3988-4038
 * and the face mesh calculation block at lines 8896-9015.
 */

import {
  FACE_MESH_SAMPLE_COUNT,
  FACE_MESH_SAMPLE_DELAY_MS,
} from './objectTestConstants'
import { debugLog, debugWarn, debugError } from './debugLogger'

/**
 * Collect exactly FACE_MESH_SAMPLE_COUNT samples of interpupillary distance
 * using Face Mesh. Failed measurements are stored as NaN.
 *
 * Legacy: distance.js lines 3988-4038
 *
 * @param {object} RC - RemoteCalibrator instance
 * @param {string} calibrateDistancePupil - Pupil detection mode
 * @param {number[]} samplesArr - Array to fill (cleared and populated in-place)
 * @param {number[]} meshSamplesArr - Array to collect raw mesh data
 * @param {function} measureIntraocularDistancePx - Measurement function
 * @returns {Promise<void>}
 */
export async function collectFaceMeshSamples(
  RC,
  calibrateDistancePupil,
  samplesArr,
  meshSamplesArr,
  measureIntraocularDistancePx,
) {
  samplesArr.length = 0

  for (let i = 0; i < FACE_MESH_SAMPLE_COUNT; i++) {
    try {
      const pxDist = await measureIntraocularDistancePx(
        RC,
        calibrateDistancePupil,
        meshSamplesArr,
        RC.calibrateDistanceIpdUsesZBool !== false,
      )
      if (pxDist && !isNaN(pxDist)) {
        samplesArr.push(pxDist)
      } else {
        samplesArr.push(NaN)
        debugWarn('faceMesh', `Measurement ${i + 1} failed, storing NaN`)
      }
    } catch (error) {
      samplesArr.push(NaN)
      debugWarn('faceMesh', `Measurement ${i + 1} error:`, error)
    }

    await new Promise(res => setTimeout(res, FACE_MESH_SAMPLE_DELAY_MS))
  }

  const validSamplesCount = samplesArr.filter(s => !isNaN(s)).length
  const failedSamplesCount = samplesArr.filter(s => isNaN(s)).length

  debugLog(
    'faceMesh',
    `Samples collected: ${validSamplesCount} valid, ${failedSamplesCount} failed`,
  )
  debugLog(
    'faceMesh',
    'All samples:',
    samplesArr.map(s => (isNaN(s) ? 'NaN' : s.toFixed(2))),
  )

  if (samplesArr.length !== FACE_MESH_SAMPLE_COUNT) {
    debugError(
      'faceMesh',
      `Expected ${FACE_MESH_SAMPLE_COUNT} samples but got ${samplesArr.length}. Padding with NaN.`,
    )
    while (samplesArr.length < FACE_MESH_SAMPLE_COUNT) {
      samplesArr.push(NaN)
    }
  }
}

/**
 * Calculate the average of valid (non-NaN) face mesh samples.
 *
 * @param {number[]} samples - Array of interpupillary distance samples in video pixels
 * @returns {number} Average value, or NaN if no valid samples
 */
export function calculateAverageFaceMeshVpx(samples) {
  const validSamples = samples.filter(s => !isNaN(s))
  if (validSamples.length === 0) return NaN
  return validSamples.reduce((a, b) => a + b, 0) / validSamples.length
}

/**
 * Calculate fOverWidth from face mesh data and object length.
 *
 * Legacy: distance.js lines 8940-8941
 *   factorCmPx = avgFaceMesh * firstMeasurement
 *   fOverWidth = factorCmPx / cameraRes[0] / RC._CONST.IPD_CM
 *
 * @param {number} avgFaceMeshVpx - Average interpupillary distance in video pixels
 * @param {number} objectLengthCm - Object length in centimeters
 * @param {number} cameraWidthVpx - Camera resolution width in video pixels
 * @param {number} ipdCm - Assumed interpupillary distance in centimeters
 * @returns {{ factorCmPx: number, fOverWidth: number }}
 */
export function calculateFOverWidth(
  avgFaceMeshVpx,
  objectLengthCm,
  cameraWidthVpx,
  ipdCm,
) {
  const factorCmPx = avgFaceMeshVpx * objectLengthCm
  const fOverWidth = factorCmPx / cameraWidthVpx / ipdCm
  return { factorCmPx, fOverWidth }
}

/**
 * Calculate ruler-based eye-to-foot distance using Pythagorean theorem.
 *
 * Legacy: distance.js lines 8995-8996
 *   rulerBasedEyesToFootCm = Math.sqrt(rulerBasedEyesToPointCm ** 2 - footToPointCm ** 2)
 *
 * @param {number} eyeToPointCm - Distance from eye to point in cm
 * @param {number} footToPointCm - Distance from foot to point in cm
 * @returns {number} Eye-to-foot distance in cm
 */
export function calculateEyeToFootCm(eyeToPointCm, footToPointCm) {
  return Math.sqrt(eyeToPointCm ** 2 - footToPointCm ** 2)
}

/**
 * Calculate foot-to-point distance from pixel coordinates.
 *
 * Legacy: distance.js lines 8988-8992
 *
 * @param {number[]} footXYPx - [x, y] foot position in CSS pixels
 * @param {number[]} pointXYPx - [x, y] point position in CSS pixels
 * @param {number} pxPerCm - CSS pixels per centimeter
 * @returns {number} Distance in centimeters
 */
export function calculateFootToPointCm(footXYPx, pointXYPx, pxPerCm) {
  return (
    Math.hypot(footXYPx[0] - pointXYPx[0], footXYPx[1] - pointXYPx[1]) / pxPerCm
  )
}

/**
 * Calculate image-based eye distances from fOverWidth.
 *
 * Legacy: distance.js lines 9004-9014
 *
 * @param {number} fOverWidth
 * @param {number} cameraWidthVpx
 * @param {number} currentIPDDistanceVpx
 * @param {number} ipdCm
 * @param {number|null} footToPointCm
 * @returns {{ imageBasedEyesToFootCm: number|null, imageBasedEyesToPointCm: number|null }}
 */
export function calculateImageBasedDistances(
  fOverWidth,
  cameraWidthVpx,
  currentIPDDistanceVpx,
  ipdCm,
  footToPointCm,
) {
  const fVpx = fOverWidth * cameraWidthVpx
  const imageBasedEyesToFootCm =
    currentIPDDistanceVpx && ipdCm
      ? (fVpx * ipdCm) / currentIPDDistanceVpx
      : null
  const imageBasedEyesToPointCm =
    imageBasedEyesToFootCm != null && footToPointCm != null
      ? Math.sqrt(imageBasedEyesToFootCm ** 2 + footToPointCm ** 2)
      : null
  return { imageBasedEyesToFootCm, imageBasedEyesToPointCm }
}
