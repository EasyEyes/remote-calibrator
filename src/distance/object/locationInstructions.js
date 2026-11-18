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

// Select the same phrase for preloading and rendering. Older catalogs can
// still use their first available fallback.
export function getMeasurementLocationPhraseKey(phrases, language) {
  return (
    [
      'RC_UseObjectToSetViewingDistanceToLocationFirstPage',
      'RC_UseObjectToSetViewingDistancePage3',
      'RC_UseObjectToSetViewingDistanceStepperPage3',
      'RC_UseObjectToSetViewingDistanceCenterPage4',
      'RC_UseObjectToSetViewingDistanceStepperPage4',
    ].find(key => phrases[key]?.[language]) || ''
  )
}

export function getObjectMeasurementPhraseKey(showLength, firstMeasurement) {
  const tool = showLength ? 'Tape' : 'Ruler'
  return `RC_UseObjectToSetViewingDistance${tool}StepperPage${firstMeasurement ? 1 : 2}`
}
