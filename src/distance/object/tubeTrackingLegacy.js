// tubeTrackingLegacy.js — LEGACY tube tracking, kept as an isolated block.
//
// This is the original tube-tracking implementation (paper-tube detection,
// hand-first locking, face-band cropping), used only by the 'crop' and
// 'cropButShowWhole' values of _calibrateDistanceExcludeTube. The current
// recommended approach is 'excludeHand' (see handExcludeTracker.js), which
// does not use this file. TO DELETE TUBE TRACKING ENTIRELY: remove this file
// and its references in tubeTemplateTracker.js (the dispatcher), and drop the
// 'crop' / 'cropButShowWhole' values.
//
// All geometry is in CAMERA (webgazerVideoCanvas) pixel coordinates
// (unmirrored); the on-screen video is mirrored.

import * as handPoseDetection from '@tensorflow-models/hand-pose-detection'

const VIDEO_CANVAS_ID = 'webgazerVideoCanvas'
const VIDEO_CONTAINER_ID = 'webgazerVideoContainer'

export const TUBE_CROP_MODES = ['dontCrop', 'crop', 'cropButShowWhole']

// ── tuning ──

const SEG_FRAME_WIDTH_PX = 96
const TICK_MS_TRACKING = 100
const TICK_MS_SCANNING = 150

const PAPER_MIN_LUMA = 120
const PAPER_SAT_MAX = 70
const GUIDE_LUMA_JUMP = 20
const GUIDE_TRIGGER_FRACTION = 0.35
const GUIDE_TRIGGER_FRACTION_RED = 0.45
const GUIDE_TRIGGER_TICKS = 2
const GUIDE_BASELINE_ALPHA = 0.15
const GUIDE_BASELINE_WARMUP_TICKS = 3
const GUIDE_QUAD_FRESH_MS = 1500

const LEARNED_COLOR_DIST_MAX = 60
const LEARNED_LUMA_TOL_DOWN = 45
const LEARNED_LUMA_TOL_UP = 70
const LEARNED_SAT_MAX = 90
const ABS_MIN_LUMA = 90
const MIN_AREA_FRACTION = 0.004
const MAX_AREA_FRACTION = 0.6
const WIDTH_TOL_TRACK_MAX = 6
const CONTINUITY_FRACTION = 0.15
const UNION_GAP_FRACTION = 0.03
const GONE_TICKS = 3
const REENTRY_INTERIOR_TICKS = 2
const REENTRY_FG_DIST_MIN = 45
const BG_ALPHA = 0.08
const COLOR_ADAPT = 0.05

const CONF_TRACK_MIN = 0.5
const CONF_HOLD_MIN = 0.65
const CONF_REENTRY_MIN = 0.6
const CONF_DECAY = 0.7
const CONF_ADAPT_MIN = 0.75

const FACE_BAND_MARGIN_FRACTION = 0.3
const FACE_BAND_EMA = 0.25
const BAND_SUSPEND_MS = 5000

const OUT_OF_REGION_TICKS = 2
const MAX_FORCED_RED_MS = 30000
const TIGHT_TRIM_FRACTION = 0.04
const OVERLAP_MIN_TUBE_FRACTION = 0.25

const HAND_CHECK_MS_SCANNING = 400
const HAND_CHECK_MS_TRACKING = 500
const HAND_FRESH_MS = 1500
const HAND_MIN_SCORE = 0.5
const HAND_NEAR_MARGIN_FRACTION = 0.22
const HAND_MISS_MAX = 3
const HAND_CONF_BONUS = 0.2
const HAND_CONF_PENALTY = 0.2
const WRONG_SIDE_PENALTY = 0.3
const GONE_TICKS_CONFIRMED = 8
const CONTINUITY_BOOST_CONFIRMED = 2
const HAND_ANCHOR_MARGIN_FRACTION = 0.08
const HAND_CONTAIN_MARGIN = 0.15
const STATIC_BG_DIST_MAX = 22
const STATIC_BG_TICKS = 12

// ── module state ──

let cropMode = 'dontCrop'

let armed = false
let rcRef = null
let eyeSide = 'right'
let tubeDiameterCm = 3.5
let ipdCmAssumed = 6.3

let state = 'idle' // 'idle' | 'scanning' | 'tracking' | 'absent'

let learnedColor = null // { r, g, b }
let learnedLuma = null
let learnedWidthPx = null
let sampleAreaPx = null

let tubeConfidence = 0

let guideQuad = null // { pts: [{x,y} ×4], t }
let guideBaselineLuma = null
let guideBaselineTicks = 0
let guideTriggerTicks = 0
let guideDebug = null

let faceBand = null // { left, right, t }
let bandSuspended = false
let lastRawActiveTime = 0

let bg = null
let bgW = 0
let bgH = 0

let lastValidEyes = null // { leftEye, rightEye, ipd2DPx, t }
let lastFaceBbox = null // { minX, maxX, minY, maxY, t }
let lastTubeBbox = null // { left, right, top, bottom, t }
let lastTubeTight = null // { left, right, t }
let goneCounter = 0
let outOfRegionCounter = 0
let reentryCounter = 0
let lastTickTime = 0
let lastInRegionTime = 0

let forcesRed = false
let forcedRedSince = null
let safetyTripped = false

let handDetector = null
let handDetectorPromise = null
let handDetectorFailed = false
let handEstimateInFlight = false
let lastHandCheckTime = 0
let lastHands = null // { hands: [{ keypoints, score }], t }
let handMissCount = 0
let lastHandEvalT = 0
let lastHandRejectEventTime = 0
let handConfirmedLock = false
let relockActive = false
let staticBgCounter = 0

let clipPathApplied = false

let trackingLog = [] // mirrored onto the RC instance as RC._tubeTrackingLog
const TRACKING_LOG_MAX = 2000

let maskedCanvas = null
let maskedCtx = null
let segCanvas = null
let segCtx = null

// ── debug state ──

let debugEnabled = false
let debugPanel = null
let debugEls = null
const debugEvents = []
let lastDebugPanelUpdate = 0
let lastFmThumbUpdate = 0
let debugDetectInfo = null
let debugLastRawActive = false
const DEBUG_PANEL_UPDATE_MS = 150
const DEBUG_FM_THUMB_UPDATE_MS = 300
const DEBUG_EVENTS_MAX = 5

// ── cost tracking (shown in the debug panel) ──

const costs = {
  detector: { ema: null, last: 0, count: 0, windowStart: 0, rate: 0 },
  hands: { ema: null, last: 0, count: 0, windowStart: 0, rate: 0 },
  mask: { ema: null, last: 0, count: 0, windowStart: 0, rate: 0 },
}

const recordCost = (name, ms) => {
  const c = costs[name]
  c.last = ms
  c.ema = c.ema === null ? ms : c.ema + 0.1 * (ms - c.ema)
  c.count++
}

// ── helpers ──

const now = () => performance.now()

const getVideoCanvas = () => document.getElementById(VIDEO_CANVAS_ID)

const lumaOf = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b

const satOf = (r, g, b) => Math.max(r, g, b) - Math.min(r, g, b)

const expectedTubeWidthPx = () => {
  if (lastValidEyes)
    return (tubeDiameterCm / ipdCmAssumed) * lastValidEyes.ipd2DPx
  return learnedWidthPx
}

// Camera x → display x (mirrored video, object-fit: cover)
const cameraXToDisplayX = (camX, videoRect, srcW, srcH) => {
  if (!videoRect || !srcW || !srcH) return null
  const scale = Math.max(videoRect.width / srcW, videoRect.height / srcH)
  const offsetX = (srcW * scale - videoRect.width) / 2
  return videoRect.left + (srcW - camX) * scale - offsetX
}

const clearClipPath = () => {
  if (!clipPathApplied) return
  const container = document.getElementById(VIDEO_CONTAINER_ID)
  if (container) container.style.clipPath = ''
  clipPathApplied = false
}

const debugEvent = msg => {
  if (!debugEnabled) return
  debugEvents.unshift({ t: now(), msg })
  if (debugEvents.length > DEBUG_EVENTS_MAX) debugEvents.pop()
  console.log(`[tubeTracker] ${msg}`)
}

// The sampled tube color, background model, and face band survive this reset
const resetTrackingState = () => {
  state = armed ? 'scanning' : 'idle'
  lastTubeBbox = null
  lastTubeTight = null
  tubeConfidence = 0
  debugDetectInfo = null
  guideBaselineLuma = null
  guideBaselineTicks = 0
  guideTriggerTicks = 0
  guideDebug = null
  goneCounter = 0
  outOfRegionCounter = 0
  reentryCounter = 0
  lastTickTime = 0
  lastInRegionTime = 0
  forcesRed = false
  forcedRedSince = null
  bandSuspended = false
  lastRawActiveTime = now()
  handMissCount = 0
  lastHandEvalT = 0
  handConfirmedLock = false
  staticBgCounter = 0
  clearClipPath()
}

// ── hand detection ──

const ensureHandDetector = () => {
  if (handDetector || handDetectorPromise || handDetectorFailed) return
  handDetectorPromise = handPoseDetection
    .createDetector(handPoseDetection.SupportedModels.MediaPipeHands, {
      runtime: 'tfjs',
      modelType: 'lite',
      maxHands: 2,
    })
    .then(detector => {
      handDetector = detector
      debugEvent('hand detector ready — candidates now need a hand on them')
    })
    .catch(err => {
      handDetectorFailed = true
      handDetectorPromise = null
      console.warn(
        'tubeTemplateTracker: hand detector unavailable — hand check disabled',
        err,
      )
      debugEvent('hand detector unavailable — hand check disabled')
    })
}

const maybeUpdateHands = t => {
  if (!handDetector || handEstimateInFlight) return
  const interval =
    state === 'tracking' ? HAND_CHECK_MS_TRACKING : HAND_CHECK_MS_SCANNING
  if (t - lastHandCheckTime < interval) return
  lastHandCheckTime = t
  const src = getVideoCanvas()
  if (!src || !src.width || !src.height) return
  handEstimateInFlight = true
  const inferStart = now()
  handDetector
    .estimateHands(src, { flipHorizontal: false })
    .then(hands => {
      recordCost('hands', now() - inferStart)
      lastHands = {
        hands: (hands || []).filter(h => (h.score ?? 1) >= HAND_MIN_SCORE),
        t: now(),
      }
    })
    .catch(() => {})
    .finally(() => {
      handEstimateInFlight = false
    })
}

// Camera-x direction of the chosen side (+1 / −1, 0 when unknown)
const chosenSideDir = () => {
  if (!lastValidEyes || !lastFaceBbox) return 0
  const chosen =
    eyeSide === 'left' ? lastValidEyes.leftEye : lastValidEyes.rightEye
  if (!chosen) return 0
  const faceCx = (lastFaceBbox.minX + lastFaceBbox.maxX) / 2
  return Math.sign(chosen.x - faceCx)
}

const onWrongSide = bbox => {
  const dir = chosenSideDir()
  if (!dir) return false
  const faceCx = (lastFaceBbox.minX + lastFaceBbox.maxX) / 2
  const margin = 0.15 * (lastFaceBbox.maxX - lastFaceBbox.minX)
  const cx = (bbox.left + bbox.right) / 2
  return (cx - faceCx) * dir < -margin
}

// 'confirmed' | 'rejected' | 'unknown' (fails open)
const handVerdictForBbox = bbox => {
  if (!bbox || !lastHands || now() - lastHands.t > HAND_FRESH_MS)
    return 'unknown'
  const hands = lastHands.hands
  if (!hands.length) return 'unknown'
  const src = getVideoCanvas()
  const margin = HAND_NEAR_MARGIN_FRACTION * (src?.width || 640)
  for (const hand of hands) {
    for (const kp of hand.keypoints) {
      if (
        kp.x >= bbox.left - margin &&
        kp.x <= bbox.right + margin &&
        kp.y >= bbox.top - margin &&
        kp.y <= bbox.bottom + margin
      )
        return 'confirmed'
    }
  }
  const dir = chosenSideDir()
  if (!dir || !lastFaceBbox) return 'rejected'
  const faceCx = (lastFaceBbox.minX + lastFaceBbox.maxX) / 2
  for (const hand of hands) {
    const wrist = hand.keypoints[0]
    if (!wrist || (wrist.x - faceCx) * dir > 0) return 'rejected'
  }
  return 'unknown'
}

const handRejectEvent = msg => {
  const t = now()
  if (t - lastHandRejectEventTime < 2000) return
  lastHandRejectEventTime = t
  debugEvent(msg)
}

const freshHandBboxes = () => {
  if (!lastHands || now() - lastHands.t > HAND_FRESH_MS) return []
  const out = []
  for (const hand of lastHands.hands) {
    let left = Number.POSITIVE_INFINITY
    let right = Number.NEGATIVE_INFINITY
    let top = Number.POSITIVE_INFINITY
    let bottom = Number.NEGATIVE_INFINITY
    for (const kp of hand.keypoints) {
      if (kp.x < left) left = kp.x
      if (kp.x > right) right = kp.x
      if (kp.y < top) top = kp.y
      if (kp.y > bottom) bottom = kp.y
    }
    if (left < right && top < bottom) out.push({ left, right, top, bottom })
  }
  return out
}

// 'anchored' | 'refused' | 'noHand' — a candidate must extend from a hand
const handAnchorCheck = bbox => {
  const hands = freshHandBboxes()
  if (!hands.length) return 'noHand'
  const src = getVideoCanvas()
  const margin = HAND_ANCHOR_MARGIN_FRACTION * (src?.width || 640)
  for (const h of hands) {
    const near =
      bbox.left < h.right + margin &&
      bbox.right > h.left - margin &&
      bbox.top < h.bottom + margin &&
      bbox.bottom > h.top - margin
    if (!near) continue
    const mw = HAND_CONTAIN_MARGIN * (h.right - h.left)
    const mh = HAND_CONTAIN_MARGIN * (h.bottom - h.top)
    const insideHand =
      bbox.left >= h.left - mw &&
      bbox.right <= h.right + mw &&
      bbox.top >= h.top - mh &&
      bbox.bottom <= h.bottom + mh
    if (!insideHand) return 'anchored'
  }
  return 'refused'
}

const unionWithGrippingHand = bbox => {
  const src = getVideoCanvas()
  const margin = HAND_ANCHOR_MARGIN_FRACTION * (src?.width || 640)
  let out = bbox
  for (const h of freshHandBboxes()) {
    const near =
      bbox.left < h.right + margin &&
      bbox.right > h.left - margin &&
      bbox.top < h.bottom + margin &&
      bbox.bottom > h.top - margin
    if (!near) continue
    out = {
      left: Math.min(out.left, h.left),
      right: Math.max(out.right, h.right),
      top: Math.min(out.top, h.top),
      bottom: Math.max(out.bottom, h.bottom),
    }
  }
  return out
}

// ── public interface ──

export const configureTubeTracker = ({ cropMode: mode, debugBool } = {}) => {
  if (TUBE_CROP_MODES.includes(mode)) {
    cropMode = mode
  } else if (mode !== undefined) {
    console.warn(
      `_calibrateDistanceExcludeTube: unrecognized crop value "${mode}", using "dontCrop"`,
    )
    cropMode = 'dontCrop'
  }
  learnedColor = null
  learnedLuma = null
  learnedWidthPx = null
  sampleAreaPx = null
  bg = null
  faceBand = null
  lastHands = null
  if (cropMode !== 'dontCrop') ensureHandDetector()
  if (debugBool !== undefined) setTubeTrackerDebug(debugBool)
}

export const getTubeCropMode = () => cropMode

export const armTubeTracker = (RC, { eye, tubeCm, ipdCm } = {}) => {
  rcRef = RC || rcRef
  eyeSide = eye === 'left' ? 'left' : 'right'
  if (typeof tubeCm === 'number' && tubeCm > 0) tubeDiameterCm = tubeCm
  if (typeof ipdCm === 'number' && ipdCm > 0) ipdCmAssumed = ipdCm
  armed = true
  safetyTripped = false
  trackingLog = []
  if (rcRef) rcRef._tubeTrackingLog = trackingLog
  ensureHandDetector()
  resetTrackingState()
  debugEvent(
    `armed — eye=${eyeSide} mode=${cropMode} tube=${tubeDiameterCm}cm${learnedColor ? ' (color remembered)' : ''}`,
  )
}

export const disarmTubeTracker = () => {
  if (armed) debugEvent('disarmed (overlay cleared / page left)')
  armed = false
  rcRef = null
  guideQuad = null
  resetTrackingState()
  removeDebugPanel()
}

export const tubeTrackerForcesRed = () => forcesRed

export const getTubeTrackingLog = () => trackingLog

export const getTubeConfidence = () =>
  state === 'tracking' ? tubeConfidence : 0

// Called every frame by distanceTrack with the drawn tube guide quad, in
// SCREEN coordinates; converted here to camera coordinates
export const setTubeGuideQuad = (screenPts, videoRect) => {
  if (!screenPts || screenPts.length !== 4 || !videoRect) return
  const src = getVideoCanvas()
  if (!src || !src.width || !src.height) return
  const srcW = src.width
  const srcH = src.height
  const scale = Math.max(videoRect.width / srcW, videoRect.height / srcH)
  const offsetX = (srcW * scale - videoRect.width) / 2
  const offsetY = (srcH * scale - videoRect.height) / 2
  const pts = screenPts.map(p => ({
    x: srcW - (p.x - videoRect.left + offsetX) / scale,
    y: (p.y - videoRect.top + offsetY) / scale,
  }))
  guideQuad = { pts, t: now() }
}

// The canvas fed to Google FaceMesh: masked on the tube side of the face band
export const getFaceMeshVideoInput = () => {
  const src = getVideoCanvas()
  if (!src) return null
  if (
    !armed ||
    cropMode === 'dontCrop' ||
    !faceBand ||
    bandSuspended ||
    safetyTripped
  )
    return src

  const w = src.width
  const h = src.height
  if (!w || !h) return src

  if (!maskedCanvas) {
    maskedCanvas = document.createElement('canvas')
    maskedCtx = maskedCanvas.getContext('2d')
  }
  if (maskedCanvas.width !== w) maskedCanvas.width = w
  if (maskedCanvas.height !== h) maskedCanvas.height = h

  const left = Math.round(Math.min(Math.max(faceBand.left, 0), w))
  const right = Math.round(Math.min(Math.max(faceBand.right, 0), w))

  const maskStart = now()
  maskedCtx.drawImage(src, 0, 0)
  maskedCtx.fillStyle = '#7f7f7f'
  // One-sided: mask only the tube side; both sides if the side is unknown
  const dir = chosenSideDir()
  if (dir > 0) {
    if (right < w) maskedCtx.fillRect(right, 0, w - right, h)
  } else if (dir < 0) {
    if (left > 0) maskedCtx.fillRect(0, 0, left, h)
  } else {
    if (left > 0) maskedCtx.fillRect(0, 0, left, h)
    if (right < w) maskedCtx.fillRect(right, 0, w - right, h)
  }
  recordCost('mask', now() - maskStart)
  return maskedCanvas
}

// Per-frame display update for the 'crop' / 'cropButShowWhole' modes
export const renderTubeCropDisplay = (ctx, videoRect) => {
  if (
    !armed ||
    cropMode === 'dontCrop' ||
    !faceBand ||
    bandSuspended ||
    !videoRect
  ) {
    clearClipPath()
    return
  }
  const src = getVideoCanvas()
  if (!src || !src.width) {
    clearClipPath()
    return
  }
  const srcW = src.width
  const srcH = src.height
  // Mirrored: the band's camera-right edge is the display's LEFT edge
  const keepLeft = cameraXToDisplayX(faceBand.right, videoRect, srcW, srcH)
  const keepRight = cameraXToDisplayX(faceBand.left, videoRect, srcW, srcH)
  if (keepLeft === null || keepRight === null) return

  const dir = chosenSideDir()
  const trimDisplayLeft = dir >= 0
  const trimDisplayRight = dir <= 0

  if (cropMode === 'cropButShowWhole') {
    clearClipPath()
    if (!ctx) return
    ctx.save()
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'
    if (trimDisplayLeft && keepLeft > videoRect.left)
      ctx.fillRect(
        videoRect.left,
        videoRect.top,
        keepLeft - videoRect.left,
        videoRect.height,
      )
    if (trimDisplayRight && keepRight < videoRect.right)
      ctx.fillRect(
        keepRight,
        videoRect.top,
        videoRect.right - keepRight,
        videoRect.height,
      )
    ctx.restore()
    return
  }

  // 'crop': clip only once the sampled tube is out of the band
  const tubeClear = (state === 'tracking' || state === 'absent') && !forcesRed
  if (!tubeClear) {
    clearClipPath()
    return
  }
  const container = document.getElementById(VIDEO_CONTAINER_ID)
  if (!container) return
  const cRect = container.getBoundingClientRect()
  const insetLeft = trimDisplayLeft
    ? Math.max(0, Math.round(keepLeft - cRect.left))
    : 0
  const insetRight = trimDisplayRight
    ? Math.max(0, Math.round(cRect.right - keepRight))
    : 0
  container.style.clipPath = `inset(0px ${insetRight}px 0px ${insetLeft}px)`
  clipPathApplied = true
}

// ── state machine ──

// Main tick, called from the iris tracking loop (~30 Hz)
export const updateTubeTracker = (meshData, rawActive) => {
  const t = now()
  debugLastRawActive = rawActive
  if (rawActive) lastRawActiveTime = t
  if (debugEnabled && armed) updateDebugPanel(t)
  if (!armed) return

  if (meshData?.leftEye && meshData.rightEye) {
    const { leftEye, rightEye } = meshData
    lastValidEyes = {
      leftEye,
      rightEye,
      ipd2DPx: Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y),
      t,
    }
    if (meshData.mesh?.length) {
      let minX = Number.POSITIVE_INFINITY
      let maxX = Number.NEGATIVE_INFINITY
      let minY = Number.POSITIVE_INFINITY
      let maxY = Number.NEGATIVE_INFINITY
      for (const p of meshData.mesh) {
        if (p.x < minX) minX = p.x
        if (p.x > maxX) maxX = p.x
        if (p.y < minY) minY = p.y
        if (p.y > maxY) maxY = p.y
      }
      if (minX < maxX) lastFaceBbox = { minX, maxX, minY, maxY, t }
    }
  }

  updateFaceBand(t)
  updateBandSuspension(t)
  maybeUpdateHands(t)

  const interval = state === 'tracking' ? TICK_MS_TRACKING : TICK_MS_SCANNING
  if (t - lastTickTime < interval) return
  lastTickTime = t

  runDetectorTick(t)
  updateRedHold(t)
}

const updateFaceBand = t => {
  if (!lastFaceBbox || t - lastFaceBbox.t > 500) return
  const faceW = lastFaceBbox.maxX - lastFaceBbox.minX
  const margin = FACE_BAND_MARGIN_FRACTION * faceW
  const target = {
    left: lastFaceBbox.minX - margin,
    right: lastFaceBbox.maxX + margin,
  }
  if (!faceBand) {
    faceBand = { ...target, t }
    debugEvent(
      `face band ON — FaceMesh sees x ∈ [${Math.round(target.left)}, ${Math.round(target.right)}]`,
    )
  } else {
    faceBand.left += FACE_BAND_EMA * (target.left - faceBand.left)
    faceBand.right += FACE_BAND_EMA * (target.right - faceBand.right)
    faceBand.t = t
  }
}

// Suspend the band if FaceMesh keeps failing with no tube to explain it
const updateBandSuspension = t => {
  if (!faceBand) return
  const meshFailingLong = t - lastRawActiveTime > BAND_SUSPEND_MS
  const tubeExplainsIt =
    state === 'tracking' && lastTubeBbox && tubeOverlapsBand()
  const guideExplainsIt = guideTriggerTicks > 0
  if (
    !bandSuspended &&
    meshFailingLong &&
    !tubeExplainsIt &&
    !guideExplainsIt
  ) {
    bandSuspended = true
    debugEvent(
      'face band SUSPENDED — FaceMesh failing, letting it re-find the face',
    )
  } else if (bandSuspended && debugLastRawActive) {
    bandSuspended = false
    debugEvent('face band RESUMED — face re-found')
  }
}

const runDetectorTick = t => {
  const tickStart = now()
  const frame = grabFrame()
  if (!frame) return

  let det = null
  switch (state) {
    case 'scanning': {
      const sampled = watchGuide(frame, t)
      if (!sampled && learnedColor) tryReacquire(frame, t)
      break
    }
    case 'tracking': {
      det = segmentLearned(frame, false)
      if (det && det.confidence < CONF_TRACK_MIN) det = null
      // Hand is master: confirm the lock, or re-lock at the hand
      if (lastHands && lastHands.t > lastHandEvalT) {
        lastHandEvalT = lastHands.t
        const refBbox = det ? det.bbox : lastTubeBbox
        const verdict = refBbox ? handVerdictForBbox(refBbox) : 'rejected'
        if (verdict === 'confirmed') {
          handMissCount = 0
          staticBgCounter = 0
          if (!handConfirmedLock) {
            handConfirmedLock = true
            debugEvent('hand seen ON the tube — lock is now STICKY')
          }
        } else if (verdict === 'rejected') {
          relockActive = true
          const relock = segmentLearned(frame, true, true)
          relockActive = false
          if (relock && relock.confidence >= CONF_TRACK_MIN) {
            det = relock
            goneCounter = 0
            handMissCount = 0
            handConfirmedLock = true
            debugEvent(
              'hand re-detected away from the lock — RE-LOCKED at the hand',
            )
          } else if (!handConfirmedLock) {
            handMissCount++
            if (handMissCount >= HAND_MISS_MAX) {
              handMissCount = 0
              det = null
              state = 'absent'
              tubeConfidence = 0
              lastTubeBbox = null
              reentryCounter = 0
              guideTriggerTicks = 0
              debugEvent(
                'hands visible but NONE on the tracked blob — false lock released',
              )
              break
            }
          }
        } else {
          handMissCount = 0
        }
      }
      // Static-background guard
      if (det) {
        if (det.bgDistMean !== null && det.bgDistMean < STATIC_BG_DIST_MAX)
          staticBgCounter++
        else staticBgCounter = 0
        if (staticBgCounter >= STATIC_BG_TICKS) {
          staticBgCounter = 0
          det = null
          state = 'scanning'
          tubeConfidence = 0
          lastTubeBbox = null
          lastTubeTight = null
          goneCounter = 0
          reentryCounter = 0
          guideTriggerTicks = 0
          handConfirmedLock = false
          debugEvent(
            'tracked blob matches the BACKGROUND (static wall) — lock released',
          )
          break
        }
      }
      if (det) {
        lastTubeBbox = { ...unionWithGrippingHand(det.bbox), t }
        lastTubeTight = {
          left: det.tightLeft ?? det.bbox.left,
          right: det.tightRight ?? det.bbox.right,
          t,
        }
        tubeConfidence = det.confidence
        goneCounter = 0
        if (det.confidence >= CONF_ADAPT_MIN) {
          learnedColor = {
            r:
              learnedColor.r + COLOR_ADAPT * (det.meanColor.r - learnedColor.r),
            g:
              learnedColor.g + COLOR_ADAPT * (det.meanColor.g - learnedColor.g),
            b:
              learnedColor.b + COLOR_ADAPT * (det.meanColor.b - learnedColor.b),
          }
          learnedLuma = lumaOf(learnedColor.r, learnedColor.g, learnedColor.b)
        }
        trackingLog.push({
          t,
          xPx: Math.round(det.bbox.left),
          yPx: Math.round(det.bbox.top),
          areaPx: Math.round(det.areaPx),
          widthPx: Math.round(det.widthPx),
          conf: Math.round(det.confidence * 100) / 100,
        })
        if (trackingLog.length > TRACKING_LOG_MAX) trackingLog.shift()
      } else {
        tubeConfidence *= CONF_DECAY
        goneCounter++
        const goneLimit = handConfirmedLock ? GONE_TICKS_CONFIRMED : GONE_TICKS
        if (goneCounter >= goneLimit) {
          state = 'absent'
          tubeConfidence = 0
          reentryCounter = 0
          guideTriggerTicks = 0
          handConfirmedLock = false
          debugEvent('tube left the camera — watching for re-entry')
        }
      }
      break
    }
    case 'absent': {
      const sampled = watchGuide(frame, t)
      if (!sampled) tryReacquire(frame, t)
      break
    }
    default:
      break
  }
  debugDetectInfo = det

  updateBackground(frame, det)
  recordCost('detector', now() - tickStart)
}

// Downsample the current camera frame once per tick
const grabFrame = () => {
  const src = getVideoCanvas()
  if (!src || !src.width || !src.height) return null
  const srcW = src.width
  const ds = Math.max(1, Math.round(srcW / SEG_FRAME_WIDTH_PX))
  const fw = Math.max(1, Math.floor(srcW / ds))
  const fh = Math.max(1, Math.floor(src.height / ds))
  if (!segCanvas) {
    segCanvas = document.createElement('canvas')
    segCtx = segCanvas.getContext('2d', { willReadFrequently: true })
  }
  if (segCanvas.width !== fw) segCanvas.width = fw
  if (segCanvas.height !== fh) segCanvas.height = fh
  segCtx.drawImage(src, 0, 0, fw, fh)
  return { data: segCtx.getImageData(0, 0, fw, fh).data, fw, fh, ds }
}

// ── guide watching & tube sampling ──

const pointInQuad = (x, y, pts) => {
  let inside = false
  for (let i = 0, j = 3; i < 4; j = i++) {
    const xi = pts[i].x
    const yi = pts[i].y
    const xj = pts[j].x
    const yj = pts[j].y
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside
  }
  return inside
}

const median = arr => {
  if (!arr.length) return null
  const s = arr.slice().sort((a, b) => a - b)
  return s[s.length >> 1]
}

// Watch the guide quad for the paper's arrival; returns true if sampled
const watchGuide = (frame, t) => {
  guideDebug = null
  if (!guideQuad || t - guideQuad.t > GUIDE_QUAD_FRESH_MS) {
    guideTriggerTicks = 0
    return false
  }
  const { data, fw, fh, ds } = frame
  const q = guideQuad.pts.map(p => ({ x: p.x / ds, y: p.y / ds }))
  let qx1 = fw
  let qx2 = 0
  let qy1 = fh
  let qy2 = 0
  for (const p of q) {
    qx1 = Math.min(qx1, Math.floor(p.x))
    qx2 = Math.max(qx2, Math.ceil(p.x))
    qy1 = Math.min(qy1, Math.floor(p.y))
    qy2 = Math.max(qy2, Math.ceil(p.y))
  }
  qx1 = Math.max(0, qx1)
  qy1 = Math.max(0, qy1)
  qx2 = Math.min(fw - 1, qx2)
  qy2 = Math.min(fh - 1, qy2)
  if (qx2 <= qx1 || qy2 <= qy1) return false

  const lumas = []
  const paperJump = []
  const paperAbs = []
  const jumpFloor =
    guideBaselineLuma !== null
      ? Math.max(PAPER_MIN_LUMA, guideBaselineLuma + GUIDE_LUMA_JUMP)
      : null
  for (let y = qy1; y <= qy2; y++) {
    for (let x = qx1; x <= qx2; x++) {
      if (!pointInQuad(x + 0.5, y + 0.5, q)) continue
      const i = (y * fw + x) * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const luma = lumaOf(r, g, b)
      lumas.push(luma)
      if (luma >= PAPER_MIN_LUMA && satOf(r, g, b) <= PAPER_SAT_MAX) {
        paperAbs.push(i)
        if (jumpFloor !== null && luma >= jumpFloor) paperJump.push(i)
      }
    }
  }
  const total = lumas.length
  if (total < 20) return false

  const medianLuma = median(lumas)
  const fracJump = paperJump.length / total
  const fracAbs = paperAbs.length / total
  guideDebug = { fracJump, fracAbs, baseline: guideBaselineLuma, medianLuma }

  const baselineReady = guideBaselineTicks >= GUIDE_BASELINE_WARMUP_TICKS
  const triggered =
    (baselineReady && fracJump >= GUIDE_TRIGGER_FRACTION) ||
    (!debugLastRawActive && fracAbs >= GUIDE_TRIGGER_FRACTION_RED)

  if (!triggered) {
    guideTriggerTicks = 0
    guideBaselineLuma =
      guideBaselineLuma === null
        ? medianLuma
        : guideBaselineLuma +
          GUIDE_BASELINE_ALPHA * (medianLuma - guideBaselineLuma)
    guideBaselineTicks++
    return false
  }

  guideTriggerTicks++
  if (guideTriggerTicks < GUIDE_TRIGGER_TICKS) return false

  const idxs = paperJump.length >= paperAbs.length * 0.5 ? paperJump : paperAbs
  const rs = []
  const gs = []
  const bs = []
  let bx1 = fw
  let bx2 = 0
  let by1 = fh
  let by2 = 0
  for (const i of idxs) {
    rs.push(data[i])
    gs.push(data[i + 1])
    bs.push(data[i + 2])
    const p = i / 4
    const px = p % fw
    const py = (p / fw) | 0
    if (px < bx1) bx1 = px
    if (px > bx2) bx2 = px
    if (py < by1) by1 = py
    if (py > by2) by2 = py
  }
  const candidateBbox = {
    left: bx1 * ds,
    right: (bx2 + 1) * ds,
    top: by1 * ds,
    bottom: (by2 + 1) * ds,
    t,
  }

  // Hand-first: no detected hand ⇒ no tube (unless the model failed to load)
  const anchor = handAnchorCheck(candidateBbox)
  if (anchor !== 'anchored' && !handDetectorFailed) {
    guideTriggerTicks = GUIDE_TRIGGER_TICKS
    handRejectEvent(
      anchor === 'noHand'
        ? 'paper-like fill in guide but NO HAND detected — no hand, no tube'
        : 'paper-like fill in guide does not extend from the hand — not locking',
    )
    return false
  }

  learnedColor = { r: median(rs), g: median(gs), b: median(bs) }
  learnedLuma = lumaOf(learnedColor.r, learnedColor.g, learnedColor.b)
  learnedWidthPx = expectedTubeWidthPx()
  sampleAreaPx = idxs.length * ds * ds
  tubeConfidence = 1
  lastTubeBbox = { ...unionWithGrippingHand(candidateBbox), t }
  lastTubeTight = { left: candidateBbox.left, right: candidateBbox.right, t }
  guideTriggerTicks = 0
  goneCounter = 0
  handMissCount = 0
  lastHandEvalT = t
  handConfirmedLock = anchor === 'anchored'
  staticBgCounter = 0
  state = 'tracking'
  debugEvent(
    `TUBE SAMPLED in guide — rgb(${Math.round(learnedColor.r)},${Math.round(learnedColor.g)},${Math.round(learnedColor.b)}), ${Math.round(fracAbs * 100)}% of guide paper-like${handConfirmedLock ? ', extends from hand — lock STICKY' : ''}`,
  )
  return true
}

// ── color segmentation ──

// 1 inside [lo, hi], linear falloff to 0 at [loHard, hiHard]
const rangeScore = (v, loHard, lo, hi, hiHard) => {
  if (v >= lo && v <= hi) return 1
  if (v <= loHard || v >= hiHard) return 0
  if (v < lo) return (v - loHard) / (lo - loHard)
  return (hiHard - v) / (hiHard - hi)
}

// Confidence (0..1) that a candidate blob really is the sampled tube
const blobConfidence = (f, wExpPx, reach) => {
  const colorScore = Math.max(
    0,
    1 -
      (Math.abs(f.meanColor.r - learnedColor.r) +
        Math.abs(f.meanColor.g - learnedColor.g) +
        Math.abs(f.meanColor.b - learnedColor.b)) /
        LEARNED_COLOR_DIST_MAX,
  )
  const fillScore = Math.min(1, f.fill / 0.5)
  const widthScore = wExpPx
    ? rangeScore(f.widthPx / wExpPx, 0.25, 0.6, 2.5, 6)
    : 0.7
  let areaScore = 0.7
  if (sampleAreaPx) {
    const r = f.areaPx / sampleAreaPx
    areaScore = f.touchesEdge
      ? rangeScore(r, 0.02, 0.1, 2.5, 8)
      : rangeScore(r, 0.08, 0.35, 2.5, 8)
  }
  let continuityScore
  if (state === 'tracking' && lastTubeBbox && !relockActive) {
    const cx = (f.bbox.left + f.bbox.right) / 2
    const cy = (f.bbox.top + f.bbox.bottom) / 2
    const lx = (lastTubeBbox.left + lastTubeBbox.right) / 2
    const ly = (lastTubeBbox.top + lastTubeBbox.bottom) / 2
    continuityScore = Math.max(0, 1 - Math.hypot(cx - lx, cy - ly) / reach)
  } else {
    continuityScore = relockActive ? 0.8 : f.touchesEdge ? 0.8 : 0.4
    if (lastTubeBbox) {
      const cx = (f.bbox.left + f.bbox.right) / 2
      const cy = (f.bbox.top + f.bbox.bottom) / 2
      const lx = (lastTubeBbox.left + lastTubeBbox.right) / 2
      const ly = (lastTubeBbox.top + lastTubeBbox.bottom) / 2
      if (Math.hypot(cx - lx, cy - ly) < reach)
        continuityScore = Math.max(continuityScore, 0.85)
    }
  }
  let score =
    0.35 * colorScore +
    0.15 * fillScore +
    0.2 * widthScore +
    0.15 * areaScore +
    0.15 * continuityScore
  const verdict = handVerdictForBbox(f.bbox)
  if (verdict === 'confirmed') score = Math.min(1, score + HAND_CONF_BONUS)
  else if (verdict === 'rejected' && !handConfirmedLock)
    score = Math.max(0, score - HAND_CONF_PENALTY)
  if (onWrongSide(f.bbox)) score = Math.max(0, score - WRONG_SIDE_PENALTY)
  return score
}

// Segment pixels matching the sampled tube into blobs; return the most
// confident detection or null
const segmentLearned = (frame, requireForeground, requireHandAnchor) => {
  if (!learnedColor) return null
  const { data, fw, fh, ds } = frame

  // Exclude the face rectangle (slightly expanded)
  let fx1 = -1
  let fx2 = -1
  let fy1 = -1
  let fy2 = -1
  if (lastFaceBbox) {
    const mPx = 0.04 * fw * ds
    fx1 = Math.floor((lastFaceBbox.minX - mPx) / ds)
    fx2 = Math.ceil((lastFaceBbox.maxX + mPx) / ds)
    fy1 = Math.floor((lastFaceBbox.minY - mPx) / ds)
    fy2 = Math.ceil((lastFaceBbox.maxY + mPx) / ds)
  }

  const bgReady = bg && bgW === fw && bgH === fh
  const mask = new Uint8Array(fw * fh)
  for (let y = 0; y < fh; y++) {
    const inFaceY = y >= fy1 && y <= fy2
    for (let x = 0; x < fw; x++) {
      if (inFaceY && x >= fx1 && x <= fx2) continue
      const p = y * fw + x
      const i = p * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const luma = lumaOf(r, g, b)
      if (luma < ABS_MIN_LUMA) continue
      if (learnedLuma !== null) {
        if (luma < learnedLuma - LEARNED_LUMA_TOL_DOWN) continue
        if (luma > learnedLuma + LEARNED_LUMA_TOL_UP) continue
      }
      if (satOf(r, g, b) > LEARNED_SAT_MAX) continue
      const cDist =
        Math.abs(r - learnedColor.r) +
        Math.abs(g - learnedColor.g) +
        Math.abs(b - learnedColor.b)
      if (cDist > LEARNED_COLOR_DIST_MAX) continue
      if (requireForeground) {
        if (!bgReady) continue
        const j = p * 3
        const bgDist =
          Math.abs(r - bg[j]) +
          Math.abs(g - bg[j + 1]) +
          Math.abs(b - bg[j + 2])
        if (bgDist < REENTRY_FG_DIST_MIN) continue
      }
      mask[p] = 1
    }
  }

  const labels = new Int32Array(fw * fh)
  const stack = []
  const comps = []
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue
    const id = comps.length + 1
    const c = {
      id,
      area: 0,
      minX: fw,
      maxX: 0,
      minY: fh,
      maxY: 0,
      sumR: 0,
      sumG: 0,
      sumB: 0,
      sumX: 0,
      sumY: 0,
      sumXX: 0,
      sumYY: 0,
      sumXY: 0,
    }
    stack.length = 0
    stack.push(start)
    labels[start] = id
    while (stack.length) {
      const p = stack.pop()
      const px = p % fw
      const py = (p / fw) | 0
      c.area++
      if (px < c.minX) c.minX = px
      if (px > c.maxX) c.maxX = px
      if (py < c.minY) c.minY = py
      if (py > c.maxY) c.maxY = py
      const di = p * 4
      c.sumR += data[di]
      c.sumG += data[di + 1]
      c.sumB += data[di + 2]
      c.sumX += px
      c.sumY += py
      c.sumXX += px * px
      c.sumYY += py * py
      c.sumXY += px * py
      if (px > 0 && mask[p - 1] && !labels[p - 1]) {
        labels[p - 1] = id
        stack.push(p - 1)
      }
      if (px < fw - 1 && mask[p + 1] && !labels[p + 1]) {
        labels[p + 1] = id
        stack.push(p + 1)
      }
      if (py > 0 && mask[p - fw] && !labels[p - fw]) {
        labels[p - fw] = id
        stack.push(p - fw)
      }
      if (py < fh - 1 && mask[p + fw] && !labels[p + fw]) {
        labels[p + fw] = id
        stack.push(p + fw)
      }
    }
    comps.push(c)
  }

  const minArea = Math.max(10, MIN_AREA_FRACTION * fw * fh)
  const maxArea = MAX_AREA_FRACTION * fw * fh
  const wExpPx = expectedTubeWidthPx()
  const srcW = fw * ds
  const reach =
    CONTINUITY_FRACTION *
    srcW *
    (handConfirmedLock ? CONTINUITY_BOOST_CONFIRMED : 1)

  const features = []
  for (const c of comps) {
    if (c.area < minArea || c.area > maxArea) continue
    const n = c.area
    const mx = c.sumX / n
    const my = c.sumY / n
    const covXX = c.sumXX / n - mx * mx
    const covYY = c.sumYY / n - my * my
    const covXY = c.sumXY / n - mx * my
    const tr2 = (covXX + covYY) / 2
    const dsc = Math.sqrt(((covXX - covYY) / 2) ** 2 + covXY ** 2)
    const l1 = Math.max(tr2 + dsc, 1e-3)
    const majorLenDs = Math.max(Math.sqrt(12 * l1), 1)
    const widthPx = (n / majorLenDs) * ds
    if (wExpPx && widthPx > WIDTH_TOL_TRACK_MAX * wExpPx) continue
    const bboxAreaDs = (c.maxX - c.minX + 1) * (c.maxY - c.minY + 1) || 1
    const f = {
      comp: c,
      widthPx,
      areaPx: n * ds * ds,
      fill: n / bboxAreaDs,
      meanColor: { r: c.sumR / n, g: c.sumG / n, b: c.sumB / n },
      bbox: {
        left: c.minX * ds,
        right: (c.maxX + 1) * ds,
        top: c.minY * ds,
        bottom: (c.maxY + 1) * ds,
      },
      touchesEdge:
        c.minX === 0 || c.maxX === fw - 1 || c.minY === 0 || c.maxY === fh - 1,
    }
    if (requireHandAnchor && handAnchorCheck(f.bbox) !== 'anchored') continue
    f.confidence = blobConfidence(f, wExpPx, reach)
    features.push(f)
  }
  if (!features.length) return null

  let best = null
  for (const f of features)
    if (!best || f.confidence > best.confidence) best = f
  if (!best) return null

  if (state === 'tracking' && lastTubeBbox && !relockActive) {
    const near =
      best.bbox.left < lastTubeBbox.right + reach &&
      best.bbox.right > lastTubeBbox.left - reach &&
      best.bbox.top < lastTubeBbox.bottom + reach &&
      best.bbox.bottom > lastTubeBbox.top - reach
    if (!near) return null
  }

  // Merge only pieces split off by the fingers (small gaps); confidence
  // stays that of the best blob
  const gap = UNION_GAP_FRACTION * srcW
  const u = {
    bbox: { ...best.bbox },
    areaPx: best.areaPx,
    widthPx: best.widthPx,
    sumR: best.meanColor.r * best.comp.area,
    sumG: best.meanColor.g * best.comp.area,
    sumB: best.meanColor.b * best.comp.area,
    n: best.comp.area,
    touchesEdge: best.touchesEdge,
  }
  const ids = new Set([best.comp.id])
  for (const f of features) {
    if (f === best) continue
    const close =
      f.bbox.left < best.bbox.right + gap &&
      f.bbox.right > best.bbox.left - gap &&
      f.bbox.top < best.bbox.bottom + gap &&
      f.bbox.bottom > best.bbox.top - gap
    if (!close) continue
    ids.add(f.comp.id)
    u.bbox.left = Math.min(u.bbox.left, f.bbox.left)
    u.bbox.right = Math.max(u.bbox.right, f.bbox.right)
    u.bbox.top = Math.min(u.bbox.top, f.bbox.top)
    u.bbox.bottom = Math.max(u.bbox.bottom, f.bbox.bottom)
    u.areaPx += f.areaPx
    u.widthPx = Math.max(u.widthPx, f.widthPx)
    u.sumR += f.meanColor.r * f.comp.area
    u.sumG += f.meanColor.g * f.comp.area
    u.sumB += f.meanColor.b * f.comp.area
    u.n += f.comp.area
    u.touchesEdge = u.touchesEdge || f.touchesEdge
  }
  // Tight x-extent (mass-trimmed) and mean distance to the background model
  const colMass = new Int32Array(fw)
  let mass = 0
  let bgDistSum = 0
  for (let p = 0; p < labels.length; p++) {
    if (labels[p] && ids.has(labels[p])) {
      colMass[p % fw]++
      mass++
      if (bgReady) {
        const i = p * 4
        const j = p * 3
        bgDistSum +=
          Math.abs(data[i] - bg[j]) +
          Math.abs(data[i + 1] - bg[j + 1]) +
          Math.abs(data[i + 2] - bg[j + 2])
      }
    }
  }
  const bgDistMean = bgReady && mass ? bgDistSum / mass : null
  const trimTarget = Math.max(1, Math.round(mass * TIGHT_TRIM_FRACTION))
  let txl = 0
  for (let acc = 0; txl < fw; txl++) {
    acc += colMass[txl]
    if (acc > trimTarget) break
  }
  let txr = fw - 1
  for (let acc = 0; txr >= 0; txr--) {
    acc += colMass[txr]
    if (acc > trimTarget) break
  }
  const tightLeft = txl <= txr ? txl * ds : u.bbox.left
  const tightRight = txl <= txr ? (txr + 1) * ds : u.bbox.right

  return {
    bbox: u.bbox,
    areaPx: u.areaPx,
    widthPx: u.widthPx,
    meanColor: { r: u.sumR / u.n, g: u.sumG / u.n, b: u.sumB / u.n },
    touchesEdge: u.touchesEdge,
    confidence: best.confidence,
    compIds: ids,
    tightLeft,
    tightRight,
    bgDistMean,
  }
}

// Re-acquire a previously sampled tube outside the guide
const tryReacquire = (frame, t) => {
  const handFirst = !handDetectorFailed
  if (handFirst && !freshHandBboxes().length) {
    reentryCounter = 0
    return
  }
  const det = segmentLearned(frame, true, handFirst)
  if (!det || det.confidence < CONF_REENTRY_MIN) {
    reentryCounter = 0
    return
  }
  reentryCounter++
  const needed = det.touchesEdge ? 1 : REENTRY_INTERIOR_TICKS
  if (reentryCounter < needed) return
  lastTubeBbox = { ...unionWithGrippingHand(det.bbox), t }
  lastTubeTight = {
    left: det.tightLeft ?? det.bbox.left,
    right: det.tightRight ?? det.bbox.right,
    t,
  }
  tubeConfidence = det.confidence
  goneCounter = 0
  reentryCounter = 0
  handMissCount = 0
  lastHandEvalT = t
  handConfirmedLock = handFirst
  staticBgCounter = 0
  state = 'tracking'
  debugEvent(
    `tube RE-ENTERED the camera — tracking again (conf ${Math.round(det.confidence * 100)}%)`,
  )
}

// Update the background model everywhere except on the tube itself
const updateBackground = (frame, det) => {
  const { data, fw, fh } = frame
  if (!bg || bgW !== fw || bgH !== fh) {
    bg = new Float32Array(fw * fh * 3)
    for (let i = 0, j = 0; j < bg.length; i += 4, j += 3) {
      bg[j] = data[i]
      bg[j + 1] = data[i + 1]
      bg[j + 2] = data[i + 2]
    }
    bgW = fw
    bgH = fh
    return
  }
  let tx1 = -1
  let tx2 = -1
  let ty1 = -1
  let ty2 = -1
  if (det || (state === 'tracking' && lastTubeBbox)) {
    const b = det ? det.bbox : lastTubeBbox
    const ds = frame.ds
    tx1 = Math.floor(b.left / ds)
    tx2 = Math.ceil(b.right / ds)
    ty1 = Math.floor(b.top / ds)
    ty2 = Math.ceil(b.bottom / ds)
  }
  for (let y = 0; y < fh; y++) {
    const inTubeY = y >= ty1 && y <= ty2
    for (let x = 0; x < fw; x++) {
      if (inTubeY && x >= tx1 && x <= tx2) continue
      const p = y * fw + x
      const i = p * 4
      const j = p * 3
      bg[j] += BG_ALPHA * (data[i] - bg[j])
      bg[j + 1] += BG_ALPHA * (data[i + 1] - bg[j + 1])
      bg[j + 2] += BG_ALPHA * (data[i + 2] - bg[j + 2])
    }
  }
}

// ── red hold ──

// Does the tube overlap the video region currently fed to FaceMesh?
const tubeOverlapsBand = () => {
  const src = getVideoCanvas()
  if (!src || !lastTubeBbox) return false
  let regionLeft = 0
  let regionRight = src.width
  if (cropMode !== 'dontCrop' && faceBand && !bandSuspended) {
    const dir = chosenSideDir()
    if (dir > 0) regionRight = faceBand.right
    else if (dir < 0) regionLeft = faceBand.left
    else {
      regionLeft = faceBand.left
      regionRight = faceBand.right
    }
  }
  // Use the tight tube extent and require a meaningful overlap depth
  const ext = lastTubeTight || lastTubeBbox
  const overlap =
    Math.min(ext.right, regionRight) - Math.max(ext.left, regionLeft)
  const wExp = expectedTubeWidthPx()
  const minOverlap = Math.max(
    6,
    0.02 * src.width,
    wExp ? OVERLAP_MIN_TUBE_FRACTION * wExp : 0,
  )
  return overlap > minOverlap
}

const updateRedHold = t => {
  const inRegion =
    state === 'tracking' &&
    tubeConfidence >= CONF_HOLD_MIN &&
    tubeOverlapsBand()
  if (inRegion) {
    outOfRegionCounter = 0
    lastInRegionTime = t
  } else if (state === 'tracking') {
    outOfRegionCounter++
  }

  const shouldHold =
    state === 'tracking' &&
    tubeConfidence >= CONF_HOLD_MIN &&
    outOfRegionCounter < OUT_OF_REGION_TICKS &&
    t - lastInRegionTime < 600

  if (shouldHold && !forcesRed && !safetyTripped) {
    forcesRed = true
    forcedRedSince = t
    debugEvent(
      `tube in FaceMesh view — red hold ON (conf ${Math.round(tubeConfidence * 100)}%)`,
    )
  } else if (!shouldHold && forcesRed) {
    forcesRed = false
    forcedRedSince = null
    debugEvent(
      state === 'tracking'
        ? 'tube clear of FaceMesh view — red hold RELEASED'
        : 'tube gone — red hold RELEASED',
    )
  }

  if (
    forcesRed &&
    forcedRedSince !== null &&
    t - forcedRedSince > MAX_FORCED_RED_MS
  ) {
    console.warn(
      'tubeTemplateTracker: red hold exceeded safety limit — releasing',
    )
    debugEvent('SAFETY VALVE: red hold exceeded limit — released')
    safetyTripped = true
    forcesRed = false
    forcedRedSince = null
  }
}

// ── debug display (display-only; toggle via window.rcTubeDebug) ──

export const setTubeTrackerDebug = enabled => {
  const on = !!enabled
  if (on === debugEnabled) return
  debugEnabled = on
  if (!on) {
    removeDebugPanel()
  } else {
    console.log(
      '[tubeTracker] debug ON — panel top-right, overlay on video. ' +
        'Turn off with window.rcTubeDebug(false)',
    )
  }
}

export const isTubeTrackerDebugEnabled = () => debugEnabled

// The console debug toggle (window.rcTubeDebug) is owned by the dispatcher
// in tubeTemplateTracker.js

const removeDebugPanel = () => {
  if (debugPanel?.parentNode) debugPanel.parentNode.removeChild(debugPanel)
  debugPanel = null
  debugEls = null
}

const DEBUG_GREEN = '#1b8a2f'
const DEBUG_RED = '#c62828'
const DEBUG_GRAY = '#666'

const ensureDebugPanel = () => {
  if (debugPanel && document.body.contains(debugPanel)) return
  removeDebugPanel()

  debugPanel = document.createElement('div')
  debugPanel.id = 'rc-tube-tracker-debug'
  debugPanel.style.cssText = `
    position: fixed;
    top: 8px;
    right: 8px;
    z-index: 2147483647;
    background: rgba(255, 255, 255, 0.94);
    color: #333;
    border: 1px solid #ccc;
    box-shadow: 0 1px 4px rgba(0,0,0,0.15);
    font: 11px/1.4 Menlo, Consolas, monospace;
    padding: 6px 8px;
    border-radius: 6px;
    pointer-events: none;
    width: 262px;
  `

  const sectionTitle = text => {
    const el = document.createElement('div')
    el.textContent = text
    el.style.cssText = `color:${DEBUG_GRAY};font-size:9px;letter-spacing:0.08em;margin-top:5px;border-top:1px solid #ddd;padding-top:3px;`
    return el
  }

  const status = document.createElement('div')
  status.style.cssText = 'font-weight:bold;white-space:normal;'

  const makeGrid = () => {
    const grid = document.createElement('div')
    grid.style.cssText =
      'display:grid;grid-template-columns:74px 1fr;gap:0 6px;font-size:10px;margin-top:2px;'
    return grid
  }
  const addRow = (grid, labelText) => {
    const label = document.createElement('div')
    label.textContent = labelText
    label.style.cssText = `color:${DEBUG_GRAY};`
    const value = document.createElement('div')
    grid.appendChild(label)
    grid.appendChild(value)
    return value
  }
  const grid = makeGrid()
  const rows = {
    state: addRow(grid, 'state'),
    lock: addRow(grid, 'lock'),
    conf: addRow(grid, 'confidence'),
    tube: addRow(grid, 'tube'),
    hand: addRow(grid, 'hand'),
    band: addRow(grid, 'band'),
    hold: addRow(grid, 'red hold'),
  }

  const thumbs = document.createElement('div')
  thumbs.style.cssText = 'display:flex;gap:6px;margin:5px 0 2px;'
  const makeThumb = labelText => {
    const wrap = document.createElement('div')
    const label = document.createElement('div')
    label.textContent = labelText
    label.style.cssText = `color:${DEBUG_GRAY};font-size:10px;`
    const canvas = document.createElement('canvas')
    canvas.width = 122
    canvas.height = 91
    canvas.style.cssText =
      'border:1px solid #bbb;border-radius:3px;background:#eee;width:122px;height:91px;'
    wrap.appendChild(label)
    wrap.appendChild(canvas)
    thumbs.appendChild(wrap)
    return canvas
  }
  const camCanvas = makeThumb('camera')
  const fmCanvas = makeThumb('FaceMesh sees')

  const costTitle = sectionTitle('COST — avg ms · calls/s · ≈CPU')
  const costGrid = makeGrid()
  const costRows = {
    detector: addRow(costGrid, 'detector'),
    hands: addRow(costGrid, 'hand model'),
    mask: addRow(costGrid, 'face mask'),
    total: addRow(costGrid, 'total'),
  }

  const eventsTitle = sectionTitle('EVENTS')
  const events = document.createElement('div')
  events.style.cssText = `color:${DEBUG_GRAY};font-size:10px;white-space:pre-wrap;`

  debugPanel.appendChild(status)
  debugPanel.appendChild(grid)
  debugPanel.appendChild(thumbs)
  debugPanel.appendChild(costTitle)
  debugPanel.appendChild(costGrid)
  debugPanel.appendChild(eventsTitle)
  debugPanel.appendChild(events)
  document.body.appendChild(debugPanel)
  debugEls = { status, rows, costRows, events, camCanvas, fmCanvas }
}

const debugStatusNow = () => {
  if (!armed)
    return {
      text: 'Idle — waiting for a tube measurement page',
      color: DEBUG_GRAY,
    }
  switch (state) {
    case 'scanning': {
      if (!guideQuad || now() - guideQuad.t > GUIDE_QUAD_FRESH_MS)
        return {
          text: 'Waiting for the tube guide (eyes not found yet)',
          color: DEBUG_RED,
        }
      if (handDetector && !handDetectorFailed && !freshHandBboxes().length)
        return {
          text: 'No hand detected — no hand, no tube',
          color: DEBUG_RED,
        }
      if (guideTriggerTicks > 0)
        return {
          text: `Paper in guide — sampling (${guideTriggerTicks}/${GUIDE_TRIGGER_TICKS})`,
          color: DEBUG_GREEN,
        }
      const frac = guideDebug
        ? Math.round(Math.max(guideDebug.fracJump, 0) * 100)
        : 0
      return {
        text: `Watching guide for paper — ${frac}% paper-like (need ${Math.round(GUIDE_TRIGGER_FRACTION * 100)}%)`,
        color: DEBUG_RED,
      }
    }
    case 'tracking': {
      const conf = `${Math.round(tubeConfidence * 100)}% conf${handConfirmedLock ? ', hand-locked' : ''}`
      return forcesRed
        ? {
            text: `Tube tracked (${conf}) — overlaps face band, eyes held RED`,
            color: DEBUG_RED,
          }
        : {
            text: `Tube tracked (${conf}) — clear of face band, snapshot OK`,
            color: DEBUG_GREEN,
          }
    }
    case 'absent':
      return safetyTripped
        ? {
            text: 'Released by safety valve — check tracking',
            color: DEBUG_RED,
          }
        : {
            text: 'Tube out of camera — snapshot OK (watching for re-entry)',
            color: DEBUG_GREEN,
          }
    default:
      return { text: state, color: DEBUG_GRAY }
  }
}

const drawMirroredThumb = (thumbCanvas, sourceCanvas) => {
  const cctx = thumbCanvas.getContext('2d')
  cctx.clearRect(0, 0, thumbCanvas.width, thumbCanvas.height)
  cctx.save()
  cctx.translate(thumbCanvas.width, 0)
  cctx.scale(-1, 1)
  cctx.drawImage(sourceCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height)
  cctx.restore()
}

const formatCost = c => {
  if (c.ema === null) return '—'
  const cpu = (c.ema * c.rate) / 10 // ms × calls/s → % of one core
  return `${c.ema.toFixed(1)} · ${c.rate.toFixed(1)}/s · ≈${cpu.toFixed(1)}%`
}

const updateDebugPanel = t => {
  if (t - lastDebugPanelUpdate < DEBUG_PANEL_UPDATE_MS) return
  lastDebugPanelUpdate = t
  if (!document.body) return
  ensureDebugPanel()
  const { rows, costRows } = debugEls

  const { text, color } = debugStatusNow()
  debugEls.status.textContent = text
  debugEls.status.style.color = color

  rows.state.textContent = armed ? state : 'idle (not armed)'

  if (state === 'tracking') {
    rows.lock.textContent = handConfirmedLock
      ? 'sticky — hand seen on tube'
      : 'unconfirmed (no hand seen yet)'
    rows.conf.textContent = `${Math.round(tubeConfidence * 100)}% (red hold needs ≥${Math.round(CONF_HOLD_MIN * 100)}%)`
  } else {
    rows.lock.textContent = '—'
    rows.conf.textContent = '—'
  }

  if (state === 'tracking' && debugDetectInfo) {
    const bgPart =
      debugDetectInfo.bgDistMean !== null &&
      debugDetectInfo.bgDistMean !== undefined
        ? ` · bgΔ${Math.round(debugDetectInfo.bgDistMean)} (wall if <${STATIC_BG_DIST_MAX})`
        : ''
    rows.tube.textContent = `${Math.round(debugDetectInfo.areaPx)}px²${bgPart}`
  } else if (state === 'tracking') {
    rows.tube.textContent = 'missed this tick (confidence decaying)'
  } else if (state === 'absent' && lastTubeBbox) {
    rows.tube.textContent = 'out of camera — last position kept'
  } else if (guideDebug) {
    rows.tube.textContent = `guide ${Math.round(guideDebug.fracJump * 100)}% paper-like (need ${Math.round(GUIDE_TRIGGER_FRACTION * 100)}%)`
  } else {
    rows.tube.textContent = 'none'
  }

  if (handDetectorFailed) {
    rows.hand.textContent = 'model unavailable — checks off'
  } else if (!handDetector) {
    rows.hand.textContent = handDetectorPromise ? 'model loading…' : 'off'
  } else if (lastHands && t - lastHands.t <= HAND_FRESH_MS) {
    const age = ((t - lastHands.t) / 1000).toFixed(1)
    rows.hand.textContent = `${lastHands.hands.length} in view (${age}s ago)`
  } else {
    rows.hand.textContent = 'none seen recently'
  }

  if (faceBand) {
    const dir = chosenSideDir()
    const bandText =
      dir > 0
        ? `masks x > ${Math.round(faceBand.right)}px (tube side)`
        : dir < 0
          ? `masks x < ${Math.round(faceBand.left)}px (tube side)`
          : `${Math.round(faceBand.left)}–${Math.round(faceBand.right)}px (both sides)`
    rows.band.textContent = `${bandText}${bandSuspended ? ' (suspended)' : ''}`
  } else {
    rows.band.textContent = 'waiting for face'
  }

  rows.hold.textContent = forcesRed ? 'ON — spacebar disabled' : 'off'
  rows.hold.style.color = forcesRed ? DEBUG_RED : DEBUG_GREEN

  for (const c of Object.values(costs)) {
    if (!c.windowStart) c.windowStart = t
    else if (t - c.windowStart >= 1000) {
      c.rate = (c.count * 1000) / (t - c.windowStart)
      c.count = 0
      c.windowStart = t
    }
  }
  costRows.detector.textContent = formatCost(costs.detector)
  costRows.hands.textContent = formatCost(costs.hands)
  costRows.mask.textContent = formatCost(costs.mask)
  let totalCpu = 0
  for (const c of Object.values(costs))
    if (c.ema !== null) totalCpu += (c.ema * c.rate) / 10
  costRows.total.textContent = `≈${totalCpu.toFixed(1)}% of one core`

  const src = getVideoCanvas()
  if (src && t - lastFmThumbUpdate >= DEBUG_FM_THUMB_UPDATE_MS) {
    lastFmThumbUpdate = t
    drawMirroredThumb(debugEls.camCanvas, src)
    const input = getFaceMeshVideoInput()
    if (input) drawMirroredThumb(debugEls.fmCanvas, input)
  }

  debugEls.events.textContent = debugEvents
    .map(e => `${(e.t / 1000).toFixed(1)}s  ${e.msg}`)
    .join('\n')
}

// Overlay annotations on the video (no-op unless debug is enabled)
export const renderTubeTrackerDebug = (ctx, videoRect) => {
  if (!debugEnabled || !ctx || !videoRect) return
  const src = getVideoCanvas()
  if (!src || !src.width || !src.height) return
  const srcW = src.width
  const srcH = src.height
  const scale = Math.max(videoRect.width / srcW, videoRect.height / srcH)
  const offsetX = (srcW * scale - videoRect.width) / 2
  const offsetY = (srcH * scale - videoRect.height) / 2
  const dispX = camX => videoRect.left + (srcW - camX) * scale - offsetX
  const dispY = camY => videoRect.top + camY * scale - offsetY

  ctx.save()

  // State badge above the video
  ctx.font = 'bold 12px Menlo, Consolas, monospace'
  ctx.textAlign = 'left'
  ctx.fillStyle = forcesRed ? '#ff3b30' : '#00c853'
  ctx.fillText(
    `tubeTracker: ${state}${forcesRed ? ' — HOLDING RED' : ''}`,
    videoRect.left,
    Math.max(12, videoRect.top - 6),
  )

  // Guide quadrilateral (magenta) with paper-like fraction while scanning
  if (guideQuad && now() - guideQuad.t <= GUIDE_QUAD_FRESH_MS) {
    ctx.strokeStyle = '#e040fb'
    ctx.lineWidth = 1.5
    ctx.setLineDash([5, 4])
    ctx.beginPath()
    guideQuad.pts.forEach((p, i) => {
      const x = dispX(p.x)
      const y = dispY(p.y)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.closePath()
    ctx.stroke()
    ctx.setLineDash([])
    if (guideDebug && state !== 'tracking') {
      ctx.fillStyle = '#e040fb'
      ctx.font = '11px Menlo, Consolas, monospace'
      const p0 = guideQuad.pts[0]
      ctx.fillText(
        `guide ${Math.round(guideDebug.fracJump * 100)}%`,
        dispX(p0.x) + 4,
        dispY(p0.y) - 4,
      )
    }
  }

  // Face band mask edge(s) (yellow)
  if (faceBand && cropMode !== 'dontCrop') {
    const dir = chosenSideDir()
    const edges =
      dir > 0
        ? [faceBand.right]
        : dir < 0
          ? [faceBand.left]
          : [faceBand.left, faceBand.right]
    ctx.strokeStyle = bandSuspended ? '#bdbdbd' : '#ffd54d'
    ctx.lineWidth = 2
    ctx.setLineDash(bandSuspended ? [3, 3] : [])
    for (const camX of edges) {
      const x = dispX(camX)
      if (x >= videoRect.left && x <= videoRect.right) {
        ctx.beginPath()
        ctx.moveTo(x, videoRect.top)
        ctx.lineTo(x, videoRect.bottom)
        ctx.stroke()
      }
    }
    ctx.setLineDash([])
    ctx.fillStyle = bandSuspended ? '#bdbdbd' : '#ffd54d'
    ctx.font = 'bold 11px Menlo, Consolas, monospace'
    const xLabel = dispX(edges[0])
    if (xLabel >= videoRect.left && xLabel <= videoRect.right)
      ctx.fillText(
        `FaceMesh mask edge${bandSuspended ? ' (suspended)' : ''}`,
        xLabel + 4,
        videoRect.bottom - 6,
      )
  }

  // Live tube box (red while holding, green when clear, gray when stale)
  if (lastTubeBbox) {
    const stale = now() - lastTubeBbox.t > 600
    const xA = dispX(lastTubeBbox.left)
    const xB = dispX(lastTubeBbox.right)
    const y1 = dispY(lastTubeBbox.top)
    const y2 = dispY(lastTubeBbox.bottom)
    const style = stale ? '#9e9e9e' : forcesRed ? '#ff3b30' : '#00c853'
    ctx.strokeStyle = style
    ctx.lineWidth = 2
    ctx.setLineDash(stale ? [3, 3] : [])
    ctx.strokeRect(Math.min(xA, xB), y1, Math.abs(xB - xA), y2 - y1)
    ctx.setLineDash([])
    // Tight extent (inner vertical lines) — what the overlap decision uses
    if (lastTubeTight) {
      ctx.lineWidth = 1
      for (const camX of [lastTubeTight.left, lastTubeTight.right]) {
        const x = dispX(camX)
        ctx.beginPath()
        ctx.moveTo(x, y1)
        ctx.lineTo(x, y2)
        ctx.stroke()
      }
      ctx.lineWidth = 2
    }
    ctx.fillStyle = style
    ctx.font = '11px Menlo, Consolas, monospace'
    ctx.fillText(
      `tube${state === 'tracking' ? ` ${Math.round(tubeConfidence * 100)}%${handConfirmedLock ? ' ✋' : ''}` : ' (last seen)'}${stale ? ' stale' : ''}`,
      Math.min(xA, xB),
      Math.max(12, y1 - 4),
    )
  }

  // Face bounding box (cyan dashed vertical lines)
  if (lastFaceBbox) {
    ctx.strokeStyle = '#4dd2ff'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    for (const camX of [lastFaceBbox.minX, lastFaceBbox.maxX]) {
      const x = dispX(camX)
      if (x >= videoRect.left && x <= videoRect.right) {
        ctx.beginPath()
        ctx.moveTo(x, videoRect.top)
        ctx.lineTo(x, videoRect.bottom)
        ctx.stroke()
      }
    }
    ctx.setLineDash([])
    ctx.fillStyle = '#4dd2ff'
    ctx.font = '11px Menlo, Consolas, monospace'
    const labelX = dispX(lastFaceBbox.maxX)
    if (labelX >= videoRect.left && labelX <= videoRect.right)
      ctx.fillText('face', labelX + 3, videoRect.top + 12)
  }

  // Hand keypoints (orange)
  if (lastHands && now() - lastHands.t <= HAND_FRESH_MS) {
    ctx.fillStyle = '#ff9100'
    ctx.font = '11px Menlo, Consolas, monospace'
    for (const hand of lastHands.hands) {
      for (const kp of hand.keypoints) {
        const x = dispX(kp.x)
        const y = dispY(kp.y)
        if (
          x >= videoRect.left &&
          x <= videoRect.right &&
          y >= videoRect.top &&
          y <= videoRect.bottom
        ) {
          ctx.beginPath()
          ctx.arc(x, y, 2, 0, 2 * Math.PI)
          ctx.fill()
        }
      }
      const wrist = hand.keypoints[0]
      if (wrist) {
        const wx = dispX(wrist.x)
        const wy = dispY(wrist.y)
        if (wx >= videoRect.left && wx <= videoRect.right)
          ctx.fillText(
            'hand',
            wx + 4,
            Math.min(Math.max(wy, videoRect.top + 12), videoRect.bottom - 4),
          )
      }
    }
  }

  ctx.restore()
}
