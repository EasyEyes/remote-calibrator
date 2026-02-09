/**
 * locationUtils.js
 *
 * Pure utility functions for object-based distance calibration:
 * - Location/eye parsing
 * - Instruction text building with placeholders
 * - Video and arrow positioning for different locations
 * - Consecutive measurement tolerance checking
 */

import { setDefaultVideoPosition } from '../../components/video'

/* ============================================================================
 * LOCATION PARSING
 * ============================================================================ */

/**
 * Parse a calibrateDistanceLocations value into separate location and eye components.
 *
 * @param {string} locEye - One of: 'camera', 'cameraLeftEye', 'cameraRightEye',
 *                          'center', 'centerLeftEye', 'centerRightEye'
 * @returns {{location: 'camera'|'center', eye: 'unspecified'|'left'|'right'}}
 *
 * @example
 * parseLocationEye('cameraLeftEye')  // { location: 'camera', eye: 'left' }
 * parseLocationEye('center')         // { location: 'center', eye: 'unspecified' }
 */
export function parseLocationEye(locEye) {
  switch (locEye) {
    case 'camera':
      return { location: 'camera', eye: 'unspecified' }
    case 'cameraLeftEye':
      return { location: 'camera', eye: 'left' }
    case 'cameraRightEye':
      return { location: 'camera', eye: 'right' }
    case 'center':
      return { location: 'center', eye: 'unspecified' }
    case 'centerLeftEye':
      return { location: 'center', eye: 'left' }
    case 'centerRightEye':
      return { location: 'center', eye: 'right' }
    default:
      console.error(`Unknown calibrateDistanceLocation value: ${locEye}`)
      // Fall back to unspecified camera as a safe default
      return { location: 'camera', eye: 'unspecified' }
  }
}

/**
 * Parse calibrateDistanceLocations from various input formats into a normalized array.
 * Handles: strings, arrays, and arrays containing comma-separated strings.
 *
 * @param {string|string[]} rawLocations - The raw input from options
 * @returns {string[]} Normalized array of location strings
 *
 * @example
 * parseLocationsArray("cameraLeftEye, cameraRightEye, center")
 * // Returns: ["cameraLeftEye", "cameraRightEye", "center"]
 *
 * parseLocationsArray(["cameraLeftEye, cameraRightEye"])
 * // Returns: ["cameraLeftEye", "cameraRightEye"]
 */
export function parseLocationsArray(rawLocations) {
  if (typeof rawLocations === 'string') {
    // Parse comma-separated string into array, trim whitespace
    return rawLocations
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0)
  } else if (Array.isArray(rawLocations)) {
    // Flatten array: split any comma-separated strings within the array
    return rawLocations
      .flatMap(item =>
        typeof item === 'string'
          ? item
              .split(',')
              .map(s => s.trim())
              .filter(s => s.length > 0)
          : item,
      )
      .filter(s => s && s.length > 0)
  } else {
    // Default fallback
    return ['camera', 'center']
  }
}

/* ============================================================================
 * INSTRUCTION TEXT BUILDING
 * ============================================================================ */

/**
 * Get the appropriate instruction phrase key based on whether this is the first measurement.
 *
 * @param {boolean} isFirstMeasurement - True if this is the first location measurement
 * @returns {string} The phrase key to use
 */
export function getLocationInstructionPhraseKey(isFirstMeasurement) {
  return isFirstMeasurement
    ? 'RC_UseObjectToSetViewingDistanceToLocationPage3'
    : 'RC_UseObjectToSetViewingDistanceToLocationPage4'
}

/**
 * Build instruction text for a location measurement by replacing placeholders.
 *
 * Placeholders:
 * - [[SSS]] = snapshot type (RC_temporarySnapshot or RC_snapshot based on saveSnapshots)
 * - [[EEE]] = eye phrase (RC_yourEye, RC_yourLeftEye, or RC_yourRightEye)
 * - [[LLL]] = location phrase (RC_theCameraLocation or RC_theCenterLocation)
 *
 * @param {string} phraseKey - The i18n phrase key
 * @param {string} location - 'camera' or 'center'
 * @param {string} eye - 'unspecified', 'left', or 'right'
 * @param {boolean} saveSnapshots - Whether snapshots are saved (determines temporary vs permanent)
 * @param {string} language - The language code
 * @param {object} phrasesObj - The phrases object containing all i18n strings
 * @returns {string} The instruction text with placeholders replaced
 */
export function buildLocationInstructions(
  phraseKey,
  location,
  eye,
  saveSnapshots,
  language,
  phrasesObj,
) {
  let text = phrasesObj[phraseKey]?.[language] || ''

  if (!text) {
    console.warn(`Phrase not found: ${phraseKey} for language ${language}`)
    return ''
  }

  // Replace [[SSS]] with snapshot type
  const snapshotPhraseKey = saveSnapshots
    ? 'RC_snapshot'
    : 'RC_temporarySnapshot'
  const snapshotText = phrasesObj[snapshotPhraseKey]?.[language] || 'snapshot'
  text = text.replace(/\[\[SSS\]\]/g, snapshotText)

  // Replace [[EEE]] with eye phrase
  let eyePhraseKey
  switch (eye) {
    case 'left':
      eyePhraseKey = 'RC_yourLeftEye'
      break
    case 'right':
      eyePhraseKey = 'RC_yourRightEye'
      break
    default: // 'unspecified'
      eyePhraseKey = 'RC_yourEye'
      break
  }
  const eyeText = phrasesObj[eyePhraseKey]?.[language] || 'your eye'
  text = text.replace(/\[\[EEE\]\]/g, eyeText)

  // Replace [[LLL]] with location phrase
  const locationPhraseKey =
    location === 'camera' ? 'RC_theCameraLocation' : 'RC_theCenterLocation'
  const locationText = phrasesObj[locationPhraseKey]?.[language] || 'the screen'
  text = text.replace(/\[\[LLL\]\]/g, locationText)

  return text
}

/* ============================================================================
 * UI POSITIONING
 * ============================================================================ */

/**
 * Get the arrow indicator position (in pixels) for a given location.
 *
 * @param {string} location - 'camera' or 'center'
 * @returns {[number, number]} The [x, y] pixel coordinates for arrow indicators
 */
export function getArrowPositionForLocation(location) {
  if (location === 'camera') {
    // Top center of screen (camera position)
    return [window.screen.width / 2, 0]
  } else {
    // Center of screen
    return [window.innerWidth / 2, window.innerHeight / 2]
  }
}

/**
 * Position the video container based on the measurement location.
 *
 * @param {object} RC - The RemoteCalibrator instance
 * @param {string} location - 'camera' or 'center'
 */
export function positionVideoForLocation(RC, location) {
  const videoContainer = document.getElementById('webgazerVideoContainer')
  if (!videoContainer) return

  if (location === 'camera') {
    // Video at the top-center (default position)
    delete videoContainer.dataset.screenCenterMode
    setDefaultVideoPosition(RC, videoContainer)
  } else {
    // Video at the screen center
    videoContainer.dataset.screenCenterMode = 'true'

    const videoWidth =
      parseInt(videoContainer.style.width) || videoContainer.offsetWidth || 0
    const videoHeight =
      parseInt(videoContainer.style.height) || videoContainer.offsetHeight || 0

    const centerX =
      (window.innerWidth || document.documentElement.clientWidth) / 2
    const centerY =
      (window.innerHeight || document.documentElement.clientHeight) / 2

    videoContainer.style.zIndex = 999999999999
    videoContainer.style.left = `${centerX - videoWidth / 2}px`
    videoContainer.style.top = `${centerY - videoHeight / 2}px`
    videoContainer.style.right = 'unset'
    videoContainer.style.bottom = 'unset'
    videoContainer.style.transform = 'none'
  }
}

/**
 * Get the global point XY coordinates for face mesh calculation based on location.
 *
 * @param {string} location - 'camera' or 'center'
 * @returns {[number, number]} The [x, y] coordinates for globalPointXYPx
 */
export function getGlobalPointForLocation(location) {
  if (location === 'camera') {
    return [window.screen.width / 2, 0]
  } else {
    return [window.screen.width / 2, window.screen.height / 2]
  }
}

/* ============================================================================
 * MEASUREMENT UI SETUP
 * ============================================================================ */

/**
 * Set up the UI for a location measurement page.
 * This handles video positioning, arrow indicators, and instructions.
 *
 * @param {object} params - Configuration object
 * @param {object} params.RC - The RemoteCalibrator instance
 * @param {number} params.locationIndex - Index in calibrateDistanceLocations array
 * @param {string} params.locEye - The raw location-eye string (e.g., 'cameraLeftEye')
 * @param {string} params.location - Parsed location ('camera' or 'center')
 * @param {string} params.eye - Parsed eye ('unspecified', 'left', or 'right')
 * @param {boolean} params.isFirstMeasurement - Whether this is the first measurement
 * @param {boolean} params.saveSnapshots - Whether snapshots are saved
 * @param {object} params.phrasesObj - The phrases object
 * @param {HTMLElement} params.arrowIndicatorsRef - Reference to current arrow indicators
 * @param {function} params.createArrowIndicatorsFn - Function to create arrow indicators
 * @param {HTMLElement} params.background - The background element to append arrows to
 * @returns {{arrowIndicators: HTMLElement, instructionText: string, arrowXY: [number, number]}}
 */
export function setupLocationMeasurementUI(params) {
  const {
    RC,
    locationIndex,
    locEye,
    location,
    eye,
    isFirstMeasurement,
    saveSnapshots,
    phrasesObj,
    arrowIndicatorsRef,
    createArrowIndicatorsFn,
    background,
  } = params

  console.log(
    `=== Setting up measurement for location ${locationIndex}: ${locEye} ===`,
  )
  console.log(
    `  location: ${location}, eye: ${eye}, isFirst: ${isFirstMeasurement}`,
  )

  // Position video based on location
  positionVideoForLocation(RC, location)

  // Re-position after layout stabilizes
  requestAnimationFrame(() => {
    positionVideoForLocation(RC, location)
    setTimeout(() => positionVideoForLocation(RC, location), 50)
  })

  // Update arrow indicators
  if (arrowIndicatorsRef) {
    arrowIndicatorsRef.remove()
  }
  const arrowXY = getArrowPositionForLocation(location)
  const newArrows = createArrowIndicatorsFn(arrowXY)
  if (newArrows && background) {
    background.appendChild(newArrows)
  }
  console.log(`  Arrow indicators pointing to [${arrowXY[0]}, ${arrowXY[1]}]`)

  // Build instruction text (using new location-aware phrases if available)
  const phraseKey = getLocationInstructionPhraseKey(isFirstMeasurement)
  const instructionText = buildLocationInstructions(
    phraseKey,
    location,
    eye,
    saveSnapshots,
    RC.L,
    phrasesObj,
  )

  console.log(`  Phrase key: ${phraseKey}`)
  console.log(`  Instruction text length: ${instructionText.length}`)

  return {
    arrowIndicators: newArrows,
    instructionText: instructionText,
    arrowXY: arrowXY,
  }
}

/* ============================================================================
 * TOLERANCE CHECKING
 * ============================================================================ */

/**
 * Check if current measurement passes tolerance with previous measurement.
 * Uses the formula: abs(log10(current / previous)) <= log10(allowedRatio)
 *
 * @param {number} currentFOverWidth - Current measurement's fOverWidth
 * @param {number|null} previousFOverWidth - Previous measurement's fOverWidth (null for first)
 * @param {number} allowedRatio - The allowed ratio threshold (e.g., 1.15)
 * @returns {{pass: boolean, ratio: number|null, logRatio: number|null, logThreshold: number}}
 */
export function checkConsecutiveMeasurementTolerance(
  currentFOverWidth,
  previousFOverWidth,
  allowedRatio,
) {
  if (previousFOverWidth === null || previousFOverWidth === undefined) {
    // First measurement - always passes
    return {
      pass: true,
      ratio: null,
      logRatio: null,
      logThreshold: Math.log10(allowedRatio),
    }
  }

  const logRatio = Math.abs(Math.log10(currentFOverWidth / previousFOverWidth))
  const logThreshold = Math.log10(allowedRatio)
  const pass = logRatio <= logThreshold
  const ratio = currentFOverWidth / previousFOverWidth

  console.log(
    `Tolerance check: current=${currentFOverWidth}, previous=${previousFOverWidth}`,
  )
  console.log(
    `  log ratio: ${logRatio.toFixed(4)}, threshold: ${logThreshold.toFixed(4)}, pass: ${pass}`,
  )

  return { pass, ratio, logRatio, logThreshold }
}
