/**
 * objectTestStateManager.js
 *
 * Factory function for creating the object test telemetry state manager.
 * Replaces the legacy flat `objectTestCommonData` object (distance.js lines 3858-3910)
 * with encapsulated state and typed mutation methods.
 *
 * The data shape produced by getCommonData() is identical to the legacy object
 * so that saveCalibrationMeasurements receives the same structure.
 */

import { debugLog } from './debugLogger'

/**
 * Round a value to N decimal places, returning null for null/undefined/NaN.
 * @param {number|null} value
 * @param {number} decimals
 * @returns {number|null}
 */
function roundOrNull(value, decimals) {
  if (value == null || isNaN(value)) return null
  return parseFloat(Number(value).toFixed(decimals))
}

/**
 * Format a 2-element pixel coordinate for storage, rounding to 2 decimal places.
 * @param {number[]|null} xyPx
 * @returns {number[]|null}
 */
function formatXYPx(xyPx) {
  if (!xyPx || xyPx.length < 2) return null
  return [Math.round(xyPx[0] * 100) / 100, Math.round(xyPx[1] * 100) / 100]
}

/**
 * Create an object test state manager.
 *
 * @param {object} params
 * @param {object} params.options - The raw objectTest options
 * @param {number} params.calibrateDistanceOffsetCm - Resolved offset in cm
 * @param {string} params.webcamMaxXYVpx - Webcam resolution string (e.g. '1920,1080')
 * @param {number|null} params.webcamMaxHz - Webcam max frame rate
 * @returns {object} State manager with push/pop/get methods
 */
export function createObjectTestStateManager({
  options,
  calibrateDistanceOffsetCm,
  webcamMaxXYVpx,
  webcamMaxHz,
}) {
  // ─── Immutable config fields (prefixed with _ in legacy) ───────────────
  const configFields = {
    _calibrateDistance: options.calibrateDistance,
    _calibrateDistanceAllowedRangeCm: options.calibrateDistanceAllowedRangeCm,
    _calibrateDistanceAllowedRatio: options.calibrateDistanceAllowedRatio,
    _calibrateDistanceOffsetCm: calibrateDistanceOffsetCm,
    _calibrateDistancePupil: options.calibrateDistancePupil,
    _calibrateDistanceShowRulerUnitsBool:
      options.calibrateDistanceShowRulerUnitsBool,
    _calibrateDistanceTimes: options.objectMeasurementCount,
    _calibrateScreenSizeAllowedRatio: options.calibrateScreenSizeAllowedRatio,
    _calibrateScreenSizeTimes: options.calibrateScreenSizeTimes,
    _showPerpendicularFeetBool: options.showNearestPointsBool,
    _viewingDistanceWhichEye: options.viewingDistanceWhichEye,
    _viewingDistanceWhichPoint: options.viewingDistanceWhichPoint,
    webcamMaxXYVpx,
    webcamMaxHz,
  }

  // ─── Mutable array fields ──────────────────────────────────────────────
  const historyPreferRightHandBool = []
  const objectRulerIntervalCm = []
  const objectMeasuredMsg = []

  const acceptedFOverWidth = []
  const acceptedRatioFOverWidth = []
  const acceptedLocation = []
  const acceptedPointXYPx = []
  const acceptedLeftEyeFootXYPx = []
  const acceptedRightEyeFootXYPx = []
  const acceptedIpdOverWidth = []
  const acceptedRulerBasedEyesToFootCm = []
  const acceptedRulerBasedEyesToPointCm = []
  const acceptedImageBasedEyesToFootCm = []
  const acceptedImageBasedEyesToPointCm = []
  const acceptedPreferRightHandBool = []

  const rejectedFOverWidth = []
  const rejectedRatioFOverWidth = []
  const rejectedLocation = []
  const rejectedPointXYPx = []
  const rejectedLeftEyeFootXYPx = []
  const rejectedRightEyeFootXYPx = []
  const rejectedIpdOverWidth = []
  const rejectedRulerBasedEyesToFootCm = []
  const rejectedRulerBasedEyesToPointCm = []
  const rejectedImageBasedEyesToFootCm = []
  const rejectedImageBasedEyesToPointCm = []
  const rejectedPreferRightHandBool = []

  const historyFOverWidth = []
  const historyEyesToFootCm = []

  const estimatedLengthCm = []
  const estimatedLengthRatio = []

  let matchHalfLengthBool = null

  return {
    /**
     * Record a history entry for every snapshot regardless of acceptance.
     * Legacy: distance.js lines 9038-9048
     */
    pushHistoryEntry({
      fOverWidth,
      rulerBasedEyesToFootCm,
      preferRightHandBool: prefRightBool,
    }) {
      historyFOverWidth.push(roundOrNull(fOverWidth, 4))
      historyEyesToFootCm.push(roundOrNull(rulerBasedEyesToFootCm, 2))
      historyPreferRightHandBool.push(prefRightBool)
    },

    /**
     * Record an accepted measurement snapshot.
     * Legacy: distance.js lines 9327-9396
     */
    pushAcceptedMeasurement({
      fOverWidth,
      prevFOverWidth,
      locEye,
      pointXYPx,
      leftEyeFootXYPx,
      rightEyeFootXYPx,
      ipdOverWidth: ipdOW,
      rulerBasedEyesToFootCm: rbEyesFoot,
      rulerBasedEyesToPointCm: rbEyesPoint,
      imageBasedEyesToFootCm: ibEyesFoot,
      imageBasedEyesToPointCm: ibEyesPoint,
      preferRightHandBool: prefRightBool,
    }) {
      acceptedFOverWidth.push(roundOrNull(fOverWidth, 4))
      acceptedRatioFOverWidth.push(
        prevFOverWidth == null
          ? NaN
          : (() => {
              const r = fOverWidth / prevFOverWidth
              return r != null && !isNaN(r)
                ? parseFloat(Number(r).toFixed(4))
                : NaN
            })(),
      )
      acceptedLocation.push(locEye)
      acceptedPointXYPx.push(pointXYPx ? [...pointXYPx] : [null, null])
      acceptedLeftEyeFootXYPx.push(formatXYPx(leftEyeFootXYPx))
      acceptedRightEyeFootXYPx.push(formatXYPx(rightEyeFootXYPx))
      acceptedIpdOverWidth.push(roundOrNull(ipdOW, 4))
      acceptedRulerBasedEyesToFootCm.push(roundOrNull(rbEyesFoot, 2))
      acceptedRulerBasedEyesToPointCm.push(roundOrNull(rbEyesPoint, 2))
      acceptedImageBasedEyesToFootCm.push(roundOrNull(ibEyesFoot, 2))
      acceptedImageBasedEyesToPointCm.push(roundOrNull(ibEyesPoint, 2))
      acceptedPreferRightHandBool.push(prefRightBool)
      debugLog('stateManager', `Accepted measurement for ${locEye}`)
    },

    /**
     * Record a rejected measurement snapshot.
     * Legacy: distance.js lines 9070-9131
     */
    pushRejectedMeasurement({
      fOverWidth,
      prevFOverWidth,
      locEye,
      pointXYPx,
      leftEyeFootXYPx,
      rightEyeFootXYPx,
      ipdOverWidth: ipdOW,
      rulerBasedEyesToFootCm: rbEyesFoot,
      rulerBasedEyesToPointCm: rbEyesPoint,
      imageBasedEyesToFootCm: ibEyesFoot,
      imageBasedEyesToPointCm: ibEyesPoint,
      preferRightHandBool: prefRightBool,
    }) {
      rejectedFOverWidth.push(roundOrNull(fOverWidth, 4))
      rejectedRatioFOverWidth.push(
        roundOrNull(
          prevFOverWidth != null ? fOverWidth / prevFOverWidth : NaN,
          4,
        ),
      )
      rejectedLocation.push(locEye)
      rejectedPointXYPx.push(pointXYPx ? [...pointXYPx] : [null, null])
      rejectedLeftEyeFootXYPx.push(formatXYPx(leftEyeFootXYPx))
      rejectedRightEyeFootXYPx.push(formatXYPx(rightEyeFootXYPx))
      rejectedIpdOverWidth.push(roundOrNull(ipdOW, 4))
      rejectedRulerBasedEyesToFootCm.push(roundOrNull(rbEyesFoot, 2))
      rejectedRulerBasedEyesToPointCm.push(roundOrNull(rbEyesPoint, 2))
      rejectedImageBasedEyesToFootCm.push(roundOrNull(ibEyesFoot, 2))
      rejectedImageBasedEyesToPointCm.push(roundOrNull(ibEyesPoint, 2))
      rejectedPreferRightHandBool.push(prefRightBool)
      debugLog('stateManager', `Rejected measurement for ${locEye}`)
    },

    /**
     * Pop the last accepted measurement (retroactive rejection).
     * Legacy: distance.js lines 9134-9145
     */
    retroactivelyRejectPreviousAccepted() {
      acceptedFOverWidth.pop()
      acceptedRatioFOverWidth.pop()
      acceptedLocation.pop()
      acceptedPointXYPx.pop()
      acceptedLeftEyeFootXYPx.pop()
      acceptedRightEyeFootXYPx.pop()
      acceptedIpdOverWidth.pop()
      acceptedRulerBasedEyesToFootCm.pop()
      acceptedRulerBasedEyesToPointCm.pop()
      acceptedImageBasedEyesToFootCm.pop()
      acceptedImageBasedEyesToPointCm.pop()
      acceptedPreferRightHandBool.pop()
      debugLog(
        'stateManager',
        'Retroactively rejected previous accepted measurement',
      )
    },

    /**
     * Push an objectMeasuredMsg entry.
     * Legacy: various lines pushing 'ok', 'short', 'mismatch'
     */
    pushObjectMeasuredMsg(msg) {
      objectMeasuredMsg.push(msg)
    },

    /**
     * Push an objectRulerIntervalCm entry.
     * Legacy: distance.js lines 7214, 8619
     */
    pushObjectRulerIntervalCm(intervalCm) {
      objectRulerIntervalCm.push(intervalCm)
    },

    /**
     * Push tube check estimated length data.
     * Legacy: distance.js lines 8471-8476
     */
    pushEstimatedLength(estimatedCm, ratio) {
      estimatedLengthCm.push(Math.round(estimatedCm * 10) / 10)
      estimatedLengthRatio.push(Math.round(ratio * 1000) / 1000)
    },

    /**
     * Set the matchHalfLengthBool flag.
     * Legacy: distance.js line 7002
     */
    setMatchHalfLengthBool(value) {
      matchHalfLengthBool = value
    },

    /**
     * Get snapshot counts for the final save.
     * Legacy: distance.js lines 9653-9656
     */
    getSnapshotCounts() {
      return {
        snapshotsTakenCount: historyFOverWidth.length,
        snapshotsRejectedCount: rejectedFOverWidth.length,
      }
    },

    /**
     * Build the full common data object matching the legacy shape.
     * This is passed to saveCalibrationMeasurements as the last argument.
     */
    getCommonData() {
      const { snapshotsTakenCount, snapshotsRejectedCount } =
        this.getSnapshotCounts()
      return {
        ...configFields,
        historyPreferRightHandBool: [...historyPreferRightHandBool],
        objectRulerIntervalCm: [...objectRulerIntervalCm],
        objectMeasuredMsg: [...objectMeasuredMsg],
        acceptedFOverWidth: [...acceptedFOverWidth],
        acceptedRatioFOverWidth: [...acceptedRatioFOverWidth],
        acceptedLocation: [...acceptedLocation],
        acceptedPointXYPx: [...acceptedPointXYPx],
        rejectedFOverWidth: [...rejectedFOverWidth],
        rejectedRatioFOverWidth: [...rejectedRatioFOverWidth],
        rejectedLocation: [...rejectedLocation],
        rejectedPointXYPx: [...rejectedPointXYPx],
        historyFOverWidth: [...historyFOverWidth],
        historyEyesToFootCm: [...historyEyesToFootCm],
        acceptedLeftEyeFootXYPx: [...acceptedLeftEyeFootXYPx],
        acceptedRightEyeFootXYPx: [...acceptedRightEyeFootXYPx],
        acceptedIpdOverWidth: [...acceptedIpdOverWidth],
        acceptedRulerBasedEyesToFootCm: [...acceptedRulerBasedEyesToFootCm],
        acceptedRulerBasedEyesToPointCm: [...acceptedRulerBasedEyesToPointCm],
        acceptedImageBasedEyesToFootCm: [...acceptedImageBasedEyesToFootCm],
        acceptedImageBasedEyesToPointCm: [...acceptedImageBasedEyesToPointCm],
        acceptedPreferRightHandBool: [...acceptedPreferRightHandBool],
        rejectedLeftEyeFootXYPx: [...rejectedLeftEyeFootXYPx],
        rejectedRightEyeFootXYPx: [...rejectedRightEyeFootXYPx],
        rejectedIpdOverWidth: [...rejectedIpdOverWidth],
        rejectedRulerBasedEyesToFootCm: [...rejectedRulerBasedEyesToFootCm],
        rejectedRulerBasedEyesToPointCm: [...rejectedRulerBasedEyesToPointCm],
        rejectedImageBasedEyesToFootCm: [...rejectedImageBasedEyesToFootCm],
        rejectedImageBasedEyesToPointCm: [...rejectedImageBasedEyesToPointCm],
        rejectedPreferRightHandBool: [...rejectedPreferRightHandBool],
        matchHalfLengthBool,
        estimatedLengthCm: [...estimatedLengthCm],
        estimatedLengthRatio: [...estimatedLengthRatio],
        snapshotsTaken: snapshotsTakenCount,
        snapshotsRejected: snapshotsRejectedCount,
      }
    },
  }
}
