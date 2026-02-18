/**
 * locationUtils.js
 *
 * Pure utility functions for object-based distance calibration:
 * - Location parsing
 * - Instruction text building with placeholders
 * - Video and arrow positioning for different locations
 * - Consecutive measurement tolerance checking
 */

import { setDefaultVideoPosition } from '../../components/video'

/* ============================================================================
 * VALID LOCATIONS
 * ============================================================================ */

/**
 * Set of all recognised _calibrateDistanceLocations values.
 */
export const VALID_LOCATIONS = new Set([
  'camera',
  'center',
  'topCenter',
  'topOffsetLeft',
  'topOffsetRight',
  'topOffsetDown',
])

/* ============================================================================
 * LOCATION PARSING
 * ============================================================================ */

/**
 * Parse a calibrateDistanceLocations value.
 *
 * Eye is no longer encoded in the location string — it is determined at
 * runtime by the participant's hand-preference choice (preferRightHandBool).
 *
 * @param {string} location - One of the VALID_LOCATIONS values
 * @returns {{location: string}}
 *
 * @example
 * parseLocation('camera')        // { location: 'camera' }
 * parseLocation('topOffsetLeft') // { location: 'topOffsetLeft' }
 */
export function parseLocation(location) {
  if (VALID_LOCATIONS.has(location)) {
    return { location }
  }
  console.error(`Unknown calibrateDistanceLocation value: ${location}`)
  return { location: 'camera' }
}

/**
 * @deprecated Use parseLocation instead. Kept for backward compatibility.
 */
export function parseLocationEye(locEye) {
  const parsed = parseLocation(locEye)
  return { ...parsed, eye: 'unspecified' }
}

/**
 * Parse calibrateDistanceLocations from various input formats into a normalized array.
 * Handles: strings, arrays, and arrays containing comma-separated strings.
 * Validates each value against VALID_LOCATIONS.
 *
 * @param {string|string[]} rawLocations - The raw input from options
 * @returns {string[]} Normalized array of valid location strings
 *
 * @example
 * parseLocationsArray("camera, center, topCenter")
 * // Returns: ["camera", "center", "topCenter"]
 *
 * parseLocationsArray(["topOffsetLeft, topOffsetRight"])
 * // Returns: ["topOffsetLeft", "topOffsetRight"]
 */
export function parseLocationsArray(rawLocations) {
  let parsed
  if (typeof rawLocations === 'string') {
    parsed = rawLocations
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0)
  } else if (Array.isArray(rawLocations)) {
    parsed = rawLocations
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
    parsed = ['camera', 'center']
  }

  // Validate each location; warn about and drop unknown values
  return parsed.filter(loc => {
    if (VALID_LOCATIONS.has(loc)) return true
    console.error(`Unknown calibrateDistanceLocation value "${loc}" — skipping`)
    return false
  })
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
    ? 'RC_UseObjectToSetViewingDistanceToLocationFirstPage'
    : 'RC_UseObjectToSetViewingDistanceToLocationNextPage'
}

/**
 * Build instruction text for a location measurement by replacing placeholders.
 *
 * Placeholders:
 * - [[SSS]] = snapshot type (RC_temporarySnapshot or RC_snapshot based on saveSnapshots)
 * - [[EEE]] = eye phrase (RC_yourRightEye or RC_yourLeftEye based on preferRightHandBool)
 * - [[LLL]] = location phrase (RC_theCameraLocation or RC_theCenterOfLiveVideoLocation)
 * - [[ALIGNOBJECTLOCATIONEYE]] = movie link
 * - [[GLANCEOBJECTLOCATIONEYE]] = movie link
 * - [[SNAPSHOTOBJECTLOCATIONEYE]] = movie link
 * - [[DISTANCEOBJECTLOCATIONEYE]] = movie link
 * @param {string} phraseKey - The i18n phrase key
 * @param {string} location - One of the VALID_LOCATIONS values
 * @param {boolean} preferRightHandBool - True for right hand/eye, false for left
 * @param {boolean} saveSnapshots - Whether snapshots are saved (determines temporary vs permanent)
 * @param {string} language - The language code
 * @param {object} phrasesObj - The phrases object containing all i18n strings
 * @returns {string} The instruction text with placeholders replaced
 */
export function buildLocationInstructions(
  phraseKey,
  location,
  preferRightHandBool,
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

  // Replace [[EEE]] with eye phrase (determined by hand preference)
  const eyePhraseKey = preferRightHandBool
    ? 'RC_yourRightEye'
    : 'RC_yourLeftEye'
  const eyeText = phrasesObj[eyePhraseKey]?.[language] || 'your eye'
  text = text.replace(/\[\[EEE\]\]/g, eyeText)

  // Replace [[LLL]] with location phrase
  let locationPhraseKey
  if (location === 'camera') {
    locationPhraseKey = 'RC_theCameraLocation'
  } else {
    // center, topCenter, topOffsetLeft, topOffsetRight, topOffsetDown
    locationPhraseKey = 'RC_theCenterOfLiveVideoLocation'
  }
  const locationText = phrasesObj[locationPhraseKey]?.[language] || 'the screen'
  text = text.replace(/\[\[LLL\]\]/g, locationText)

  //build movie link based on location, preferRightHandBool, object =tube
  let movieLink = ''
  let movieLinkKey = ''
  const locationKey = location === 'camera' ? 'Camera' : 'Center'
  const eyeKey = preferRightHandBool ? 'RightEye' : 'LeftEye'
  const objectKey = 'Tube'
  movieLinkKey = `RC_MovieAlign${objectKey}${locationKey}${eyeKey}`
  movieLink = phrasesObj[movieLinkKey]?.[language] || ''

  //replace [[ALIGNOBJECTLOCATIONEYE]] with movieLink
  text = text.replace(/\[\[ALIGNOBJECTLOCATIONEYE\]\]/g, movieLink)

  movieLinkKey = `RC_MovieGlance${objectKey}${eyeKey}`
  movieLink = phrasesObj[movieLinkKey]?.[language] || ''
  text = text.replace(/\[\[GLANCEOBJECTEYE\]\]/g, movieLink)

  movieLinkKey = `RC_MovieSnapshot${objectKey}${locationKey}${eyeKey}`
  movieLink = phrasesObj[movieLinkKey]?.[language] || ''
  text = text.replace(/\[\[SNAPSHOTOBJECTLOCATIONEYE\]\]/g, movieLink)

  movieLinkKey = `RC_MovieDistance${objectKey}${locationKey}${eyeKey}`
  movieLink = phrasesObj[movieLinkKey]?.[language] || ''
  text = text.replace(/\[\[DISTANCEOBJECTLOCATIONEYE\]\]/g, movieLink)

  return text
}

/* ============================================================================
 * UI POSITIONING
 * ============================================================================ */

/**
 * Compute the center of the video if it were horizontally centered at the top
 * of the screen. Returns [x, y] in CSS px.
 *
 * @returns {[number, number]}
 */
export function getVideoTopCenterXYPx() {
  const videoContainer = document.getElementById('webgazerVideoContainer')
  const videoHeight = videoContainer
    ? parseInt(videoContainer.style.height) || videoContainer.offsetHeight || 0
    : 0
  return [window.innerWidth / 2, videoHeight / 2]
}

/**
 * Compute the target point [x, y] in CSS px for a given location.
 *
 * @param {string} location - One of the VALID_LOCATIONS values
 * @param {number} [offsetPx=0] - Offset in pixels for topOffset* locations
 * @returns {[number, number]}
 */
export function getPointXYPxForLocation(location, offsetPx = 0) {
  switch (location) {
    case 'camera':
      return [window.innerWidth / 2, 0]
    case 'center':
      return [window.innerWidth / 2, window.innerHeight / 2]
    case 'topCenter': {
      return getVideoTopCenterXYPx()
    }
    case 'topOffsetLeft': {
      const tc = getVideoTopCenterXYPx()
      return [tc[0] - offsetPx, tc[1]]
    }
    case 'topOffsetRight': {
      const tc = getVideoTopCenterXYPx()
      return [tc[0] + offsetPx, tc[1]]
    }
    case 'topOffsetDown': {
      const tc = getVideoTopCenterXYPx()
      return [tc[0], tc[1] + offsetPx]
    }
    default:
      return [window.innerWidth / 2, 0]
  }
}

/**
 * Get the arrow indicator position (in pixels) for a given location.
 *
 * @param {string} location - One of the VALID_LOCATIONS values
 * @param {number} [offsetPx=0] - Offset in pixels for topOffset* locations
 * @returns {[number, number]} The [x, y] pixel coordinates for arrow indicators
 */
export function getArrowPositionForLocation(location, offsetPx = 0) {
  return getPointXYPxForLocation(location, offsetPx)
}

/**
 * Position the video container based on the measurement location.
 *
 * - camera: default top-center (webcam) position
 * - center: screen center
 * - topCenter: horizontally centered, mid point of video
 * - topOffsetLeft/Right/Down: offset from topCenter (mid point of video)
 *
 * @param {object} RC - The RemoteCalibrator instance
 * @param {string} location - One of the VALID_LOCATIONS values
 * @param {number} [offsetPx=0] - Offset in pixels for topOffset* locations
 */
export function positionVideoForLocation(RC, location, offsetPx = 0) {
  const videoContainer = document.getElementById('webgazerVideoContainer')
  if (!videoContainer) return

  const videoWidth =
    parseInt(videoContainer.style.width) || videoContainer.offsetWidth || 0
  const videoHeight =
    parseInt(videoContainer.style.height) || videoContainer.offsetHeight || 0

  if (location === 'camera') {
    delete videoContainer.dataset.screenCenterMode
    setDefaultVideoPosition(RC, videoContainer)
    return
  }

  // All other locations use explicit positioning
  videoContainer.dataset.screenCenterMode = 'true'
  videoContainer.style.zIndex = 999999999999
  videoContainer.style.right = 'unset'
  videoContainer.style.bottom = 'unset'
  videoContainer.style.transform = 'none'

  const pt = getPointXYPxForLocation(location, offsetPx)
  videoContainer.style.left = `${pt[0] - videoWidth / 2}px`
  videoContainer.style.top = `${pt[1] - videoHeight / 2}px`
}

/**
 * Get the global point XY coordinates for face mesh calculation based on location.
 * Uses screen coordinates (window.screen.*) for consistency with the face mesh model.
 *
 * @param {string} location - One of the VALID_LOCATIONS values
 * @param {number} [offsetPx=0] - Offset in pixels for topOffset* locations
 * @returns {[number, number]} The [x, y] coordinates for globalPointXYPx
 */
export function getGlobalPointForLocation(location, offsetPx = 0) {
  switch (location) {
    case 'camera':
      return [window.screen.width / 2, 0]
    case 'center':
      return [window.screen.width / 2, window.screen.height / 2]
    default: {
      // topCenter / topOffset* — use CSS-based calculation mapped to screen coords
      const pt = getPointXYPxForLocation(location, offsetPx)
      return pt
    }
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
 * @param {string} params.locEye - The location string
 * @param {string} params.location - Parsed location
 * @param {boolean} params.preferRightHandBool - Participant hand/eye preference
 * @param {boolean} params.isFirstMeasurement - Whether this is the first measurement
 * @param {boolean} params.saveSnapshots - Whether snapshots are saved
 * @param {object} params.phrasesObj - The phrases object
 * @param {HTMLElement} params.arrowIndicatorsRef - Reference to current arrow indicators
 * @param {function} params.createArrowIndicatorsFn - Function to create arrow indicators
 * @param {HTMLElement} params.background - The background element to append arrows to
 * @param {number} [params.offsetPx=0] - Offset in pixels for topOffset* locations
 * @returns {{arrowIndicators: HTMLElement, instructionText: string, arrowXY: [number, number]}}
 */
export function setupLocationMeasurementUI(params) {
  const {
    RC,
    locationIndex,
    locEye,
    location,
    preferRightHandBool = true,
    isFirstMeasurement,
    saveSnapshots,
    phrasesObj,
    arrowIndicatorsRef,
    createArrowIndicatorsFn,
    background,
    offsetPx = 0,
  } = params

  console.log(
    `=== Setting up measurement for location ${locationIndex}: ${locEye} ===`,
  )
  console.log(
    `  location: ${location}, preferRightHand: ${preferRightHandBool}, isFirst: ${isFirstMeasurement}`,
  )

  // Position video based on location
  positionVideoForLocation(RC, location, offsetPx)

  // Re-position after layout stabilizes
  requestAnimationFrame(() => {
    positionVideoForLocation(RC, location, offsetPx)
    setTimeout(() => positionVideoForLocation(RC, location, offsetPx), 50)
  })

  // Update arrow indicators
  if (arrowIndicatorsRef) {
    arrowIndicatorsRef.remove()
  }
  const arrowXY = getArrowPositionForLocation(location, offsetPx)
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
    preferRightHandBool,
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
