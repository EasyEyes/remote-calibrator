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
import {
  isBottomCenterCamera,
  getCameraXYPxViewport,
} from '../../components/utils'

/* ============================================================================
 * VALID LOCATIONS
 * ============================================================================ */

/**
 * Set of all recognised _calibrateDistanceLocations values.
 *
 * The legacy `top*` values are top-anchored regardless of where the
 * camera is. They are kept for backwards compatibility during the
 * transition to the new camera-aware `nearCamera*` keywords:
 *
 *   topCenter            -> nearCamera
 *   topOffsetLeft        -> nearCameraOffsetLeft
 *   topOffsetRight       -> nearCameraOffsetRight
 *   topOffsetDown        -> nearCameraOffsetInward
 *   topOffsetInward      -> alias of topOffsetDown (top-only "inward" = down)
 *
 * The `nearCamera*` keywords flip top/bottom based on
 * `RC.selectedCameraRow`: for top-center cameras "near camera" means
 * abutting the top edge; for bottom-center cameras (only possible when
 * `calibrateDistanceAcceptBottomCameraBool === true` AND the participant
 * picked the bottom-row preview) it means abutting the bottom edge.
 * "Inward" always means toward the centre of the screen -- downward for
 * top cameras, upward for bottom cameras.
 */
export const VALID_LOCATIONS = new Set([
  'camera',
  'center',
  // Legacy top-anchored keywords (kept for transition; obsolete).
  'topCenter',
  'topOffsetLeft',
  'topOffsetRight',
  'topOffsetDown',
  'topOffsetInward',
  // New camera-aware keywords.
  'nearCamera',
  'nearCameraOffsetLeft',
  'nearCameraOffsetRight',
  'nearCameraOffsetInward',
])

const _NEAR_CAMERA_LOCATIONS = new Set([
  'nearCamera',
  'nearCameraOffsetLeft',
  'nearCameraOffsetRight',
  'nearCameraOffsetInward',
])

const _isNearCameraLocation = location => _NEAR_CAMERA_LOCATIONS.has(location)

/**
 * Y-coordinate of the camera edge in viewport CSS px:
 *   - 0           for top-center cameras
 *   - innerHeight for bottom-center cameras
 */
const _getCameraEdgeY = RC =>
  isBottomCenterCamera(RC) ? window.innerHeight : 0

/**
 * Y-coordinate of the camera edge in **screen** CSS px (for global /
 * face-mesh calculations).
 */
const _getCameraEdgeYScreen = RC =>
  isBottomCenterCamera(RC) ? window.screen.height : 0

/**
 * Sign that points "inward" (toward the centre of the screen) from the
 * camera edge: +1 (downward) for top cameras, -1 (upward) for bottom
 * cameras.
 */
const _getInwardSign = RC => (isBottomCenterCamera(RC) ? -1 : 1)

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
  console.error(
    `Unknown calibrateDistanceLocation value "${location}". ` +
      `Valid values: ${Array.from(VALID_LOCATIONS).join(', ')}.`,
  )
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

  // Validate each location; warn about and drop unknown values.
  const valid = parsed.filter(loc => {
    if (VALID_LOCATIONS.has(loc)) return true
    console.error(
      `Unknown calibrateDistanceLocation value "${loc}" — skipping. ` +
        `Valid values: ${Array.from(VALID_LOCATIONS).join(', ')}.`,
    )
    return false
  })

  // Safety net: if every value was dropped, fall back to the safe
  // default so downstream code (locationManager / pageController) does
  // not crash on an empty list.
  if (valid.length === 0) {
    console.warn(
      'calibrateDistanceLocations: no valid values, falling back to ["camera", "center"].',
    )
    return ['camera', 'center']
  }

  return valid
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
  return 'RC_UseObjectToSetViewingDistanceToLocationFirstPage'
}

/**
 * Build instruction text for a location measurement by replacing placeholders.
 *
 * Placeholders:
 * - [[SSS]] = snapshot type (RC_temporarySnapshot or RC_snapshot based on saveSnapshots)
 * - [[EEE]] = eye phrase (RC_yourRightEye or RC_yourLeftEye based on preferRightHandBool)
 * - [[RLHAND]] = hand phrase (RC_RightHand or RC_LeftHand based on preferRightHandBool)
 * - [[LLL]] = location phrase (RC_theCameraLocation or RC_theBigCircleLocation)
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

  // Replace [[RLHAND]] with hand phrase (determined by hand preference)
  const handPhraseKey = preferRightHandBool ? 'RC_RightHand' : 'RC_LefttHand'
  const handText =
    phrasesObj[handPhraseKey]?.[language] ||
    (preferRightHandBool ? 'right' : 'left')
  text = text.replace(/\[\[RLHAND\]\]/g, handText)

  // Replace [[LLL]] with location phrase
  let locationPhraseKey
  if (location === 'camera') {
    locationPhraseKey = 'RC_theCameraLocation'
  } else {
    // center, topCenter, topOffsetLeft, topOffsetRight, topOffsetDown
    locationPhraseKey = 'RC_theBigCircleLocation'
  }
  const locationText = phrasesObj[locationPhraseKey]?.[language] || 'the screen'
  text = text.replace(/\[\[LLL\]\]/g, locationText)

  //build movie link based on location, preferRightHandBool, object =tube
  let movieLink = ''
  let movieLinkKey = ''
  const locationKey = location === 'center' ? 'Center' : 'Camera'
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

const BIG_CIRCLE_ID = 'rc-big-circle-target'

/**
 * Convert cm to CSS px using the best available PPI.
 * @param {object} RC - The RemoteCalibrator instance
 * @param {number} cm - Value in centimetres
 * @returns {number} Value in CSS px
 */
function cmToPx(RC, cm) {
  const ppi = RC.screenPpi ? RC.screenPpi.value : RC._CONST.N.PPI_DONT_USE
  return cm * (ppi / 2.54)
}

/**
 * Get the tube diameter in CSS px from the RC instance.
 */
function getTubeDiameterPx(RC) {
  const tubeCm =
    RC._calibrateDistanceTubeDiameterCm ??
    RC._options?.calibrateDistanceTubeDiameterCm ??
    3.5
  return cmToPx(RC, tubeCm)
}

/**
 * Get the video container dimensions (width, height) in CSS px.
 */
function getVideoSizePx() {
  const vc = document.getElementById('webgazerVideoContainer')
  if (!vc) return { w: 0, h: 0 }
  return {
    w: parseInt(vc.style.width) || vc.offsetWidth || 0,
    h: parseInt(vc.style.height) || vc.offsetHeight || 0,
  }
}

/**
 * Create (or update) the big circle DOM element on the inward side of
 * the live video, horizontally centre-aligned with it.
 *
 *   - For legacy `top*` locations (and the default), the circle sits
 *     BELOW the video (legacy behaviour, preserves existing experiments).
 *   - For new `nearCamera*` locations, the circle sits on the inward
 *     side of the video -- BELOW for top-centre cameras, ABOVE for
 *     bottom-centre cameras.
 *
 * Position is computed from the known video-centre point rather than
 * reading getBoundingClientRect, so it is always correct even before
 * the browser has re-laid-out the video container.
 *
 * @param {object}  RC       - The RemoteCalibrator instance
 * @param {[number,number]} videoCenterPt - [x,y] CSS-px centre of the video
 * @param {string}  [location=null] - location keyword (controls top/bottom side)
 * @param {number}  [gapPx=4] - Gap between video edge and circle edge
 * @returns {HTMLElement} The big-circle element
 */
function ensureBigCircle(RC, videoCenterPt, location = null, gapPx = 4) {
  const diameterPx = getTubeDiameterPx(RC)
  const { h: videoH } = getVideoSizePx()
  const inward = _isNearCameraLocation(location) ? _getInwardSign(RC) : 1

  let el = document.getElementById(BIG_CIRCLE_ID)
  if (!el) {
    el = document.createElement('div')
    el.id = BIG_CIRCLE_ID
    el.style.position = 'fixed'
    el.style.pointerEvents = 'none'
    el.style.border = 'none'
    el.style.outline = '2px solid black'
    el.style.outlineOffset = '-1px'
    el.style.borderRadius = '50%'
    el.style.zIndex = '999999999999'
    document.body.appendChild(el)
  }

  el.style.width = `${diameterPx}px`
  el.style.height = `${diameterPx}px`

  // Circle abuts the inward edge of the video.
  const videoInwardEdgeY = videoCenterPt[1] + inward * (videoH / 2)
  const cy = videoInwardEdgeY + inward * (gapPx + diameterPx / 2)
  el.style.left = `${videoCenterPt[0] - diameterPx / 2}px`
  el.style.top = `${cy - diameterPx / 2}px`

  el.style.display = 'block'
  return el
}

/**
 * Return the centre [x, y] in CSS px of the big circle for a given
 * video-centre point and location keyword.
 *
 * Same flip rule as `ensureBigCircle`: legacy `top*` keywords keep the
 * circle below the video; new `nearCamera*` keywords place it on the
 * inward side (above for bottom-centre cameras).
 */
function getBigCircleCenterXYPx(RC, videoCenterPt, location = null) {
  const diameterPx = getTubeDiameterPx(RC)
  const { h: videoH } = getVideoSizePx()
  const gapPx = 4
  const inward = _isNearCameraLocation(location) ? _getInwardSign(RC) : 1
  const videoInwardEdgeY = videoCenterPt[1] + inward * (videoH / 2)
  const cy = videoInwardEdgeY + inward * (gapPx + diameterPx / 2)
  return [videoCenterPt[0], cy]
}

/**
 * Hide and remove the big circle from the DOM.
 */
export function removeBigCircle() {
  const el = document.getElementById(BIG_CIRCLE_ID)
  if (el) el.remove()
}

/**
 * Compute the centre of the video if it were horizontally centered at
 * the **top** of the screen. Returns [x, y] in CSS px. Used by the
 * legacy `top*` keywords so they keep their original behaviour.
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
 * Compute the centre of the video if it were horizontally centered and
 * abutting the camera edge of the screen (top edge for top-centre
 * cameras, bottom edge for bottom-centre cameras). Returns [x, y] in
 * CSS px. Used by the new `nearCamera*` keywords.
 */
export function getVideoNearCameraXYPx(RC) {
  const videoContainer = document.getElementById('webgazerVideoContainer')
  const videoHeight = videoContainer
    ? parseInt(videoContainer.style.height) || videoContainer.offsetHeight || 0
    : 0
  const inward = _getInwardSign(RC)
  const cameraEdgeY = _getCameraEdgeY(RC)
  return [window.innerWidth / 2, cameraEdgeY + inward * (videoHeight / 2)]
}

/**
 * Compute the video-centre point [x, y] in CSS px for a given location.
 * This is used internally to position the video container.
 *
 * @param {string} location - One of the VALID_LOCATIONS values
 * @param {number} [offsetPx=0] - Offset in pixels for offset locations
 * @param {object} [RC=null]    - RemoteCalibrator instance (controls
 *   top vs bottom anchoring for the new `nearCamera*` keywords)
 * @returns {[number, number]}
 */
function getVideoPointForLocation(location, offsetPx = 0, RC = null) {
  switch (location) {
    case 'camera':
      // Camera-aware: top-edge for top cameras, bottom-edge for bottom.
      return [window.innerWidth / 2, _getCameraEdgeY(RC)]
    case 'center':
      return [window.innerWidth / 2, window.innerHeight / 2]

    // ---- Legacy top-anchored keywords (kept for backwards compat) ----
    case 'topCenter':
      return getVideoTopCenterXYPx()
    case 'topOffsetLeft': {
      const tc = getVideoTopCenterXYPx()
      return [tc[0] - offsetPx, tc[1]]
    }
    case 'topOffsetRight': {
      const tc = getVideoTopCenterXYPx()
      return [tc[0] + offsetPx, tc[1]]
    }
    case 'topOffsetDown':
    // For top-anchored "inward" means down (same as topOffsetDown).
    case 'topOffsetInward': {
      const tc = getVideoTopCenterXYPx()
      return [tc[0], tc[1] + offsetPx]
    }

    // ---- New camera-aware keywords ----
    case 'nearCamera':
      return getVideoNearCameraXYPx(RC)
    case 'nearCameraOffsetLeft': {
      const nc = getVideoNearCameraXYPx(RC)
      return [nc[0] - offsetPx, nc[1]]
    }
    case 'nearCameraOffsetRight': {
      const nc = getVideoNearCameraXYPx(RC)
      return [nc[0] + offsetPx, nc[1]]
    }
    case 'nearCameraOffsetInward': {
      const nc = getVideoNearCameraXYPx(RC)
      // "Inward" = toward screen centre. Down for top cameras (+1),
      // up for bottom cameras (-1).
      return [nc[0], nc[1] + offsetPx * _getInwardSign(RC)]
    }

    default:
      return [window.innerWidth / 2, _getCameraEdgeY(RC)]
  }
}

/**
 * Compute the measurement target point [x, y] in CSS px for a given
 * location.
 *
 * For 'camera' the target is the centre of the camera edge of the
 * screen (top-centre for top cameras, bottom-centre for bottom cameras).
 * For every other location the target is the centre of the big circle
 * drawn next to the live video (below for legacy `top*` keywords;
 * inward of the video for `nearCamera*` keywords).
 *
 * @param {string} location - One of the VALID_LOCATIONS values
 * @param {number} [offsetPx=0] - Offset in pixels for offset locations
 * @param {object} [RC=null]    - RemoteCalibrator instance (needed for non-camera)
 * @returns {[number, number]}
 */
export function getPointXYPxForLocation(location, offsetPx = 0, RC = null) {
  if (location === 'camera') {
    return [window.innerWidth / 2, _getCameraEdgeY(RC)]
  }
  const videoPt = getVideoPointForLocation(location, offsetPx, RC)
  if (RC) {
    return getBigCircleCenterXYPx(RC, videoPt, location)
  }
  return videoPt
}

/**
 * Get the arrow indicator position (in pixels) for a given location.
 *
 * @param {string} location - One of the VALID_LOCATIONS values
 * @param {number} [offsetPx=0] - Offset in pixels for offset locations
 * @param {object} [RC=null]    - RemoteCalibrator instance
 * @returns {[number, number]} The [x, y] pixel coordinates for arrow indicators
 */
export function getArrowPositionForLocation(location, offsetPx = 0, RC = null) {
  return getPointXYPxForLocation(location, offsetPx, RC)
}

/**
 * Position the video container based on the measurement location.
 *
 *   - camera: default position (top-centre for top cameras,
 *     bottom-centre for bottom cameras).
 *   - center: screen centre.
 *   - topCenter / topOffset{Left,Right,Down,Inward}: legacy
 *     top-anchored, video sits abutting the top edge.
 *   - nearCamera / nearCameraOffset{Left,Right,Inward}:
 *     camera-aware, video abuts the camera edge of the screen.
 *
 * For non-camera locations a big circle is also drawn next to the video
 * (below for legacy `top*`, on the inward side for `nearCamera*`).
 *
 * @param {object} RC - The RemoteCalibrator instance
 * @param {string} location - One of the VALID_LOCATIONS values
 * @param {number} [offsetPx=0] - Offset in pixels for offset locations
 */
export function positionVideoForLocation(RC, location, offsetPx = 0) {
  const videoContainer = document.getElementById('webgazerVideoContainer')
  if (!videoContainer) return

  const videoWidth =
    parseInt(videoContainer.style.width) || videoContainer.offsetWidth || 0
  const videoHeight =
    parseInt(videoContainer.style.height) || videoContainer.offsetHeight || 0

  if (location === 'camera') {
    // Prevent setDefaultVideoPosition's resize handler from overriding
    // this explicit positioning (same guard used by non-camera locations).
    videoContainer.dataset.screenCenterMode = 'true'
    delete videoContainer.dataset.cameraMode

    if (videoContainer._resizeHandler) {
      window.removeEventListener('resize', videoContainer._resizeHandler)
      videoContainer._resizeHandler = null
      videoContainer._hasResizeListener = false
    }

    const cameraXYPx = getCameraXYPxViewport(RC)
    const centerY = window.innerHeight / 2
    const cameraAtTopBool = cameraXYPx[1] < centerY

    videoContainer.style.zIndex = 999999999999
    videoContainer.style.position = 'fixed'
    videoContainer.style.transform = 'none'
    videoContainer.style.right = 'unset'
    videoContainer.style.left = `${cameraXYPx[0] - videoWidth / 2}px`

    if (cameraAtTopBool) {
      videoContainer.style.top = '0px'
      videoContainer.style.bottom = 'unset'
    } else {
      videoContainer.style.top = 'unset'
      videoContainer.style.bottom = '0px'
    }

    removeBigCircle()
    return
  }

  // All other locations use explicit positioning.
  videoContainer.dataset.screenCenterMode = 'true'
  videoContainer.style.zIndex = 999999999999
  videoContainer.style.right = 'unset'
  videoContainer.style.bottom = 'unset'
  videoContainer.style.transform = 'none'

  const pt = getVideoPointForLocation(location, offsetPx, RC)
  videoContainer.style.left = `${pt[0] - videoWidth / 2}px`
  videoContainer.style.top = `${pt[1] - videoHeight / 2}px`

  // Show the big circle next to the video. For legacy `top*` keywords
  // it sits BELOW; for new `nearCamera*` keywords it sits on the
  // INWARD side (above the video for bottom-centre cameras).
  ensureBigCircle(RC, pt, location)
}

/**
 * Get the global point XY coordinates for face mesh calculation based on location.
 * Uses screen coordinates (window.screen.*) for consistency with the face mesh model.
 *
 * For 'camera' → centre of the camera edge of the screen
 * (top-centre for top cameras, bottom-centre for bottom cameras).
 * For all others → centre of the big circle next to the video
 * (below for legacy `top*`, inward for `nearCamera*`).
 *
 * @param {string} location - One of the VALID_LOCATIONS values
 * @param {number} [offsetPx=0] - Offset in pixels for offset locations
 * @param {object} [RC=null]   - RemoteCalibrator instance
 * @returns {[number, number]} The [x, y] coordinates for globalPointXYPx
 */
export function getGlobalPointForLocation(location, offsetPx = 0, RC = null) {
  if (location === 'camera') {
    return [window.screen.width / 2, _getCameraEdgeYScreen(RC)]
  }
  const videoPt = getVideoPointForLocation(location, offsetPx, RC)
  if (RC) {
    return getBigCircleCenterXYPx(RC, videoPt, location)
  }
  return videoPt
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
  const arrowXY = getArrowPositionForLocation(location, offsetPx, RC)
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
 * Acceptance uses rounded integer percentages:
 *   Math.round(100/T) <= Math.round(100*R) <= Math.round(100*T)
 * where R = current / previous and T = allowedRatio.
 *
 * @param {number} currentFOverWidth - Current measurement's fOverWidth
 * @param {number|null} previousFOverWidth - Previous measurement's fOverWidth (null for first)
 * @param {number} allowedRatio - The allowed ratio threshold (e.g., 1.15)
 * @returns {{pass: boolean, ratio: number|null, roundedPercent: number|null, lower: number, upper: number}}
 */
export function checkConsecutiveMeasurementTolerance(
  currentFOverWidth,
  previousFOverWidth,
  allowedRatio,
) {
  const lower = Math.round(100 / allowedRatio)
  const upper = Math.round(100 * allowedRatio)

  if (previousFOverWidth === null || previousFOverWidth === undefined) {
    return {
      pass: true,
      ratio: null,
      roundedPercent: null,
      lower,
      upper,
    }
  }

  const ratio = currentFOverWidth / previousFOverWidth
  const roundedPercent = Math.round(100 * ratio)
  const pass = roundedPercent >= lower && roundedPercent <= upper

  console.log(
    `Tolerance check: current=${currentFOverWidth}, previous=${previousFOverWidth}`,
  )
  console.log(
    `  rounded ratio: ${roundedPercent}%, interval: [${lower}%, ${upper}%], pass: ${pass}`,
  )

  return { pass, ratio, roundedPercent, lower, upper }
}
