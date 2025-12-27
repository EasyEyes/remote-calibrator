import { phrases } from '../i18n/schema'
import Swal from 'sweetalert2'
import { swalInfoOptions } from '../components/swalOptions'
import { setDefaultVideoPosition } from '../components/video'
import { cameraShutterSound } from '../components/sound'
import {
  createStepInstructionsUI,
  renderStepInstructions,
  createAnchoredStepperUI,
} from './stepByStepInstructionHelps'
import { parseInstructions } from './instructionParserAdapter'
import { startIrisDrawingWithMesh } from './distanceTrack'
import { getFullscreen, isFullscreen, toFixedNumber } from '../components/utils'

// Constants for credit card size in centimeters
const CREDIT_CARD_SHORT_CM = 5.398
const CREDIT_CARD_LONG_CM = 8.56

// Assumed adult IPD in centimeters for deriving factorVpxCm to keep downstream code working
const ASSUMED_IPD_CM = 6.3
const QUAD_BASE_RATIO_DEFAULT = 1.3

// Shared state holder for outline rendering
let cardState = null

function getCamParams(RC, videoTopOffsetPx = 0) {
  const cam = getCameraResolution(RC)
  if (!cam) return null
  const rect = getExpectedVideoRect(RC, videoTopOffsetPx)
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  return { cam, cx, cy }
}

function getVideoContainerRect() {
  const v = document.getElementById('webgazerVideoContainer')
  if (!v) return null
  const rect = v.getBoundingClientRect()
  return { el: v, rect }
}

function getCameraResolution(RC) {
  try {
    const vp = RC?.gazeTracker?.webgazer?.videoParamsToReport
    if (vp && vp.width && vp.height) {
      return {
        width: vp.width,
        height: vp.height,
        maxWidth: vp.maxWidth,
        maxHeight: vp.maxHeight,
      }
    }
  } catch (_) {}
  return null
}

function createOverlayLayer() {
  const layer = document.createElement('div')
  layer.id = 'just-credit-card-overlay'
  layer.style.position = 'fixed'
  layer.style.left = '0'
  layer.style.top = '0'
  layer.style.width = '100%'
  layer.style.height = '100%'
  layer.style.pointerEvents = 'none'
  layer.style.zIndex = '1000000000000'
  return layer
}

// Inject a subtle flicker animation for guide lines (once)
function ensureFlickerStyle() {
  const styleId = 'just-credit-card-flicker-style'
  if (document.getElementById(styleId)) return
  const s = document.createElement('style')
  s.id = styleId
  s.textContent = `
    @keyframes jc-line-flicker {
      0% { opacity: 0.1; }
      45% { opacity: 1; }
      55% { opacity: 1; }
      100% { opacity: 0.1; }
    }
  `
  document.head.appendChild(s)
}

function createDashedGuide() {
  const guide = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  guide.id = 'just-credit-card-guide'
  guide.style.position = 'absolute'
  guide.style.overflow = 'visible'
  guide.style.pointerEvents = 'none'
  // Position off-screen initially to prevent flash at wrong position
  guide.style.left = '-9999px'
  guide.style.top = '-9999px'
  guide.style.opacity = '0'
  guide.style.transition = 'opacity 0.15s ease-in'

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('stroke', 'rgba(0, 180, 0, 0.95)')
  path.setAttribute('stroke-width', '3')
  path.setAttribute('stroke-dasharray', '8,4')
  path.setAttribute('fill', 'none')
  path.style.animation = 'jc-line-flicker 0.125s ease-in-out infinite'
  guide.appendChild(path)

  return guide
}

function createCardOutline() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.id = 'just-credit-card-outline'
  svg.style.position = 'absolute'
  svg.style.overflow = 'visible'
  svg.style.pointerEvents = 'none'
  svg.style.left = '-9999px'
  svg.style.top = '-9999px'
  svg.style.opacity = '0'
  svg.style.transition = 'opacity 0.1s ease-in'

  const body = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  body.id = 'just-credit-card-outline-body'
  body.setAttribute('stroke', 'rgba(0, 200, 0, 0.9)')
  body.setAttribute('stroke-width', '3') // match dashed line thickness
  body.setAttribute('fill', 'none')
  svg.appendChild(body)

  const top = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  top.id = 'just-credit-card-outline-top'
  top.setAttribute('stroke', 'transparent')
  top.setAttribute('stroke-width', '2')
  top.setAttribute('fill', 'none')
  svg.appendChild(top)

  return svg
}

function positionGuide(guide, p1, p2) {
  // Safety check
  if (!p1 || !p2) return

  // Calculate length and angle
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const length = Math.sqrt(dx * dx + dy * dy)
  const angle = Math.atan2(dy, dx) * (180 / Math.PI)

  // Position SVG at p1 and rotate
  guide.style.left = `${p1.x}px`
  guide.style.top = `${p1.y}px`
  guide.style.width = `${Math.max(0, length)}px`
  guide.style.height = '30px' // Enough height for the curve
  guide.style.transformOrigin = '0 0'
  guide.style.transform = `rotate(${angle}deg)`

  // Draw the rounded path with a moderate curve.
  const rBase = (0.318 / 5.398) * length * 0.45
  const rX = Math.min(rBase, length * 0.2)
  const rY = rX * 0.4 // bend control
  const w = length
  const d = `M 0 0 Q ${rX} -${rY} ${rX} -${rY} L ${w - rX} -${rY} Q ${w - rX} -${rY} ${w} 0`

  const path = guide.querySelector('path')
  if (path) path.setAttribute('d', d)

  // Ensure opacity is 1
  guide.style.opacity = '1'
}

function positionCardOutline() {
  const cs = cardState
  if (!cs || !cs.RCRef) return
  const cardOutlineEl = cs.cardOutline
  if (!cardOutlineEl) return
  const bodyPath = cardOutlineEl.querySelector('#just-credit-card-outline-body')
  const topPath = cardOutlineEl.querySelector('#just-credit-card-outline-top')
  if (!bodyPath || !topPath) return

  // Clamp helper to keep outline within the expected video rect
  const expectedRect = getExpectedVideoRect(cs.RCRef, cs.videoTopOffsetPx || 0)
  if (!expectedRect) return
  const clampToRect = ({ x, y }) => ({
    x: Math.min(
      Math.max(x, expectedRect.left),
      expectedRect.left + expectedRect.width,
    ),
    y: Math.min(
      Math.max(y, expectedRect.top),
      expectedRect.top + expectedRect.height,
    ),
  })

  const dx = cs.p2.x - cs.p1.x
  const dy = cs.p2.y - cs.p1.y
  const topWidthVpx = Math.max(0, Math.hypot(dx, dy))
  if (!topWidthVpx) return

  const topUnit = { x: dx / topWidthVpx, y: dy / topWidthVpx }
  let perpDown = { x: topUnit.y, y: -topUnit.x }
  // Ensure the quadrilateral extends downward on screen (positive Y).
  if (perpDown.y < 0) {
    perpDown = { x: -perpDown.x, y: -perpDown.y }
  }

  const quadBaseRatio =
    typeof cs.quadBaseRatio === 'number'
      ? cs.quadBaseRatio
      : QUAD_BASE_RATIO_DEFAULT
  const bottomWidthVpx = topWidthVpx * quadBaseRatio
  const heightVpx = topWidthVpx / 2
  const halfBottom = bottomWidthVpx / 2

  const topMid = { x: (cs.p1.x + cs.p2.x) / 2, y: (cs.p1.y + cs.p2.y) / 2 }
  const bottomMid = {
    x: topMid.x + perpDown.x * heightVpx,
    y: topMid.y + perpDown.y * heightVpx,
  }

  // Use the ideal quad based on current p1/p2 (no scaling). We'll clip via SVG.
  const tl = { x: cs.p1.x, y: cs.p1.y }
  const tr = { x: cs.p2.x, y: cs.p2.y }
  const bl = {
    x: bottomMid.x - topUnit.x * halfBottom,
    y: bottomMid.y - topUnit.y * halfBottom,
  }
  const br = {
    x: bottomMid.x + topUnit.x * halfBottom,
    y: bottomMid.y + topUnit.y * halfBottom,
  }

  cardOutlineEl.setAttribute(
    'viewBox',
    `0 0 ${Math.max(1, window.innerWidth)} ${Math.max(1, window.innerHeight)}`,
  )
  // Update clipPath to hide anything outside the video rect (cosmetic only)
  let defs = cardOutlineEl.querySelector('defs')
  if (!defs) {
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
    cardOutlineEl.prepend(defs)
  }
  let clip = defs.querySelector('#just-credit-card-clip')
  if (!clip) {
    clip = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath')
    clip.id = 'just-credit-card-clip'
    defs.appendChild(clip)
  }
  let clipRect = clip.querySelector('rect')
  if (!clipRect) {
    clipRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    clip.appendChild(clipRect)
  }
  clipRect.setAttribute('x', String(expectedRect.left))
  clipRect.setAttribute('y', String(expectedRect.top))
  clipRect.setAttribute('width', String(expectedRect.width))
  clipRect.setAttribute('height', String(expectedRect.height))
  cardOutlineEl.style.left = '0px'
  cardOutlineEl.style.top = '0px'
  cardOutlineEl.style.width = '100%'
  cardOutlineEl.style.height = '100%'
  cardOutlineEl.style.transform = 'none'

  // Body: draw only vertical sides; horizontals stay invisible.
  bodyPath.setAttribute('clip-path', 'url(#just-credit-card-clip)')
  topPath.setAttribute('clip-path', 'url(#just-credit-card-clip)')
  bodyPath.setAttribute(
    'd',
    `M ${tl.x} ${tl.y} L ${bl.x} ${bl.y} M ${tr.x} ${tr.y} L ${br.x} ${br.y}`,
  )
  topPath.setAttribute('d', `M ${tl.x} ${tl.y} L ${tr.x} ${tr.y}`)
  cardOutlineEl.style.opacity = '1'
}

// Get the expected video rect based on known positioning (below camera, centered horizontally)
// This avoids relying on getBoundingClientRect which may return stale values
function getExpectedVideoRect(RC, videoTopOffsetPx) {
  const vw = window.innerWidth
  const vh = window.innerHeight

  // Get camera aspect ratio
  const cam = getCameraResolution(RC)
  const camAspect = cam ? cam.width / cam.height : 16 / 9

  // Available space: width capped to 95% of viewport, height below the desired top offset
  const maxWidth = vw * 0.95
  const availWidth = maxWidth
  const availHeight = Math.max(0, vh - (videoTopOffsetPx || 0))

  // Calculate size that fits while maintaining aspect ratio
  let videoW, videoH
  if (availWidth / availHeight > camAspect) {
    videoH = availHeight
    videoW = videoH * camAspect
  } else {
    videoW = availWidth
    videoH = videoW / camAspect
  }

  // Top is pinned to the requested offset (0.5 cm below blue line)
  const topOffset = Math.max(0, videoTopOffsetPx || 0)
  // Horizontally centered on the camera (screen center)
  const leftOffset = (vw - videoW) / 2

  return {
    left: leftOffset,
    top: topOffset,
    width: videoW,
    height: videoH,
  }
}

function getInstructions(RC, isRepeat) {
  const fallbackPage3 =
    'Hold a credit card level with the floor, pressing one of its short edges firmly against the top center of your screen.\n' +
    'Slide the card left/right until it is left-right centered in the video.\n' +
    'Tilt the card slightly downward until, in the video, its bottom edge meets the green line.\n' +
    "Adjust the green line to match the card's bottom edge:\n" +
    '• Drag the ends of the green line with your mouse, OR\n' +
    '• Use the ◀ ▶ keys to adjust the length.\n' +
    "When the line matches the edge, press the SPACE bar. 🔉 You'll hear a shutter click."
  const fallbackPage4 = fallbackPage3
  const keyPage3 = phrases?.RC_UseCreditCardBelowToCalibrateCameraPage3?.[RC.L]
  const keyPage4 =
    phrases?.RC_UseCreditCardBelowToCalibrateCameraRepeatPage4?.[RC.L]
  const text =
    (isRepeat ? keyPage4 : keyPage3) ||
    (isRepeat ? fallbackPage4 : fallbackPage3)
  return text || ''
}

export async function justCreditCard(RC, options, callback = undefined) {
  RC._addBackground()

  // Unit conversions and configurable offsets
  const pxPerCm = (RC?.screenPpi?.value ? RC.screenPpi.value : 96) / 2.54 // fallback to 96 DPI if missing
  const cameraToCardOffsetCm =
    options?.calibrateDistanceCameraToBlueLineCm ??
    options?._calibrateDistanceCameraToBlueLineCm ??
    4
  const blueLineOffsetPx = cameraToCardOffsetCm * pxPerCm
  // Video sits 0.5 cm below the blue line
  const videoTopOffsetPx = blueLineOffsetPx + 0.5 * pxPerCm

  // Initial position of green line as fraction of video height (0.0 = bottom, 1.0 = top)
  const initialCardTopVideoFraction =
    options?.calibrateDistanceGreenLineVideoFraction ??
    options?._calibrateDistanceGreenLineVideoFraction ??
    0.9

  const commonCalibrationData = {
    shortCm: CREDIT_CARD_SHORT_CM,
    longCm: CREDIT_CARD_LONG_CM,
    _calibrateDistance: options.calibrateDistance,
    _calibrateDistanceAllowedRangeCm: options.calibrateDistanceAllowedRangeCm,
    _calibrateDistanceAllowedRatio: options.calibrateDistanceAllowedRatio,
    _calibrateDistancePupil: options.calibrateDistancePupil,
    _calibrateDistanceShowLengthBool: options.calibrateDistanceShowLengthBool,
    _calibrateDistanceTimes: options.objectMeasurementCount,
    _showPerpendicularFeetBool: options.showNearestPointsBool,
    _calibrateScreenSizeAllowedRatio: options.calibrateScreenSizeAllowedRatio,
    _calibrateScreenSizeTimes: options.calibrateScreenSizeTimes,
    _viewingDistanceWhichEye: options.viewingDistanceWhichEye,
    _viewingDistanceWhichPoint: options.viewingDistanceWhichPoint,
    _calibrateDistanceCameraToBlueLineCm: cameraToCardOffsetCm,
    _calibrateDistanceGreenLineVideoFraction: initialCardTopVideoFraction,
  }

  // Measurement count/pages: 1 (default) or 2 for repeat
  const measurementCount = Math.max(
    1,
    Math.floor(options.objectMeasurementCount || 1),
  )
  // Counts every attempt, even retries; used for display (1/2, 3/3, 4/4, ...)
  let attemptCount = 0
  let currentPage = 3
  let measurements = [] // { shortVPx, fVpx }
  let stepInstructionModel = null
  let currentStepFlatIndex = 0
  let fullscreenGuardInterval = null
  let lastFullscreenAttempt = 0

  // Ensure video is visible and positioned
  RC.showVideo(true)
  const vCont = document.getElementById('webgazerVideoContainer')
  if (vCont) setDefaultVideoPosition(RC, vCont)

  // Container
  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '0'
  container.style.top = '0'
  container.style.width = '100vw'
  container.style.height = '100vh'
  container.style.userSelect = 'none'
  container.style.overflow = 'hidden'
  container.style.zIndex = '999999998'

  // Title
  const titleRow = document.createElement('div')
  titleRow.style.display = 'flex'
  titleRow.style.alignItems = 'baseline'
  titleRow.style.gap = '24px'
  titleRow.style.paddingInlineStart = '3rem'
  titleRow.style.margin = '2rem 0 0rem 0'
  titleRow.style.position = 'fixed'
  titleRow.style.top = '0'
  titleRow.style.left = '0'
  titleRow.style.width = '100%'
  // Keep the title visible even when fullscreen toggles reorder layers
  titleRow.style.zIndex = '1000000000001'
  titleRow.style.pointerEvents = 'none'
  container.appendChild(titleRow)

  const title = document.createElement('h1')
  title.style.whiteSpace = 'pre-line'
  title.style.textAlign = 'start'
  title.style.margin = '0'
  title.dir = RC.LD.toLowerCase()
  title.id = 'just-credit-card-title'
  titleRow.appendChild(title)

  // Stepper UI: anchored relative to the video, placed below it
  const instructionsPlacement = 'inside-top'
  let instructionsUI = null
  let leftInstructionsText = null
  let mediaContainer = null

  // Overlay and guide line - remove any existing overlay first to prevent duplicates
  const existingOverlay = document.getElementById('just-credit-card-overlay')
  if (existingOverlay && existingOverlay.parentNode) {
    existingOverlay.parentNode.removeChild(existingOverlay)
  }
  const overlay = createOverlayLayer()
  const guide = createDashedGuide()
  const cardOutline = createCardOutline()
  overlay.appendChild(guide)
  overlay.appendChild(cardOutline)
  document.body.appendChild(overlay)
  ensureFlickerStyle()

  // Blue reference line (short edge length) and labels
  const blueGuide = document.createElement('div')
  blueGuide.id = 'just-credit-card-blue-guide'
  blueGuide.style.position = 'absolute'
  blueGuide.style.height = '0px'
  blueGuide.style.borderTop = '3px dashed rgba(0, 120, 255, 0.95)'
  blueGuide.style.animation = 'jc-line-flicker 0.125s ease-in-out infinite'
  blueGuide.style.pointerEvents = 'none'
  blueGuide.style.zIndex = '1000000000'
  overlay.appendChild(blueGuide)

  const blueLabel = document.createElement('div')
  blueLabel.id = 'just-credit-card-blue-label'
  blueLabel.style.position = 'absolute'
  blueLabel.style.color = 'black'
  blueLabel.style.font =
    '600 14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
  blueLabel.style.textShadow = '0 1px 2px rgba(0,0,0,0.25)'
  blueLabel.style.pointerEvents = 'none'
  blueLabel.style.transform = 'translate(-50%, -100%)'
  blueLabel.style.whiteSpace = 'nowrap'
  blueLabel.style.zIndex = '1000000001'
  blueLabel.dir = RC.LD.toLowerCase()
  blueLabel.textContent =
    phrases?.RC_PlaceCreditCardHere?.[RC.L] || 'Place credit card here'
  overlay.appendChild(blueLabel)

  const greenLabel = document.createElement('div')
  greenLabel.id = 'just-credit-card-green-label'
  greenLabel.style.position = 'absolute'
  greenLabel.style.color = 'black'
  greenLabel.style.font =
    '600 14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
  greenLabel.style.textShadow = '0 1px 2px rgba(0,0,0,0.25)'
  greenLabel.style.pointerEvents = 'none'
  greenLabel.style.transform = 'translate(-50%, -120%)'
  greenLabel.style.whiteSpace = 'nowrap'
  greenLabel.style.zIndex = '1000000001'
  greenLabel.dir = RC.LD.toLowerCase()
  greenLabel.textContent =
    phrases?.RC_PlaceUpperCreditCardEdgeHere?.[RC.L] ||
    'Place upper credit card edge here'
  overlay.appendChild(greenLabel)
  const greenLabelOffsetPx = 21 // reduced gap (30% less than previous 30px)

  // Add to RC background (below overlay but above page)
  RC._replaceBackground('')
  RC.background.appendChild(container)

  // Position video centered below the blue line; remember original style
  let originalVideoCssText = null
  let originalResizeHandler = null
  const positionVideoBelowCamera = () => {
    const v = document.getElementById('webgazerVideoContainer')
    if (!v) return
    if (originalVideoCssText == null) {
      originalVideoCssText = v.style.cssText || ''
    }
    // Remove the default resize handler that repositions video to top-center
    // This handler was added by setDefaultVideoPosition and would interfere with our custom positioning
    if (v._resizeHandler && !originalResizeHandler) {
      originalResizeHandler = v._resizeHandler
      window.removeEventListener('resize', v._resizeHandler)
      v._hasResizeListener = false
    }

    // Get camera aspect ratio to size the container proportionally
    const cam = getCameraResolution(RC)
    const camAspect = cam ? cam.width / cam.height : 16 / 9 // default to 16:9

    // Available space: width capped to 95% of viewport, start at videoTopOffsetPx
    const vw = window.innerWidth
    const vh = window.innerHeight
    const maxWidth = vw * 0.95
    const availWidth = maxWidth
    const availHeight = Math.max(0, vh - videoTopOffsetPx)

    // Calculate size that fits while maintaining aspect ratio
    let videoW, videoH
    if (availWidth / availHeight > camAspect) {
      // Height is the constraint
      videoH = availHeight
      videoW = videoH * camAspect
    } else {
      // Width is the constraint
      videoW = availWidth
      videoH = videoW / camAspect
    }

    // Top is fixed at the desired offset, horizontally centered
    const topOffset = Math.max(0, videoTopOffsetPx)

    v.style.position = 'fixed'
    v.style.left = `${(vw - videoW) / 2}px`
    v.style.top = `${topOffset}px`
    v.style.width = `${videoW}px`
    v.style.height = `${videoH}px`
    v.style.right = 'unset'
    v.style.bottom = 'unset'
    v.style.transform = 'none'
    v.style.zIndex = '999999999999' // below overlay but above page
    // Force reflow so getBoundingClientRect returns the new position
    void v.offsetWidth
    return v
  }
  positionVideoBelowCamera()

  // Position blue guide and labels
  const positionBlueGuideAndLabels = () => {
    const blueLengthPx = CREDIT_CARD_SHORT_CM * pxPerCm
    const xLeft = Math.round(window.innerWidth / 2 - blueLengthPx / 2)
    const yTop = Math.round(blueLineOffsetPx)
    blueGuide.style.width = `${Math.max(0, blueLengthPx)}px`
    blueGuide.style.left = `${xLeft}px`
    blueGuide.style.top = `${yTop}px`
    // Blue label centered above the blue line
    blueLabel.style.left = `${Math.round(window.innerWidth / 2)}px`
    blueLabel.style.top = `${yTop - 6}px`
  }
  positionBlueGuideAndLabels()

  // State for guide line and outline
  const state = {
    p1: { x: 0, y: 0 }, // {x, y} relative to document (pageX/Y style) for positioning absolute elements
    p2: { x: 0, y: 0 },
    dragging: null, // 'left' | 'right' | null
    lineLengthPx: null, // fallback store for initial width
    cardOutline, // store ref for convenience
    RCRef: RC,
    videoTopOffsetPx,
    cameraToCardOffsetCm: cameraToCardOffsetCm,
    quadBaseRatio: options.calibrateDistanceQuadBaseRatio,
  }
  cardState = state

  // Initialize drag handling
  let dragStart = null // { x, y }

  function handlePointerDown(e) {
    const v = document.getElementById('webgazerVideoContainer')
    if (!v) return

    const rect = v.getBoundingClientRect()
    const relX = e.clientX - rect.left

    // Check which half of the video
    if (relX < rect.width / 2) {
      state.dragging = 'left'
    } else {
      state.dragging = 'right'
    }

    dragStart = { x: e.clientX, y: e.clientY }
    e.preventDefault() // prevent selection
  }

  function handlePointerMove(e) {
    if (!state.dragging) return

    // Determine new coordinates
    // The guide is absolutely positioned in document body (via overlay), so we use e.pageX/Y
    // But we need to update the p1/p2 state

    const pageX = e.pageX
    const pageY = e.pageY

    if (state.dragging === 'left') {
      state.p1 = { x: pageX, y: pageY }
    } else if (state.dragging === 'right') {
      state.p2 = { x: pageX, y: pageY }
    }

    // Redraw immediately
    positionGuide(guide, state.p1, state.p2)
    positionCardOutline()
    positionCardOutline()

    // Update labels
    // Green label centered above the green guide
    const midX = (state.p1.x + state.p2.x) / 2
    const midY = (state.p1.y + state.p2.y) / 2
    // Approximate "above" by using min Y minus some offset
    const minY = Math.min(state.p1.y, state.p2.y)

    greenLabel.style.left = `${midX}px`
    greenLabel.style.top = `${minY - greenLabelOffsetPx}px`
  }

  function handlePointerUp(e) {
    state.dragging = null
  }

  // Add global move/up listeners
  document.addEventListener('pointermove', handlePointerMove)
  document.addEventListener('pointerup', handlePointerUp)

  // Make video container interactable
  const vContForClick = document.getElementById('webgazerVideoContainer')
  if (vContForClick) {
    vContForClick.style.cursor = 'crosshair'
    vContForClick.style.pointerEvents = 'auto'
    vContForClick.style.touchAction = 'none' // Prevent scrolling while dragging
    vContForClick.addEventListener('pointerdown', handlePointerDown)
  }

  // === EDGE DETECTION FILTER ===
  // Create SVG filter for edge detection (Laplacian kernel)
  const svgNS = 'http://www.w3.org/2000/svg'
  const svgFilter = document.createElementNS(svgNS, 'svg')
  svgFilter.setAttribute('width', '0')
  svgFilter.setAttribute('height', '0')
  svgFilter.style.position = 'absolute'
  svgFilter.innerHTML = `
    <defs>
      <filter id="edge-detect-filter" color-interpolation-filters="sRGB">
        <!-- Convert to grayscale first -->
        <feColorMatrix type="saturate" values="0" />
        <!-- Edge detection using Laplacian kernel -->
        <feConvolveMatrix 
          order="3" 
          kernelMatrix="
            -1 -1 -1
            -1  8 -1
            -1 -1 -1"
          preserveAlpha="true"
        />
        <!-- Boost the result -->
        <feComponentTransfer>
          <feFuncR type="linear" slope="2" intercept="0"/>
          <feFuncG type="linear" slope="2" intercept="0"/>
          <feFuncB type="linear" slope="2" intercept="0"/>
        </feComponentTransfer>
      </filter>
    </defs>
  `
  document.body.appendChild(svgFilter)

  // Create toggle button
  const edgeToggle = document.createElement('button')
  edgeToggle.id = 'edge-detect-toggle'
  edgeToggle.textContent = '🔲 Edges'
  edgeToggle.style.position = 'fixed'
  edgeToggle.style.zIndex = '10000000000000' // Very high to be above everything
  edgeToggle.style.padding = '6px 12px'
  edgeToggle.style.fontSize = '13px'
  edgeToggle.style.fontFamily = 'system-ui, sans-serif'
  edgeToggle.style.border = 'none'
  edgeToggle.style.borderRadius = '15px'
  edgeToggle.style.cursor = 'pointer'
  edgeToggle.style.backgroundColor = 'rgba(0, 0, 0, 0.5)'
  edgeToggle.style.color = 'white'
  edgeToggle.style.transition = 'background-color 0.2s'
  edgeToggle.style.pointerEvents = 'auto' // Ensure it's clickable

  // Position button on top of video
  const positionEdgeToggle = () => {
    const rect = getExpectedVideoRect(RC, videoTopOffsetPx)
    edgeToggle.style.top = `${rect.top + 10}px`
    edgeToggle.style.right = `${rect.right - 10}px`
  }
  positionEdgeToggle()
  // Append to body instead of overlay to avoid pointer-events issues
  // document.body.appendChild(edgeToggle)

  let edgeDetectEnabled = false

  function toggleEdgeDetect() {
    edgeDetectEnabled = !edgeDetectEnabled
    const vContainer = document.getElementById('webgazerVideoContainer')
    if (vContainer) {
      if (edgeDetectEnabled) {
        vContainer.style.filter = 'url(#edge-detect-filter)'
        edgeToggle.style.backgroundColor = 'rgba(76, 175, 80, 0.8)'
        edgeToggle.textContent = '✓ Edges'
      } else {
        vContainer.style.filter = ''
        edgeToggle.style.backgroundColor = 'rgba(0, 0, 0, 0.5)'
        edgeToggle.textContent = '🔲 Edges'
      }
    }
  }

  edgeToggle.addEventListener('click', e => {
    e.stopPropagation()
    toggleEdgeDetect()
  })

  // Also toggle with 'E' key
  const handleEdgeKey = e => {
    if (e.key === 'e' || e.key === 'E') {
      toggleEdgeDetect()
    }
  }
  document.addEventListener('keydown', handleEdgeKey)

  // Position the guide immediately using expected rect (right half of viewport)
  // This ensures the guide is in the correct position before it becomes visible
  const expectedRectInitial = getExpectedVideoRect(RC, videoTopOffsetPx)
  state.lineLengthPx = expectedRectInitial.width * 0.6

  // Initialize p1 and p2 based on length and rect
  // Use initialCardTopVideoFraction for the initial green line position (0.0 = bottom, 1.0 = top)
  const y =
    expectedRectInitial.top +
    expectedRectInitial.height * (1 - initialCardTopVideoFraction)
  const x =
    expectedRectInitial.left +
    (expectedRectInitial.width - state.lineLengthPx) / 2
  state.p1 = { x: x, y: y }
  state.p2 = { x: x + state.lineLengthPx, y: y }

  positionGuide(guide, state.p1, state.p2)
  positionCardOutline()
  // Green label centered above the green guide
  greenLabel.style.left = `${Math.round(expectedRectInitial.left + expectedRectInitial.width / 2)}px`
  greenLabel.style.top = `${Math.round(y - 30)}px`
  // Ensure everything becomes visible and the Stepper is created immediately
  // (schedule handles guide opacity and lazy Stepper instantiation)
  requestAnimationFrame(() => {
    scheduleGuideReposition()
  })

  // Stepper will be created after video is positioned (in scheduleGuideReposition)

  // Re-position the guide after layout settles
  function scheduleGuideReposition() {
    positionVideoBelowCamera()
    positionBlueGuideAndLabels()
    // Use expected rect based on known positioning (centered below blue line)
    // This avoids issues with getBoundingClientRect returning stale values
    const expectedRect = getExpectedVideoRect(RC, videoTopOffsetPx)
    if (state.lineLengthPx == null) {
      state.lineLengthPx = expectedRect.width * 0.6
    }

    // If p1/p2 aren't set yet or are default, update them to match potentially new rect
    // Only if NOT dragging
    if (!state.dragging) {
      // Calculate center of current line
      const currentMidX = (state.p1.x + state.p2.x) / 2
      const currentY = state.p1.y // assume roughly horizontal or use mid

      // If this is first run or re-layout, we might want to re-center
      // But if user moved it, we should respect that?
      // The user prompt implies we should keep user adjustments.
      // However, initially (before user interaction), it should center.
      // Let's just ensure it's visible.
      // For now, re-center ONLY if it seems untouched (y is still initial 10%?)
      // Actually, let's just trust state.p1/p2 if they exist, but ensure they are initialized.
    }

    positionGuide(guide, state.p1, state.p2)
    positionCardOutline()
    guide.style.opacity = '1'

    // Update green label
    const midX = (state.p1.x + state.p2.x) / 2
    const midY = (state.p1.y + state.p2.y) / 2
    const minY = Math.min(state.p1.y, state.p2.y)
    greenLabel.style.left = `${midX}px`
    greenLabel.style.top = `${minY - greenLabelOffsetPx}px`

    // Lazily create the anchored stepper only after video size/position is final
    if (!instructionsUI) {
      const videoRefForStepper = document.getElementById(
        'webgazerVideoContainer',
      )
      if (videoRefForStepper) {
        instructionsUI = createAnchoredStepperUI(videoRefForStepper, {
          placement: instructionsPlacement,
          offsetPx: 8,
          positionMode: 'absolute',
          disableInternalPositioning: true, // We handle positioning via repositionInstructionsUI with calculated expectedRect
          layout: 'leftOnly',
          leftWidth: '100%',
          leftPaddingStart: '0.75rem',
          leftPaddingEnd: '0.75rem',
          fontSize: 'clamp(1.05em, 2.2vw, 1.35em)',
          lineHeight: '1.4',
        })
        leftInstructionsText = instructionsUI.leftText
        mediaContainer = instructionsUI.mediaContainer
        repositionInstructionsUI(instructionsUI, expectedRect)
        renderPage()
      } else {
        // Fallback inside container if video element missing
        instructionsUI = createStepInstructionsUI(container, {
          leftWidth: '100%',
          rightWidth: '0%',
          leftPaddingStart: '3rem',
          leftPaddingEnd: '3rem',
          fontSize: 'clamp(1.05em, 2.2vw, 1.35em)',
          lineHeight: '1.4',
          layout: 'leftOnly',
        })
        leftInstructionsText = instructionsUI.leftText
        mediaContainer = instructionsUI.mediaContainer
        repositionInstructionsUI(instructionsUI, expectedRect)
        renderPage()
      }
    }
    repositionInstructionsUI(instructionsUI, expectedRect)
    // Double RAF to ensure we apply the position AFTER the internal anchored stepper's
    // initialization/listeners have fired (which might be using stale DOM rects).
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const rect3 = getExpectedVideoRect(RC, videoTopOffsetPx)
        repositionInstructionsUI(instructionsUI, rect3)
      })
    })
  }

  function repositionInstructionsUI(instructionsUI, expectedRect) {
    // Force anchored stepper width/position to match expectedRect immediately
    if (instructionsUI && instructionsUI.anchoredContainer) {
      const ac = instructionsUI.anchoredContainer
      const pageX =
        window.pageXOffset || document.documentElement.scrollLeft || 0
      const pageY =
        window.pageYOffset || document.documentElement.scrollTop || 0
      const offsetPx = 8
      ac.style.width = `${Math.round(expectedRect.width)}px`
      ac.style.left = `${Math.round(expectedRect.left + pageX)}px`

      // Align instructions inside the video; position depends on requested placement
      const height = ac.offsetHeight || 0 // force reflow for accurate height
      const top =
        instructionsPlacement === 'inside-top'
          ? expectedRect.top + offsetPx
          : expectedRect.top + expectedRect.height - height - offsetPx

      ac.style.top = `${Math.round(top + pageY)}px`
      ac.style.visibility = 'visible'
    }
    // Do NOT call instructionsUI.reposition() here. The internal logic relies on getBoundingClientRect
    // which might be stale or incorrect during initialization. We trust expectedRect.
  }

  function ensureFullscreenGuard() {
    const shouldGuard = currentPage === 3 || currentPage === 4
    if (shouldGuard) {
      if (fullscreenGuardInterval) return
      fullscreenGuardInterval = setInterval(async () => {
        if (!(currentPage === 3 || currentPage === 4)) return
        if (isFullscreen()) return
        const now = Date.now()
        if (now - lastFullscreenAttempt < 2000) return
        lastFullscreenAttempt = now
        try {
          await getFullscreen(RC.language?.value || RC.L, RC)
        } catch {}
      }, 1500)
    } else if (fullscreenGuardInterval) {
      clearInterval(fullscreenGuardInterval)
      fullscreenGuardInterval = null
    }
  }

  function updateTitle() {
    // Show the attempt number; denominator grows with retries (e.g., 3/3, 4/4)
    const idx = Math.max(1, attemptCount + 1)
    const total = Math.max(idx, measurementCount)
    const t = phrases.RC_distanceTrackingN?.[RC.L]
      ?.replace('[[N1]]', String(idx))
      ?.replace('[[N2]]', String(total))
    title.innerText = t || `Measurement ${idx} of ${total}`
  }

  // Helper to clamp and render the stepper at the current index
  function renderStepperAtCurrentIndex() {
    if (!leftInstructionsText || !mediaContainer || !stepInstructionModel)
      return
    const maxIdx = Math.max(
      0,
      (stepInstructionModel.flatSteps?.length || 1) - 1,
    )
    currentStepFlatIndex = Math.min(Math.max(0, currentStepFlatIndex), maxIdx)

    const renderOnce = () =>
      renderStepInstructions({
        model: stepInstructionModel,
        flatIndex: currentStepFlatIndex,
        elements: {
          leftText: leftInstructionsText,
          rightText: null,
          mediaContainer: mediaContainer,
        },
        options: {
          showAllSteps: false,
          thresholdFraction: 0.6,
          useCurrentSectionOnly: true,
          stepperHistory: options.stepperHistory,
          layout: 'leftOnly', // 1-column Stepper on the left
          showLargeHeading: false, // Removed "Instructions" heading - stepper is at top of video
          onPrev: () => {
            if (currentStepFlatIndex > 0) {
              currentStepFlatIndex--
              renderStepperAtCurrentIndex()
            }
          },
          onNext: () => {
            if (currentStepFlatIndex < maxIdx) {
              currentStepFlatIndex++
              renderStepperAtCurrentIndex()
            }
          },
        },
        lang: RC.language?.value || RC.L,
        langDirection: RC.LD,
        phrases,
      })

    renderOnce()
  }

  function renderPage() {
    // If UI not initialized yet, skip; will be called again after creation
    if (!leftInstructionsText || !mediaContainer) return
    ensureFullscreenGuard()
    updateTitle()
    const isRepeat = currentPage === 4
    const showAllSteps = false

    // Parse and render step instructions (Stepper in left column only)
    try {
      const text = getInstructions(RC, isRepeat)
      stepInstructionModel = parseInstructions(text)
      currentStepFlatIndex = 0
      renderStepperAtCurrentIndex()
    } catch (e) {
      leftInstructionsText.textContent = getInstructions(RC, isRepeat).replace(
        /<br\s*\/?>/gi,
        '\n',
      )
    }

    // Initial line length = 60% of video width (use expected rect for consistent positioning)
    const expectedRect = getExpectedVideoRect(RC, videoTopOffsetPx)
    if (state.lineLengthPx == null) {
      state.lineLengthPx = expectedRect.width * 0.6
      // Initialize p1/p2 if not set (e.g. page reload logic, though this is inside renderPage)
      // Use initialCardTopVideoFraction for the initial green line position (0.0 = bottom, 1.0 = top)
      const y =
        expectedRect.top +
        expectedRect.height * (1 - initialCardTopVideoFraction)
      const x =
        expectedRect.left + (expectedRect.width - state.lineLengthPx) / 2
      state.p1 = { x: x, y: y }
      state.p2 = { x: x + state.lineLengthPx, y: y }
    }
    scheduleGuideReposition()
  }

  function resizeHandler() {
    scheduleGuideReposition()
    positionEdgeToggle()
    positionCardOutline()
  }

  window.addEventListener('resize', resizeHandler)

  // Up/Down to navigate Stepper
  const handleInstructionNav = e => {
    if (![3, 4].includes(currentPage) || !stepInstructionModel) return
    if (e.key === 'ArrowDown') {
      const maxIdx = Math.max(
        0,
        (stepInstructionModel.flatSteps?.length || 1) - 1,
      )
      if (currentStepFlatIndex < maxIdx) {
        currentStepFlatIndex++
        renderStepperAtCurrentIndex()
      }
      e.preventDefault()
      e.stopPropagation()
    } else if (e.key === 'ArrowUp') {
      if (currentStepFlatIndex > 0) {
        currentStepFlatIndex--
        renderStepperAtCurrentIndex()
      }
      e.preventDefault()
      e.stopPropagation()
    }
  }
  document.addEventListener('keydown', handleInstructionNav)

  function getShortVPx() {
    const v = getVideoContainerRect()
    const cam = getCameraResolution(RC)
    if (!v || !cam) return null

    // Calculate length in screen pixels from p1/p2
    const dx = state.p2.x - state.p1.x
    const dy = state.p2.y - state.p1.y
    const lengthPx = Math.sqrt(dx * dx + dy * dy)

    // Otherwise use the green line length
    const scaleX = cam.width / v.rect.width
    // Note: This assumes isotropic scaling or that line angle doesn't matter for scale.
    // Usually scaleX and scaleY are similar.
    return lengthPx * scaleX
  }

  async function onSpace() {
    const shortVPx = getShortVPx()
    if (!shortVPx || isNaN(shortVPx)) {
      await Swal.fire({
        ...swalInfoOptions(RC, { showIcon: false }),
        html: phrases.T_error?.[RC.L] || 'Error: Camera/video not ready.',
        confirmButtonText: phrases.T_ok?.[RC.L] || 'OK',
      })
      return
    }

    // Play camera shutter sound to confirm measurement
    if (cameraShutterSound) {
      cameraShutterSound()
    }

    const cam = getCameraResolution(RC)
    if (!cam) {
      await Swal.fire({
        ...swalInfoOptions(RC, { showIcon: false }),
        html:
          phrases.T_error?.[RC.L] || 'Error: Camera resolution not available.',
        confirmButtonText: phrases.T_ok?.[RC.L] || 'OK',
      })
      return
    }

    // Get camera resolution (horizontalVpx and verticalVpx)
    const horizontalVpx = cam.width
    const verticalVpx = cam.height
    // Expose camera width in COMMON for downstream consumers
    commonCalibrationData.horizontalVpx = horizontalVpx

    // Calculate cardTopVideoFraction: the height of the green line center as a fraction of video height
    // state.p1 and state.p2 are in page coordinates, need to convert to video fraction
    // Coordinate system: 0.0 = bottom, 1.0 = top
    const expectedRect = getExpectedVideoRect(RC, videoTopOffsetPx)
    const greenLineMidY = (state.p1.y + state.p2.y) / 2
    const cardTopVideoFraction =
      1 - (greenLineMidY - expectedRect.top) / expectedRect.height

    // NEW CORRECT FORMULAS FOR FOCAL LENGTH COMPUTATION
    // See equations (1)-(5) in the documentation
    //
    // (1) edgeToCameraDeltaYCm = (cardTopVideoFraction - 0.5) * verticalVpx * (shortCm / shortVpx)
    const edgeToCameraDeltaYCm =
      (cardTopVideoFraction - 0.5) *
      verticalVpx *
      (CREDIT_CARD_SHORT_CM / shortVPx)

    // (2) edgeToScreenCm = sqrt(longCm^2 - (edgeToCameraDeltaYCm + cameraToBlueLineCm)^2)
    // cameraToBlueLineCm = cameraToCardOffsetCm (the _calibrateDistanceCameraToCardCm parameter)
    const edgeToScreenCm = Math.sqrt(
      Math.max(
        0,
        CREDIT_CARD_LONG_CM ** 2 -
          (edgeToCameraDeltaYCm + cameraToCardOffsetCm) ** 2,
      ),
    )

    // (3) fVpx = (shortVpx / shortCm) * edgeToScreenCm
    const fVpx = (shortVPx / CREDIT_CARD_SHORT_CM) * edgeToScreenCm

    // (4) fRatio = fVpx / horizontalVpx
    const fRatio = fVpx / horizontalVpx

    RC.fRatio = fRatio
    RC.getHorizontalVpx = () => {
      const cam = getCameraResolution(RC)
      return cam?.width || 0
    }

    // (5) factorVpxCm = fRatio * horizontalVpx * ipdCm
    // Note: fRatio is stable across resolution changes; factorVpxCm should be recomputed each time
    const factorVpxCm = fRatio * horizontalVpx * ASSUMED_IPD_CM

    const mode = 'lineAdjust' // merged mode
    attemptCount++
    measurements.push({
      shortVPx,
      fVpx,
      factorVpxCm,
      fRatio,
      cardTopVideoFraction,
      edgeToScreenCm,
      mode,
      cameraToCardOffsetCm: cameraToCardOffsetCm,
      verticalVpx: verticalVpx,
      cameraToBlueLineCm: cameraToCardOffsetCm,
    })

    saveCalibrationAttempt(
      RC,
      'justCreditCard',
      {
        shortVPx,
        fVpx,
        factorVpxCm,
        fRatio,
        cardTopVideoFraction,
        edgeToScreenCm,
        mode,
        cameraToCardOffsetCm: cameraToCardOffsetCm,
        verticalVpx: verticalVpx,
        cameraToBlueLineCm: cameraToCardOffsetCm,
      },
      commonCalibrationData,
    )

    const allowedRatio = options.calibrateDistanceAllowedRatio || 1.1
    const maxAllowedRatio = Math.max(allowedRatio, 1 / allowedRatio)

    // Validate consistency only when multiple measurements are requested
    if (measurementCount > 1 && measurements.length >= 2) {
      const lastIdx = measurements.length - 1
      const secondLastIdx = measurements.length - 2
      const M1 = measurements[secondLastIdx].shortVPx
      const M2 = measurements[lastIdx].shortVPx
      const ratio = Math.max(M2 / M1, M1 / M2)

      // Check if ratio is outside the allowed range
      if (ratio > maxAllowedRatio) {
        console.log(
          `Green line consistency check failed. Ratio: ${toFixedNumber(ratio, 2)}. Showing popup.`,
        )
        console.log(`M1=${M1}, M2=${M2}, ratio=${ratio}`)

        const errorMessage =
          phrases.RC_creditCardSizeMismatch?.[RC.L]?.replace(
            '[[N1]]',
            toFixedNumber(ratio, 2).toString(),
          ) ||
          phrases.RC_objectSizeMismatch?.[RC.L]?.replace(
            '[[N1]]',
            toFixedNumber(ratio, 2).toString(),
          ) ||
          `Green line measurements are inconsistent. Ratio: ${toFixedNumber(ratio, 2)}. Please try again.`

        // Prevent spacebar from closing the popup
        const preventSpacebar = e => {
          if (e.key === ' ' || e.code === 'Space') {
            e.preventDefault()
            e.stopPropagation()
          }
        }

        // Temporarily lower z-index of overlay, video, stepper, and other high-z elements so Swal popup is visible
        const overlayEl = document.getElementById('just-credit-card-overlay')
        const videoEl = document.getElementById('webgazerVideoContainer')
        const edgeToggleEl = document.getElementById('edge-detect-toggle')
        const stepperEl = instructionsUI?.anchoredContainer || null
        const savedOverlayZIndex = overlayEl ? overlayEl.style.zIndex : null
        const savedVideoZIndex = videoEl ? videoEl.style.zIndex : null
        const savedEdgeToggleZIndex = edgeToggleEl
          ? edgeToggleEl.style.zIndex
          : null
        const savedStepperZIndex = stepperEl ? stepperEl.style.zIndex : null
        const savedStepperVisibility = stepperEl
          ? stepperEl.style.visibility
          : null
        if (overlayEl) overlayEl.style.zIndex = '1'
        if (videoEl) videoEl.style.zIndex = '1'
        if (edgeToggleEl) edgeToggleEl.style.zIndex = '1'
        if (stepperEl) stepperEl.style.visibility = 'hidden'

        await Swal.fire({
          ...swalInfoOptions(RC, { showIcon: false }),
          icon: undefined,
          html: errorMessage,
          allowEnterKey: true,
          confirmButtonText:
            phrases.T_ok?.[RC.L] || phrases.RC_OK?.[RC.L] || 'OK',
          didOpen: () => {
            document.addEventListener('keydown', preventSpacebar, true)
          },
          willClose: () => {
            document.removeEventListener('keydown', preventSpacebar, true)
            // Restore z-index and visibility values
            if (overlayEl && savedOverlayZIndex !== null) {
              overlayEl.style.zIndex = savedOverlayZIndex
            }
            if (videoEl && savedVideoZIndex !== null) {
              videoEl.style.zIndex = savedVideoZIndex
            }
            if (edgeToggleEl && savedEdgeToggleZIndex !== null) {
              edgeToggleEl.style.zIndex = savedEdgeToggleZIndex
            }
            if (stepperEl && savedStepperVisibility !== null) {
              stepperEl.style.visibility = savedStepperVisibility
            }
          },
        })

        // Keep previous attempts but reset guide for a fresh retry on page 4
        state.lineLengthPx = null
        state.p1 = { x: 0, y: 0 }
        state.p2 = { x: 0, y: 0 }
        currentPage = 4
        renderPage()
        return
      }
    }

    // If we gathered more than needed (due to retries), keep only the most recent set
    if (measurementCount > 1 && measurements.length > measurementCount) {
      measurements = measurements.slice(-measurementCount)
    }

    if (measurements.length < measurementCount) {
      // Reset guide to initial length/position for the repeat pass (page 4)
      state.lineLengthPx = null
      state.p1 = { x: 0, y: 0 }
      state.p2 = { x: 0, y: 0 }
      currentPage = 4
      renderPage()
      return
    }

    const data = finish()
    if (options.showIrisesBool) {
      await startIrisDrawingWithMesh(RC)
    }
    if (options.calibrateDistanceCheckBool) {
      await RC._checkDistance(
        callback,
        data,
        'trackDistance',
        options.checkCallback,
        options.calibrateDistanceCheckCm,
        options.callbackStatic,
        options.calibrateDistanceCheckSecs,
        options.calibrateDistanceCheckLengthCm,
        options.calibrateDistanceCenterYourEyesBool,
        options.calibrateDistancePupil,
        options.calibrateDistanceChecking,
        options.calibrateDistanceSpotXYDeg,
        options.calibrateDistance,
        options.stepperHistory,
      )
    } else {
      if (typeof callback === 'function') {
        callback(data)
      }
    }
    RC._removeBackground()
  }

  function onArrow(delta) {
    const expectedRect = getExpectedVideoRect(RC, videoTopOffsetPx)
    const step = Math.max(2, Math.round(expectedRect.width * 0.01))

    // Calculate current center and length
    const midX = (state.p1.x + state.p2.x) / 2
    const midY = (state.p1.y + state.p2.y) / 2
    const dx = state.p2.x - state.p1.x
    const dy = state.p2.y - state.p1.y
    const currentLen = Math.sqrt(dx * dx + dy * dy)

    // New length (no max limit)
    const newLen = Math.max(10, currentLen + delta * step)

    // Preserve center and angle.
    // Unit vector from p1 to p2
    const ux = dx / currentLen
    const uy = dy / currentLen

    // New endpoints
    state.p1.x = midX - (ux * newLen) / 2
    state.p1.y = midY - (uy * newLen) / 2
    state.p2.x = midX + (ux * newLen) / 2
    state.p2.y = midY + (uy * newLen) / 2

    state.lineLengthPx = newLen

    scheduleGuideReposition()
    positionCardOutline()
  }

  function keyHandler(e) {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      onArrow(-1)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      onArrow(+1)
    } else if (e.key === ' ') {
      e.preventDefault()
      onSpace()
    } else if (e.key === 'Escape') {
      // Reset to initial horizontal position if needed?
      // Or just do nothing as click points are gone.
      e.preventDefault()
    }
  }

  function cleanup() {
    document.removeEventListener('pointermove', handlePointerMove)
    document.removeEventListener('pointerup', handlePointerUp)

    document.removeEventListener('keydown', keyHandler)
    window.removeEventListener('resize', resizeHandler)
    document.removeEventListener('keydown', handleInstructionNav)
    document.removeEventListener('keydown', handleEdgeKey)
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay)
    if (container && container.parentNode)
      container.parentNode.removeChild(container)
    if (svgFilter && svgFilter.parentNode)
      svgFilter.parentNode.removeChild(svgFilter)
    if (edgeToggle && edgeToggle.parentNode)
      edgeToggle.parentNode.removeChild(edgeToggle)
    if (fullscreenGuardInterval) {
      clearInterval(fullscreenGuardInterval)
      fullscreenGuardInterval = null
    }
    // Remove blue/green labels if still attached (overlay removal usually covers them)
    const blueLbl = document.getElementById('just-credit-card-blue-label')
    if (blueLbl && blueLbl.parentNode) blueLbl.parentNode.removeChild(blueLbl)
    const greenLbl = document.getElementById('just-credit-card-green-label')
    if (greenLbl && greenLbl.parentNode)
      greenLbl.parentNode.removeChild(greenLbl)
    // Destroy anchored stepper if present
    if (instructionsUI && typeof instructionsUI.destroy === 'function') {
      try {
        instructionsUI.destroy()
      } catch {}
    }
    // Reset video filter
    const vContainerCleanup = document.getElementById('webgazerVideoContainer')
    if (vContainerCleanup) {
      vContainerCleanup.style.filter = ''
      vContainerCleanup.removeEventListener('pointerdown', handlePointerDown)
      vContainerCleanup.style.touchAction = ''
    }

    // Restore camera preview size and position
    const v = document.getElementById('webgazerVideoContainer')
    if (v) {
      // Remove click handler and restore cursor
      v.style.cursor = ''
      if (originalVideoCssText != null) {
        v.style.cssText = originalVideoCssText
      } else {
        setDefaultVideoPosition(RC, v)
      }
      // Restore the original resize handler if we removed it
      if (originalResizeHandler) {
        window.addEventListener('resize', originalResizeHandler)
        v._resizeHandler = originalResizeHandler
        v._hasResizeListener = true
      }
    }
  }

  function finish() {
    const cam = getCameraResolution(RC)
    const width = cam?.width || 0
    const height = cam?.height || 0

    // Average fRatio (more stable than fVpx across resolution changes)
    const avgFRatio =
      measurements.reduce((s, m) => s + (m.fRatio || 0), 0) /
      (measurements.length || 1)

    // Compute fVpx from fRatio for current resolution
    const avgFVpx = avgFRatio * width

    // Compute factorVpxCm fresh from fRatio, horizontalVpx, and ipdCm
    // This should be recomputed on each page that uses it, using current resolution and ipdCm
    const factorVpxCm = avgFRatio * width * ASSUMED_IPD_CM

    const data = {
      method: 'justCreditCard',
      measurementMode: 'lineAdjust',
      timestamp: performance.now(),
      shortCm: CREDIT_CARD_SHORT_CM,
      longCm: CREDIT_CARD_LONG_CM,
      measurements: measurements.map((m, i) => ({
        page: i === 0 ? 3 : 4,
        shortVPx: Math.round(m.shortVPx),
        fVpx: Math.round(m.fVpx),
        fRatio: m.fRatio != null ? Number(m.fRatio.toFixed(6)) : null,
        cardTopVideoFraction:
          m.cardTopVideoFraction != null
            ? Number(m.cardTopVideoFraction.toFixed(4))
            : null,
        mode: 'lineAdjust',
      })),
      fVpx: Math.round(avgFVpx),
      // fRatio is stable across resolution changes; save and report this
      fRatio: avgFRatio != null ? Number(avgFRatio.toFixed(6)) : null,
      // Keep fOverHorizontal for backward compatibility (same as fRatio)
      fOverHorizontal: avgFRatio != null ? Number(avgFRatio.toFixed(6)) : null,
      cameraResolutionXY: width && height ? `${width}x${height}` : '',
      // For downstream compatibility: provide a calibrationFactor = fVpx * ipdCm
      // Note: factorVpxCm should be recomputed each time using: fRatio * horizontalVpx * ipdCm
      calibrationFactor: Math.round(factorVpxCm),
      value: CREDIT_CARD_LONG_CM, // use the long edge as the reference "distance" value
    }

    // Persist in RC for later CSV/log export
    RC.justCreditCardCalibration = data
    RC.fRatio = data.fRatio
    RC.fOverHorizontal = data.fOverHorizontal // backward compatibility
    RC.fVpx = data.fVpx

    // Provide a uniform place similar to other flows so downstream uses can pick it up easily
    RC.newKnownDistanceTestData = data
    RC.newViewingDistanceData = data

    cleanup()
    return data
  }

  // Initial render and listeners
  renderPage()
  document.addEventListener('keydown', keyHandler)
}

let calibrationNumber = 1
const saveCalibrationAttempt = (
  RC,
  method = 'justCreditCard',
  measurement,
  commonCalibrationData = undefined,
) => {
  const _updateCalibrationAttemptsTransposed = (
    RC,
    calibrationObject,
    COMMON,
  ) => {
    if (!RC.calibrationAttemptsT) RC.calibrationAttemptsT = {}
    for (const [key, value] of Object.entries(calibrationObject)) {
      const v = value === undefined ? null : value
      if (!RC.calibrationAttemptsT[key]) RC.calibrationAttemptsT[key] = []
      RC.calibrationAttemptsT[key].push(v)
    }
    if (COMMON) {
      RC.calibrationAttemptsT.COMMON = COMMON
    }
  }

  if (!RC.calibrationAttempts)
    RC.calibrationAttempts = {
      future: 'To be deleted by end of November 2025.',
    }

  while (RC.calibrationAttempts[`calibration${calibrationNumber}`]) {
    calibrationNumber++
  }

  const safeRoundCm = value => {
    if (value == null || isNaN(value)) return null
    return Math.round(value * 10) / 10
  }

  const safeRoundXYPx = xyArray => {
    if (!xyArray || !Array.isArray(xyArray) || xyArray.length < 2) return null
    const x = safeRoundPx(xyArray[0])
    const y = safeRoundPx(xyArray[1])
    if (x === null || y === null) return null
    return [x, y]
  }

  const safeToFixed = value => {
    if (value == null || isNaN(value)) return null
    return parseFloat(value).toFixed(1)
  }
  const safeRoundPx = (value, decimalPlaces = 0) => {
    if (value == null || isNaN(value)) return null
    // return parseFloat(value.toFixed(decimalPlaces))
    return Math.round(value * 10 ** decimalPlaces) / 10 ** decimalPlaces
  }

  const pxPerCmValue = RC.screenPpi.value / 2.54
  const cameraXYPxValue = [window.innerWidth / 2, 0] // Top center of screen
  const centerXYPxValue = [window.innerWidth / 2, window.innerHeight / 2] // Screen center

  // Store single shared values in COMMON (not per-attempt) to avoid array growth
  commonCalibrationData.pxPerCm = safeRoundCm(pxPerCmValue)
  commonCalibrationData.cameraXYPx = safeRoundXYPx(cameraXYPxValue)
  commonCalibrationData.centerXYPx = safeRoundXYPx(centerXYPxValue)
  commonCalibrationData.greenLineVideoFraction =
    measurement.cardTopVideoFraction != null
      ? Number(measurement.cardTopVideoFraction.toFixed(4))
      : null
  commonCalibrationData.cameraToBlueLineCm = safeRoundCm(
    measurement.cameraToBlueLineCm || 0,
  )
  commonCalibrationData.edgeToScreenCm = safeRoundCm(
    measurement.edgeToScreenCm || 0,
  )
  commonCalibrationData.verticalVpx = safeRoundPx(measurement.verticalVpx || 0)

  const calibrationObject = {
    method,
    mode: 'lineAdjust', // merged mode
    // fRatio is stable across resolution changes; this is the primary calibration value
    fRatio:
      measurement.fRatio != null ? Number(measurement.fRatio.toFixed(2)) : null,
    fOverHorizontal:
      measurement.fRatio != null ? Number(measurement.fRatio.toFixed(2)) : null, // backward compatibility
    fVpx: safeRoundPx(measurement.fVpx || 0),
    factorVpxCm: safeRoundPx(measurement.factorVpxCm || 0),
    ipdCm: safeRoundCm(ASSUMED_IPD_CM),
    shortVPx: safeRoundPx(measurement.shortVPx || 0),
  }
  RC.calibrationAttempts[`calibration${calibrationNumber}`] = calibrationObject
  _updateCalibrationAttemptsTransposed(
    RC,
    calibrationObject,
    commonCalibrationData,
  )
}
