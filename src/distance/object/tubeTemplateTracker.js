// tubeTemplateTracker.js — dispatcher for _calibrateDistanceExcludeTube.
//
// doNothing     – feature off (default)
// excludeHand   – MediaPipe Hands; red hold while a hand is in view
//                 (see handExcludeTracker.js)
// crop / cropButShowWhole – LEGACY tube tracking + FaceMesh crop
//                 (see tubeTrackingLegacy.js; delete that file to drop this)
//
// TO DELETE TUBE TRACKING: remove tubeTrackingLegacy.js and the crop
// branches below, then drop 'crop' / 'cropButShowWhole' from EXCLUDE_TUBE_MODES.

import * as handExclude from './handExcludeTracker'
import * as tubeLegacy from './tubeTrackingLegacy'

export const EXCLUDE_TUBE_MODES = [
  'doNothing',
  'excludeHand',
  'crop',
  'cropButShowWhole',
]

const TWEAK_DEFAULTS = {
  handCheckMs: 150,
  minScore: 0.3,
  releaseMs: 1500,
  liteModel: 0,
}

let excludeMode = 'doNothing'

const VIDEO_CANVAS_ID = 'webgazerVideoCanvas'

const getVideoCanvas = () => document.getElementById(VIDEO_CANVAS_ID)

const isCropMode = mode => mode === 'crop' || mode === 'cropButShowWhole'

export const normalizeExcludeTubeMode = raw => {
  if (raw === undefined || raw === null || raw === '') return 'doNothing'
  const key = String(raw).trim()
  return EXCLUDE_TUBE_MODES.includes(key) ? key : null
}

// _calibrateDistanceExcludeTubeTweak — comma-separated checkMs, minScore, holdMs, lite
// Default: 150,0.3,1500,0
// Also accepts named pairs: checkMs=250,lite=1
export const parseExcludeTubeTweak = raw => {
  const out = { ...TWEAK_DEFAULTS }
  if (raw === undefined || raw === null || raw === '') return out
  const str = String(raw).trim()
  if (!str) return out

  if (str.includes('=')) {
    for (const part of str.split(',')) {
      const eq = part.indexOf('=')
      if (eq < 0) continue
      const k = part.slice(0, eq).trim()
      const v = Number(part.slice(eq + 1).trim())
      if (!Number.isFinite(v)) continue
      if (k === 'checkMs') out.handCheckMs = v
      else if (k === 'minScore') out.minScore = v
      else if (k === 'holdMs') out.releaseMs = v
      else if (k === 'lite') out.liteModel = v
    }
    return out
  }

  const nums = str.split(',').map(s => s.trim())
  const n0 = Number(nums[0])
  const n1 = Number(nums[1])
  const n2 = Number(nums[2])
  const n3 = Number(nums[3])
  if (Number.isFinite(n0)) out.handCheckMs = n0
  if (Number.isFinite(n1)) out.minScore = n1
  if (Number.isFinite(n2)) out.releaseMs = n2
  if (Number.isFinite(n3)) out.liteModel = n3
  return out
}

export const configureTubeTracker = ({
  cropMode: mode,
  debugBool,
  tweak,
} = {}) => {
  if (mode !== undefined) {
    const next = normalizeExcludeTubeMode(mode)
    const resolved = next || 'doNothing'
    if (next === null)
      console.warn(
        `_calibrateDistanceExcludeTube: unrecognized value "${mode}", using "doNothing"`,
      )
    if (resolved !== excludeMode) {
      handExclude.disarmHandExclude()
      tubeLegacy.disarmTubeTracker()
    }
    excludeMode = resolved
  }

  if (tweak !== undefined)
    handExclude.applyHandTweak(parseExcludeTubeTweak(tweak))

  if (isCropMode(excludeMode)) {
    tubeLegacy.configureTubeTracker({
      cropMode: excludeMode,
      debugBool,
    })
  } else if (excludeMode === 'excludeHand') {
    handExclude.configureHandExclude({ debugBool })
  } else if (debugBool !== undefined) {
    handExclude.setTubeTrackerDebug(debugBool)
    tubeLegacy.setTubeTrackerDebug(debugBool)
  }
}

export const getTubeCropMode = () => excludeMode

export const getExcludeTubeMode = () => excludeMode

export const armTubeTracker = (RC, opts = {}) => {
  if (excludeMode === 'excludeHand') handExclude.armHandExclude(RC)
  else if (isCropMode(excludeMode)) tubeLegacy.armTubeTracker(RC, opts)
}

export const disarmTubeTracker = () => {
  handExclude.disarmHandExclude()
  tubeLegacy.disarmTubeTracker()
}

export const tubeTrackerForcesRed = () => {
  if (excludeMode === 'excludeHand') return handExclude.handExcludeForcesRed()
  if (isCropMode(excludeMode)) return tubeLegacy.tubeTrackerForcesRed()
  return false
}

export const getTubeTrackingLog = () => {
  if (excludeMode === 'excludeHand') return handExclude.getHandExcludeLog()
  if (isCropMode(excludeMode)) return tubeLegacy.getTubeTrackingLog()
  return []
}

export const getTubeConfidence = () => {
  if (excludeMode === 'excludeHand')
    return handExclude.getHandExcludeConfidence()
  if (isCropMode(excludeMode)) return tubeLegacy.getTubeConfidence()
  return 0
}

export const setTubeGuideQuad = (screenPts, videoRect) => {
  if (isCropMode(excludeMode)) tubeLegacy.setTubeGuideQuad(screenPts, videoRect)
}

export const getFaceMeshVideoInput = () => {
  if (isCropMode(excludeMode)) return tubeLegacy.getFaceMeshVideoInput()
  return getVideoCanvas()
}

export const renderTubeCropDisplay = (ctx, videoRect) => {
  if (isCropMode(excludeMode)) tubeLegacy.renderTubeCropDisplay(ctx, videoRect)
}

export const updateTubeTracker = (meshData, rawActive) => {
  if (excludeMode === 'excludeHand') handExclude.updateHandExclude()
  else if (isCropMode(excludeMode))
    tubeLegacy.updateTubeTracker(meshData, rawActive)
}

export const setTubeTrackerDebug = enabled => {
  handExclude.setTubeTrackerDebug(enabled)
  tubeLegacy.setTubeTrackerDebug(enabled)
}

export const isTubeTrackerDebugEnabled = () =>
  handExclude.isTubeTrackerDebugEnabled() ||
  tubeLegacy.isTubeTrackerDebugEnabled()

if (typeof window !== 'undefined') {
  window.rcTubeDebug = setTubeTrackerDebug
}

export const renderTubeTrackerDebug = (ctx, videoRect) => {
  if (excludeMode === 'excludeHand')
    handExclude.renderHandExcludeDebug(ctx, videoRect)
  else if (isCropMode(excludeMode))
    tubeLegacy.renderTubeTrackerDebug(ctx, videoRect)
}
