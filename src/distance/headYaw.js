/**
 * Head orientation estimation from FaceMesh landmarks (pitch and yaw).
 *
 * Uses the offset of the nose tip (landmark 1) relative to the midpoint
 * of the two eye centers to estimate both pitch (nodding) and yaw (turning)
 * of the head, relative to facing the camera.
 *
 * The nose-tip-to-eye-midpoint vector is decomposed in a head-relative
 * coordinate frame defined by the interocular axis:
 *   - Component along the interocular axis       → yaw  (left/right turn)
 *   - Component perpendicular, in the image plane → pitch (up/down nod)
 *
 * When the head faces the camera straight on, the nose tip projects
 * directly below the eye midpoint (zero lateral shift → yaw ≈ 0).
 * Turning the head shifts the nose tip laterally; nodding changes the
 * perpendicular distance.
 *
 * The 3D nose protrusion (distance from eye midpoint to nose tip along
 * the face-forward axis) is approximately constant for a given person
 * and serves as the reference length for both angles.
 *
 * From the yaw we derive the IPD shrinkage correction:
 *   ipdShrinkage = cos(yaw)
 * and the corrected IPD ratio:
 *   ipdOverWidth_corrected = ipdOverWidth_measured / ipdShrinkage
 *
 * Pitch does not affect IPD but is useful diagnostic data.
 */

/**
 * Normalize calibrateDistanceCorrectForHeadRotation into a boolean used to
 * decide whether head-yaw correction should be applied.
 *
 * Accepted inputs:
 *   - string: 'none' | 'useZ'  (case-insensitive)
 *   - boolean / undefined: kept for backwards compatibility
 *
 * Returns true when correction should be applied (i.e. 'useZ' or truthy).
 */
export const isHeadRotationCorrectionEnabled = value => {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') {
    return value.toLowerCase() !== 'none'
  }
  return !!value
}

/**
 * Estimate head pitch and yaw from FaceMesh keypoints, relative to
 * facing the camera. No calibration required.
 *
 * @param {Object[]} mesh - FaceMesh keypoints array (468+ landmarks).
 *   Each element has .x, .y (normalized 0..1 or pixel-scale).
 * @param {Object} leftEye  - {x, y} of left eye center.
 * @param {Object} rightEye - {x, y} of right eye center.
 * @param {boolean|string} calibrateDistanceCorrectForHeadRotation
 *   'none' / false disables the correction; 'useZ' / true enables it.
 * @returns {{
 *   yawDeg: number,
 *   pitchDeg: number,
 *   ipdShrinkage: number
 * }}
 *   yawDeg: positive = head turned to subject's right (nose moves camera-left).
 *   pitchDeg: positive = head tilted up (nose moves down in image).
 *   ipdShrinkage: cos(yaw), clamped to [0.5, 1].
 */
export const estimateHeadYaw = (
  mesh,
  leftEye,
  rightEye,
  calibrateDistanceCorrectForHeadRotation = true,
) => {
  const correctionEnabled = isHeadRotationCorrectionEnabled(
    calibrateDistanceCorrectForHeadRotation,
  )
  if (!mesh || !mesh[1] || !leftEye || !rightEye || !correctionEnabled) {
    return { yawDeg: 0, pitchDeg: 0, ipdShrinkage: 1 }
  }

  const noseTip = mesh[1]
  const eyeMidX = (leftEye.x + rightEye.x) / 2
  const eyeMidY = (leftEye.y + rightEye.y) / 2

  const ipdNorm = Math.hypot(leftEye.x - rightEye.x, leftEye.y - rightEye.y)
  if (ipdNorm < 1e-6) {
    return { yawDeg: 0, pitchDeg: 0, ipdShrinkage: 1 }
  }

  // Build a 2D head-relative frame from the interocular axis.
  // "along" = unit vector along interocular axis (left-eye → right-eye).
  // "perp"  = unit vector perpendicular to it, pointing roughly downward
  //           in the image (toward nose when head is upright).
  const ipdDx = rightEye.x - leftEye.x
  const ipdDy = rightEye.y - leftEye.y
  const alongX = ipdDx / ipdNorm
  const alongY = ipdDy / ipdNorm
  const perpX = -ipdDy / ipdNorm
  const perpY = ipdDx / ipdNorm

  const noseDx = noseTip.x - eyeMidX
  const noseDy = noseTip.y - eyeMidY

  // Lateral shift: component of nose offset along the interocular axis.
  // Non-zero when head is turned left or right (yaw).
  const lateralShift = noseDx * alongX + noseDy * alongY

  // Forward projection: component perpendicular to the interocular axis.
  // This is the image-plane projection of the nose protrusion; it
  // shortens with pitch (and slightly with extreme yaw).
  const forwardProjection = noseDx * perpX + noseDy * perpY
  const absForward = Math.abs(forwardProjection)

  // ── Yaw ──────────────────────────────────────────────────────────────
  // lateralShift ≈ noseProtrusion * sin(yaw)
  // absForward   ≈ noseProtrusion * cos(yaw) * cos(pitch)
  //
  // At moderate pitch the cos(pitch) factor is close to 1, so:
  //   yaw ≈ atan2(lateralShift, absForward)
  //
  // Clamp absForward to avoid singularities at extreme angles.
  const minForward = 0.15 * ipdNorm
  const safeForward = Math.max(absForward, minForward)

  const yawRad = Math.atan2(lateralShift, safeForward)
  const yawDeg = yawRad * (180 / Math.PI)

  // ── Pitch ────────────────────────────────────────────────────────────
  // When the head is straight, the nose-to-eye-midpoint distance in the
  // perpendicular direction equals noseProtrusion * cos(pitch).
  // We need a reference for the "full" nose protrusion.  The total 2D
  // nose-to-eye-midpoint distance when yaw ≈ 0 is a good proxy:
  //   noseDistTotal = hypot(lateralShift, forwardProjection)
  //                 ≈ noseProtrusion * hypot(sin(yaw), cos(yaw)*cos(pitch))
  // For pitch estimation we use the sign of forwardProjection
  // (positive = nose below eyes = head upright/tilted back, negative =
  // nose above eyes = head bowed forward).
  //
  // Estimate noseProtrusion from the total distance, then:
  //   cos(pitch) ≈ forwardProjection / (noseProtrusion * cos(yaw))
  const noseDist2D = Math.hypot(lateralShift, forwardProjection)
  const noseProtrusionEst = Math.max(noseDist2D, minForward)
  const cosYaw = Math.cos(yawRad)
  const cosPitchRaw = forwardProjection / (noseProtrusionEst * cosYaw)
  const cosPitchClamped = Math.max(-1, Math.min(1, cosPitchRaw))
  // forwardProjection is positive when the nose is "below" the eye
  // midpoint in the head-relative perpendicular direction (normal
  // upright pose).  As the head pitches up (chin rises, nose drops
  // further), forwardProjection increases.  As the head bows down,
  // forwardProjection decreases toward zero and then goes negative.
  // We define positive pitch = head tilted up.
  const pitchRad = Math.acos(cosPitchClamped)
  const pitchSign = forwardProjection >= 0 ? 1 : -1
  const pitchDeg = pitchSign * pitchRad * (180 / Math.PI)

  // ── IPD shrinkage ────────────────────────────────────────────────────
  const ipdShrinkage = Math.cos(yawRad)

  return {
    yawDeg,
    pitchDeg,
    ipdShrinkage: Math.max(ipdShrinkage, 0.5),
  }
}

const symmetricPairs = [
  [33, 263],
  [133, 362],
  [159, 386],
  [145, 374],
]

const median = arr => {
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : 0.5 * (s[m - 1] + s[m])
}

export const estimateHeadYawRobust = (
  mesh,
  leftEye,
  rightEye,
  calibrateDistanceCorrectForHeadRotation = true,
) => {
  const correctionEnabled = isHeadRotationCorrectionEnabled(
    calibrateDistanceCorrectForHeadRotation,
  )
  if (!correctionEnabled || !mesh) {
    return { yawDeg: 0, ipdShrinkage: 1 }
  }

  const shrinkages = []
  const yaws = []

  for (const [li, ri] of symmetricPairs) {
    const L = mesh[li]
    const R = mesh[ri]
    if (!L || !R) continue

    const dx = L.x - R.x
    const dy = L.y - R.y
    const dz = L.z - R.z

    const len2D = Math.hypot(dx, dy)
    const len3D = Math.hypot(dx, dy, dz)

    if (len2D < 1e-6 || len3D < 1e-6) continue

    shrinkages.push(len2D / len3D)
    yaws.push((Math.atan2(dz, len2D) * 180) / Math.PI)
  }

  if (!shrinkages.length) {
    return { yawDeg: 0, ipdShrinkage: 1 }
  }

  return {
    yawDeg: median(yaws),
    ipdShrinkage: Math.max(Math.min(median(shrinkages), 1), 0.5),
  }
}

/**
 * Apply IPD shrinkage correction to a measured IPD-over-width ratio.
 *
 * @param {number} ipdOverWidthMeasured - raw ipdOverWidth from camera.
 * @param {number} ipdShrinkage - from estimateHeadYaw(); cos(yaw).
 * @returns {number} corrected ipdOverWidth.
 */
export const correctIpdForHeadRotation = (
  ipdOverWidthMeasured,
  ipdShrinkage,
) => {
  if (!ipdShrinkage || ipdShrinkage <= 0 || ipdShrinkage > 1) {
    return ipdOverWidthMeasured
  }
  return ipdOverWidthMeasured / ipdShrinkage
}
