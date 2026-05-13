/**
 * Score a camera label as built-in / external / unknown.
 *
 * Implementation: Gemini's two-score algorithm. Each label is scanned for
 * built-in signals (laptop / monitor integrations, AIO branding, integrated
 * display vendors) and external signals (clip-on webcam brands, USB / UVC,
 * streaming / conferencing keywords). Whichever score wins by a margin
 * decides the classification; close calls fall through to 'unknown'.
 *
 * Returns `{ score, classification }` where:
 *   - classification is one of 'built-in' | 'external' | 'unknown'
 *   - score = builtInScore - externalScore, clamped so the rest of the
 *     pipeline (which uses `score >= 0` to keep built-in + unknown and
 *     drop externals) stays correct:
 *       built-in  -> score >= 0.5
 *       unknown   -> score == 0
 *       external  -> score <= -0.5
 */

export const classify = score => {
  if (score >= 0.5) return 'built-in'
  if (score < 0) return 'external'
  return 'unknown'
}

const _classifyLabel = (device, allDevices = []) => {
  const label = (device?.label || '').toLowerCase().trim()

  // Continuity Camera / iPhone-as-webcam: separate device, not the Mac built-in.
  if (/iphone/.test(label)) {
    return { decision: 'external', builtInScore: 0, externalScore: 10 }
  }

  let builtInScore = 0
  let externalScore = 0

  // --- BUILT-IN SIGNALS (includes laptop + monitor integrations) ---
  if (/integrated|built[ -]?in|builtin|embedded/.test(label)) builtInScore += 6
  if (/facetime.*camera|studio display/.test(label)) builtInScore += 6
  if (/macbook|imac|surface camera front|surface built-?in/i.test(label))
    builtInScore += 5

  // Display-integrated devices now count as built-in
  if (
    /(display|monitor|screen).*(camera)?/.test(label) ||
    /(camera).*(display|monitor|screen)/.test(label)
  )
    builtInScore += 5

  // Common built-in naming patterns
  if (
    /hd camera|fhd camera|uhd camera|ir camera|full hd|built-in webcam/i.test(
      label,
    )
  )
    builtInScore += 2

  // Laptop & AIO branding with no USB hint -> built-in
  if (
    /(dell|hp|lenovo|asus|acer|msi|huawei|toshiba|samsung).*(camera|webcam)/i.test(
      label,
    ) &&
    !/usb|external/i.test(label)
  )
    builtInScore += 4

  // LG & other integrated-display vendors
  if (
    /lg.*(ultrafine|display)|dell.*ultrasharp|samsung.*display|benq.*display|philips.*monitor|asus.*display/i.test(
      label,
    )
  )
    builtInScore += 5

  // --- EXTERNAL SIGNALS (user-attachable webcams) ---
  if (
    /(logitech|logi\b|brio|streamcam|c9\d{2}|lifecam|razer|kiyo|elgato|facecam|anker|insta360|ausdom|depstech|emeet|papalook|nexigo|avermedia|obsbot|j5create|jabra|vitade|tolulu|trust|creative|tplink|poly|yealink|ptzoptics|insta360 link)/i.test(
      label,
    )
  )
    externalScore += 7

  // Classic external webcam indicators
  if (/usb( ?2\.0| ?3\.0)? camera|generic uvc|uvc camera|webcam/.test(label))
    externalScore += 3

  // External accessories / streaming / conferencing keywords
  if (/capture|hdmi|conference|stream|ptz|mount|tripod|dock/i.test(label))
    externalScore += 3

  // --- AMBIGUOUS ---
  if (/hd camera|fhd camera|full hd/.test(label)) {
    builtInScore += 1
    externalScore += 1
  }
  if (/^camera$|camera$/.test(label)) {
    builtInScore += 0.5
    externalScore += 0.5
  }

  // --- NO LABEL FALLBACK ---
  if (
    !label &&
    allDevices.filter(d => (d.kind || '').includes('videoinput')).length === 1
  ) {
    return { decision: 'built-in', builtInScore, externalScore }
  }

  // --- DECISION RULES ---
  let decision = 'unknown'
  if (builtInScore >= 5 && builtInScore >= externalScore + 2)
    decision = 'built-in'
  else if (externalScore >= 5 && externalScore >= builtInScore + 2)
    decision = 'external'
  else if (builtInScore > externalScore + 2) decision = 'built-in'
  else if (externalScore > builtInScore + 2) decision = 'external'

  return { decision, builtInScore, externalScore }
}

/**
 * Valid values for the `_calibrateDistanceCameraKindOverride` parameter.
 *
 *   'assess'   = classify kind normally based on the camera name (default).
 *   'built-in' = skip assessment, force kind to 'built-in'.
 *   'external' = skip assessment, force kind to 'external'.
 *   'unknown'  = skip assessment, force kind to 'unknown'.
 *
 * FOR TESTING ONLY. When this is set to anything other than 'assess',
 * results should be excluded from camera-kind tabulation downstream.
 */
export const CAMERA_KIND_OVERRIDE_VALUES = [
  'assess',
  'built-in',
  'external',
  'unknown',
]

const _normalizeKindOverride = override => {
  if (typeof override !== 'string') return 'assess'
  const v = override.trim().toLowerCase()
  return CAMERA_KIND_OVERRIDE_VALUES.includes(v) ? v : 'assess'
}

/**
 * Score / classify a camera, honoring the optional kind override.
 *
 * @param {MediaDeviceInfo|Object} device      The camera to classify.
 * @param {Array} allDevices                   Full enumerateDevices() list (for the
 *                                              no-label single-camera fallback).
 * @param {string} [kindOverride='assess']     `_calibrateDistanceCameraKindOverride`.
 *                                              When not 'assess', the label-based
 *                                              assessment is skipped and the kind
 *                                              is forced to the override value.
 */
export const likelyBuiltIn = (device, allDevices = [], kindOverride) => {
  const override = _normalizeKindOverride(kindOverride)

  // Scientist override: skip the label-based classifier entirely. We still
  // return numeric scores consistent with the `score >= 0` filter used
  // downstream (popup.js `_filterCamerasByExternalPolicy`).
  if (override !== 'assess') {
    let score
    if (override === 'built-in') score = 1
    else if (override === 'external') score = -1
    else score = 0
    return {
      score,
      classification: override,
      builtInScore: 0,
      externalScore: 0,
      overrideApplied: true,
    }
  }

  const { decision, builtInScore, externalScore } = _classifyLabel(
    device,
    allDevices,
  )

  // Map decision -> numeric score that is consistent with the
  // `score >= 0` filter used downstream (popup.js
  // `_filterCamerasByExternalPolicy`).
  const margin = builtInScore - externalScore
  let score
  if (decision === 'built-in') score = Math.max(margin, 0.5)
  else if (decision === 'external') score = Math.min(margin, -0.5)
  else score = 0

  return {
    score,
    classification: decision,
    builtInScore,
    externalScore,
    overrideApplied: false,
  }
}
