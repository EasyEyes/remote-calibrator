// handExcludeTracker.js — MediaPipe Hands red hold for
// _calibrateDistanceExcludeTube = 'excludeHand'.
// While a hand is in the camera's field of view, the irises are held red
// (space bar disabled). FaceMesh always receives the full camera frame.

import * as handPoseDetection from '@tensorflow-models/hand-pose-detection'

const VIDEO_CANVAS_ID = 'webgazerVideoCanvas'

// ── defaults (overridden by _calibrateDistanceExcludeTubeTweak) ──

const DEFAULT_HAND_CHECK_MS = 150
const DEFAULT_HAND_MIN_SCORE = 0.3
const DEFAULT_HAND_RELEASE_MS = 1500
const DEFAULT_LITE_MODEL = 0
const MAX_FORCED_RED_MS = 120000

let handCheckMs = DEFAULT_HAND_CHECK_MS
let handMinScore = DEFAULT_HAND_MIN_SCORE
let handReleaseMs = DEFAULT_HAND_RELEASE_MS
let liteModel = DEFAULT_LITE_MODEL

// ── module state ──

let armed = false
let rcRef = null

let handDetector = null
let handDetectorPromise = null
let handDetectorFailed = false
let handEstimateInFlight = false
let lastHandCheckTime = 0
let lastHands = null // { hands: [{ keypoints, score }], t }
let lastHandSeenTime = 0

let forcesRed = false
let forcedRedSince = null
let safetyTripped = false

let trackingLog = []
const TRACKING_LOG_MAX = 2000

// ── debug state ──

let debugEnabled = false
let debugPanel = null
let debugEls = null
const debugEvents = []
let lastDebugPanelUpdate = 0
let lastThumbUpdate = 0
const DEBUG_PANEL_UPDATE_MS = 150
const DEBUG_THUMB_UPDATE_MS = 300
const DEBUG_EVENTS_MAX = 5

const costs = {
  hands: { ema: null, last: 0, count: 0, windowStart: 0, rate: 0 },
}

const recordCost = (name, ms) => {
  const c = costs[name]
  c.last = ms
  c.ema = c.ema === null ? ms : c.ema + 0.1 * (ms - c.ema)
  c.count++
}

const now = () => performance.now()

const getVideoCanvas = () => document.getElementById(VIDEO_CANVAS_ID)

const debugEvent = msg => {
  if (!debugEnabled) return
  debugEvents.unshift({ t: now(), msg })
  if (debugEvents.length > DEBUG_EVENTS_MAX) debugEvents.pop()
  console.log(`[tubeTracker] ${msg}`)
}

const resetState = () => {
  forcesRed = false
  forcedRedSince = null
  lastHandSeenTime = 0
}

const modelType = () => (liteModel ? 'lite' : 'full')

const disposeHandDetector = () => {
  if (handDetector?.dispose) {
    try {
      handDetector.dispose()
    } catch {
      // ignore
    }
  }
  handDetector = null
  handDetectorPromise = null
  handDetectorFailed = false
}

export const applyHandTweak = tweak => {
  if (!tweak) return
  if (typeof tweak.handCheckMs === 'number' && tweak.handCheckMs > 0)
    handCheckMs = tweak.handCheckMs
  if (typeof tweak.minScore === 'number' && tweak.minScore >= 0)
    handMinScore = Math.min(1, tweak.minScore)
  if (typeof tweak.releaseMs === 'number' && tweak.releaseMs >= 0)
    handReleaseMs = tweak.releaseMs
  if (typeof tweak.liteModel === 'number') {
    const next = tweak.liteModel ? 1 : 0
    if (next !== liteModel) {
      liteModel = next
      disposeHandDetector()
    }
  }
}

export const getHandTweak = () => ({
  handCheckMs,
  minScore: handMinScore,
  releaseMs: handReleaseMs,
  liteModel,
})

const ensureHandDetector = () => {
  if (handDetector || handDetectorPromise || handDetectorFailed) return
  const type = modelType()
  handDetectorPromise = handPoseDetection
    .createDetector(handPoseDetection.SupportedModels.MediaPipeHands, {
      runtime: 'tfjs',
      modelType: type,
      maxHands: 2,
    })
    .then(detector => {
      handDetector = detector
      debugEvent(`hand detector ready (${type})`)
    })
    .catch(err => {
      handDetectorFailed = true
      handDetectorPromise = null
      console.warn(
        'handExcludeTracker: hand detector unavailable — red hold disabled',
        err,
      )
      debugEvent('hand detector unavailable — red hold disabled')
    })
}

const maybeUpdateHands = t => {
  if (!handDetector || handEstimateInFlight) return
  if (t - lastHandCheckTime < handCheckMs) return
  lastHandCheckTime = t
  const src = getVideoCanvas()
  if (!src || !src.width || !src.height) return
  handEstimateInFlight = true
  const inferStart = now()
  handDetector
    .estimateHands(src, { flipHorizontal: false })
    .then(hands => {
      recordCost('hands', now() - inferStart)
      const kept = (hands || []).filter(h => (h.score ?? 1) >= handMinScore)
      lastHands = { hands: kept, t: now() }
      if (kept.length) {
        lastHandSeenTime = lastHands.t
        trackingLog.push({
          t: Math.round(lastHands.t),
          hands: kept.length,
          score: Math.round((kept[0].score ?? 1) * 100) / 100,
        })
        if (trackingLog.length > TRACKING_LOG_MAX) trackingLog.shift()
      }
    })
    .catch(() => {})
    .finally(() => {
      handEstimateInFlight = false
    })
}

const updateRedHold = t => {
  const handInView =
    lastHandSeenTime > 0 && t - lastHandSeenTime < handReleaseMs

  if (handInView && !forcesRed && !safetyTripped) {
    forcesRed = true
    forcedRedSince = t
    debugEvent('hand in view — red hold ON')
  } else if (!handInView && forcesRed) {
    forcesRed = false
    forcedRedSince = null
    debugEvent('no hand in view — red hold RELEASED')
  }

  if (safetyTripped && !handInView) safetyTripped = false

  if (
    forcesRed &&
    forcedRedSince !== null &&
    t - forcedRedSince > MAX_FORCED_RED_MS
  ) {
    console.warn(
      'handExcludeTracker: red hold exceeded safety limit — releasing',
    )
    debugEvent('SAFETY VALVE: red hold exceeded limit — released')
    safetyTripped = true
    forcesRed = false
    forcedRedSince = null
  }
}

export const configureHandExclude = ({ debugBool } = {}) => {
  lastHands = null
  resetState()
  ensureHandDetector()
  if (debugBool !== undefined) setTubeTrackerDebug(debugBool)
}

export const armHandExclude = (RC = null) => {
  rcRef = RC || rcRef
  armed = true
  safetyTripped = false
  trackingLog = []
  if (rcRef) rcRef._tubeTrackingLog = trackingLog
  ensureHandDetector()
  resetState()
  debugEvent(
    `armed — excludeHand (${modelType()}, check=${handCheckMs}ms, minScore=${handMinScore}, release=${handReleaseMs}ms)`,
  )
}

export const disarmHandExclude = () => {
  if (armed) debugEvent('disarmed (overlay cleared / page left)')
  armed = false
  rcRef = null
  resetState()
  removeDebugPanel()
}

export const handExcludeForcesRed = () => forcesRed

export const getHandExcludeLog = () => trackingLog

export const getHandExcludeConfidence = () => (forcesRed ? 1 : 0)

export const getFaceMeshVideoInput = () => getVideoCanvas()

export const updateHandExclude = () => {
  const t = now()
  if (debugEnabled && armed) updateDebugPanel(t)
  if (!armed) return
  maybeUpdateHands(t)
  updateRedHold(t)
}

export const setTubeTrackerDebug = enabled => {
  const on = !!enabled
  if (on === debugEnabled) return
  debugEnabled = on
  if (!on) removeDebugPanel()
}

export const isTubeTrackerDebugEnabled = () => debugEnabled

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
    hand: addRow(grid, 'hand'),
    hold: addRow(grid, 'red hold'),
    tweak: addRow(grid, 'tweak'),
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
    hands: addRow(costGrid, 'hand model'),
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

const debugStatusNow = t => {
  if (!armed)
    return {
      text: 'Idle — waiting for a tube measurement page',
      color: DEBUG_GRAY,
    }
  if (handDetectorFailed)
    return {
      text: 'Hand model unavailable — red hold disabled',
      color: DEBUG_RED,
    }
  if (!handDetector) return { text: 'Loading hand model…', color: DEBUG_GRAY }
  if (safetyTripped)
    return {
      text: 'Released by safety valve — hand still in view?',
      color: DEBUG_RED,
    }
  if (forcesRed)
    return {
      text: 'Hand in view — eyes held RED, spacebar disabled',
      color: DEBUG_RED,
    }
  if (lastHandSeenTime > 0 && t - lastHandSeenTime < 3000)
    return {
      text: 'Hand left the view — snapshot OK',
      color: DEBUG_GREEN,
    }
  return { text: 'No hand in view — snapshot OK', color: DEBUG_GREEN }
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
  const cpu = (c.ema * c.rate) / 10
  return `${c.ema.toFixed(1)} · ${c.rate.toFixed(1)}/s · ≈${cpu.toFixed(1)}%`
}

const updateDebugPanel = t => {
  if (t - lastDebugPanelUpdate < DEBUG_PANEL_UPDATE_MS) return
  lastDebugPanelUpdate = t
  if (!document.body) return
  ensureDebugPanel()
  const { rows, costRows } = debugEls

  const { text, color } = debugStatusNow(t)
  debugEls.status.textContent = text
  debugEls.status.style.color = color

  rows.state.textContent = armed
    ? `armed — excludeHand (${modelType()})`
    : 'idle (not armed)'

  if (handDetectorFailed) {
    rows.hand.textContent = 'model unavailable'
  } else if (!handDetector) {
    rows.hand.textContent = handDetectorPromise ? 'model loading…' : 'off'
  } else if (lastHands?.hands.length) {
    const age = ((t - lastHands.t) / 1000).toFixed(1)
    const score = Math.round((lastHands.hands[0].score ?? 1) * 100)
    rows.hand.textContent = `${lastHands.hands.length} in view (${score}%, ${age}s ago)`
  } else if (lastHandSeenTime > 0) {
    rows.hand.textContent = `none (last seen ${((t - lastHandSeenTime) / 1000).toFixed(1)}s ago)`
  } else {
    rows.hand.textContent = 'none seen yet'
  }

  rows.hold.textContent = forcesRed
    ? 'ON — spacebar disabled'
    : safetyTripped
      ? 'off — SAFETY VALVE tripped (waiting for a no-hand gap)'
      : 'off'
  rows.hold.style.color = forcesRed ? DEBUG_RED : DEBUG_GREEN

  rows.tweak.textContent = `${handCheckMs}ms, ${handMinScore}, ${handReleaseMs}ms, ${liteModel}`

  for (const c of Object.values(costs)) {
    if (!c.windowStart) c.windowStart = t
    else if (t - c.windowStart >= 1000) {
      c.rate = (c.count * 1000) / (t - c.windowStart)
      c.count = 0
      c.windowStart = t
    }
  }
  costRows.hands.textContent = formatCost(costs.hands)

  const src = getVideoCanvas()
  if (src && t - lastThumbUpdate >= DEBUG_THUMB_UPDATE_MS) {
    lastThumbUpdate = t
    drawMirroredThumb(debugEls.camCanvas, src)
    const input = getFaceMeshVideoInput()
    if (input) drawMirroredThumb(debugEls.fmCanvas, input)
  }

  debugEls.events.textContent = debugEvents
    .map(e => `${(e.t / 1000).toFixed(1)}s  ${e.msg}`)
    .join('\n')
}

export const renderHandExcludeDebug = (ctx, videoRect) => {
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

  ctx.font = 'bold 12px Menlo, Consolas, monospace'
  ctx.textAlign = 'left'
  ctx.fillStyle = forcesRed ? '#ff3b30' : '#00c853'
  ctx.fillText(
    `handTracker: ${forcesRed ? 'hand in view — HOLDING RED' : 'no hand'}`,
    videoRect.left,
    Math.max(12, videoRect.top - 6),
  )

  if (lastHands && now() - lastHands.t <= 1500) {
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
