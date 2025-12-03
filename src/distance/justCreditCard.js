import { phrases } from '../i18n/schema'
import Swal from 'sweetalert2'
import { swalInfoOptions } from '../components/swalOptions'
import { setDefaultVideoPosition } from '../components/video'
import { cameraShutterSound } from '../components/sound'
import {
  createStepInstructionsUI,
  renderStepInstructions,
} from './stepByStepInstructionHelps'
import { parseInstructions } from './instructionParserAdapter'

// Constants for credit card size in centimeters
const CREDIT_CARD_SHORT_CM = 5.398
const CREDIT_CARD_LONG_CM = 8.56

// Assumed adult IPD in centimeters for deriving factorVpxCm to keep downstream code working
const ASSUMED_IPD_CM = 6.3

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

function createDashedGuide() {
  const guide = document.createElement('div')
  guide.id = 'just-credit-card-guide'
  guide.style.position = 'absolute'
  guide.style.height = '0px'
  guide.style.borderTop = '3px dashed rgba(0, 180, 0, 0.95)'
  guide.style.pointerEvents = 'none'
  // Position off-screen initially to prevent flash at wrong position
  guide.style.left = '-9999px'
  guide.style.top = '-9999px'
  guide.style.opacity = '0'
  guide.style.transition = 'opacity 0.15s ease-in'
  return guide
}

function positionGuide(guide, lineLengthPx, vRect) {
  const usedLengthPx = Math.max(0, Math.min(lineLengthPx, vRect.width))
  const y = vRect.top + vRect.height * 0.9
  const x = vRect.left + (vRect.width - usedLengthPx) / 2
  guide.style.width = `${usedLengthPx}px`
  guide.style.left = `${Math.round(x)}px`
  guide.style.top = `${Math.round(y)}px`
}

// Get the expected video rect based on known positioning (right half of screen)
// This avoids relying on getBoundingClientRect which may return stale values
function getExpectedVideoRect(RC) {
  const vw = window.innerWidth
  const vh = window.innerHeight

  // Get camera aspect ratio
  const cam = getCameraResolution(RC)
  const camAspect = cam ? cam.width / cam.height : 16 / 9

  // Available space: right half of screen
  const availWidth = vw / 2
  const availHeight = vh

  // Calculate size that fits while maintaining aspect ratio
  let videoW, videoH
  if (availWidth / availHeight > camAspect) {
    videoH = availHeight
    videoW = videoH * camAspect
  } else {
    videoW = availWidth
    videoH = videoW / camAspect
  }

  const topOffset = (availHeight - videoH) / 2
  const leftOffset = vw / 2 + (availWidth - videoW) / 2

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
    "**Option A:** Use the ◀ ▶ keys to resize the green line until it matches the card's bottom edge.\n" +
    '**Option B:** Click on the two ends of the card edge in the video to mark them (orange dots will appear).\n' +
    "When the line matches the edge, press the SPACE bar. 🔉 You'll hear a shutter click.\n" +
    '(Press ESC to clear click markers and start over.)'
  const fallbackPage4 = fallbackPage3
  const keyPage3 = phrases?.RC_UseCreditCardToCalibrateCameraPage3?.[RC.L]
  const keyPage4 = phrases?.RC_UseCreditCardToCalibrateCameraRepeatPage4?.[RC.L]
  const text =
    (isRepeat ? keyPage4 : keyPage3) ||
    (isRepeat ? fallbackPage4 : fallbackPage3)
  return text || ''
}

export async function justCreditCard(RC, options, callback = undefined) {
  RC._addBackground()

  const commonCalibrationData = {
    shortCm: CREDIT_CARD_SHORT_CM,
    longCm: CREDIT_CARD_LONG_CM,
    _calibrateTrackDistance: options.calibrateTrackDistance,
    _calibrateTrackDistanceAllowedRangeCm:
      options.calibrateTrackDistanceAllowedRangeCm,
    _calibrateTrackDistanceAllowedRatio:
      options.calibrateTrackDistanceAllowedRatio,
    _calibrateTrackDistancePupil: options.calibrateTrackDistancePupil,
    _calibrateTrackDistanceShowLengthBool:
      options.calibrateTrackDistanceShowLengthBool,
    _calibrateTrackDistanceTimes: options.objectMeasurementCount,
    _showPerpendicularFeetBool: options.showNearestPointsBool,
    _calibrateScreenSizeAllowedRatio: options.calibrateScreenSizeAllowedRatio,
    _calibrateScreenSizeTimes: options.calibrateScreenSizeTimes,
    _viewingDistanceWhichEye: options.viewingDistanceWhichEye,
    _viewingDistanceWhichPoint: options.viewingDistanceWhichPoint,
  }

  // Measurement count/pages: 1 (default) or 2 for repeat
  const measurementCount = Math.max(
    1,
    Math.floor(options.objectMeasurementCount || 1),
  )
  let currentPage = 3
  let measurements = [] // { shortVPx, fVpx }
  let stepInstructionModel = null
  let currentStepFlatIndex = 0

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
  titleRow.style.position = 'relative'
  container.appendChild(titleRow)

  const title = document.createElement('h1')
  title.style.whiteSpace = 'pre-line'
  title.style.textAlign = 'start'
  title.style.margin = '0'
  title.dir = RC.LD.toLowerCase()
  title.id = 'just-credit-card-title'
  titleRow.appendChild(title)

  // Stepper UI: left column for instructions; right column reserved for video
  const instructionsUI = createStepInstructionsUI(container, {
    leftWidth: '50%',
    rightWidth: '50%',
    leftPaddingStart: '3rem',
    leftPaddingEnd: '1rem',
    rightPaddingStart: '1rem',
    rightPaddingEnd: '3rem',
    fontSize: 'clamp(1.05em, 2.2vw, 1.35em)',
    lineHeight: '1.4',
    layout: 'leftOnly',
  })
  const leftInstructionsText = instructionsUI.leftText
  const mediaContainer = instructionsUI.mediaContainer

  // Overlay and guide line - remove any existing overlay first to prevent duplicates
  const existingOverlay = document.getElementById('just-credit-card-overlay')
  if (existingOverlay && existingOverlay.parentNode) {
    existingOverlay.parentNode.removeChild(existingOverlay)
  }
  const overlay = createOverlayLayer()
  const guide = createDashedGuide()
  overlay.appendChild(guide)
  document.body.appendChild(overlay)

  // Add to RC background (below overlay but above page)
  RC._replaceBackground('')
  RC.background.appendChild(container)

  // Move video to the right half and maximize within that area; remember original style
  let originalVideoCssText = null
  let originalResizeHandler = null
  const positionVideoRightHalf = () => {
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

    // Available space: right half of screen
    const availWidth = window.innerWidth / 2
    const availHeight = window.innerHeight

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

    // Center vertically in the right half
    const topOffset = (availHeight - videoH) / 2

    v.style.position = 'fixed'
    v.style.left = `${window.innerWidth / 2 + (availWidth - videoW) / 2}px`
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
  positionVideoRightHalf()

  // State for guide line and click-based measurement
  const state = {
    lineLengthPx: null, // in CSS px on screen
    clickPoints: [], // [{x, y}] in CSS px relative to video container - max 2 points
    useClickMeasurement: false, // true if user has placed 2 click points
  }

  // Create click marker elements (circles to show where user clicked)
  const clickMarkers = []
  const clickLine = document.createElement('div')
  clickLine.id = 'just-credit-card-click-line'
  clickLine.style.position = 'absolute'
  clickLine.style.height = '3px'
  clickLine.style.backgroundColor = 'rgba(255, 100, 0, 0.95)'
  clickLine.style.pointerEvents = 'none'
  clickLine.style.display = 'none'
  clickLine.style.transformOrigin = 'left center'
  clickLine.style.zIndex = '1000000001'
  overlay.appendChild(clickLine)

  for (let i = 0; i < 2; i++) {
    const marker = document.createElement('div')
    marker.className = 'just-credit-card-click-marker'
    marker.style.position = 'absolute'
    marker.style.width = '16px'
    marker.style.height = '16px'
    marker.style.borderRadius = '50%'
    marker.style.backgroundColor = 'rgba(255, 100, 0, 0.9)'
    marker.style.border = '2px solid white'
    marker.style.boxShadow = '0 0 4px rgba(0,0,0,0.5)'
    marker.style.pointerEvents = 'none'
    marker.style.display = 'none'
    marker.style.transform = 'translate(-50%, -50%)'
    marker.style.zIndex = '1000000002'
    overlay.appendChild(marker)
    clickMarkers.push(marker)
  }

  function updateClickVisuals() {
    // Update marker positions
    state.clickPoints.forEach((pt, i) => {
      if (clickMarkers[i]) {
        clickMarkers[i].style.left = `${pt.screenX}px`
        clickMarkers[i].style.top = `${pt.screenY}px`
        clickMarkers[i].style.display = 'block'
      }
    })
    // Hide unused markers
    for (let i = state.clickPoints.length; i < 2; i++) {
      if (clickMarkers[i]) clickMarkers[i].style.display = 'none'
    }

    // Update connecting line
    if (state.clickPoints.length === 2) {
      const p1 = state.clickPoints[0]
      const p2 = state.clickPoints[1]
      const dx = p2.screenX - p1.screenX
      const dy = p2.screenY - p1.screenY
      const length = Math.sqrt(dx * dx + dy * dy)
      const angle = Math.atan2(dy, dx) * (180 / Math.PI)

      clickLine.style.left = `${p1.screenX}px`
      clickLine.style.top = `${p1.screenY}px`
      clickLine.style.width = `${length}px`
      clickLine.style.transform = `rotate(${angle}deg)`
      clickLine.style.display = 'block'

      state.useClickMeasurement = true
      // Hide the green guide line when using click measurement
      guide.style.opacity = '0.3'
    } else {
      clickLine.style.display = 'none'
      state.useClickMeasurement = false
      guide.style.opacity = '1'
    }
  }

  function clearClickPoints() {
    state.clickPoints = []
    state.useClickMeasurement = false
    updateClickVisuals()
  }

  function handleVideoClick(e) {
    const v = document.getElementById('webgazerVideoContainer')
    if (!v) return

    const vRect = v.getBoundingClientRect()
    const cam = getCameraResolution(RC)
    if (!cam) return

    // Get click position relative to video container
    const clickX = e.clientX - vRect.left
    const clickY = e.clientY - vRect.top

    // Convert to virtual pixels (camera resolution)
    const scaleX = cam.width / vRect.width
    const scaleY = cam.height / vRect.height
    const vPxX = clickX * scaleX
    const vPxY = clickY * scaleY

    // Store both screen coordinates and virtual pixel coordinates
    const point = {
      screenX: e.clientX,
      screenY: e.clientY,
      relX: clickX,
      relY: clickY,
      vPxX: vPxX,
      vPxY: vPxY,
    }

    if (state.clickPoints.length >= 2) {
      // Reset and start new measurement
      state.clickPoints = [point]
    } else {
      state.clickPoints.push(point)
    }

    updateClickVisuals()
  }

  // Make video container clickable
  const vContForClick = document.getElementById('webgazerVideoContainer')
  if (vContForClick) {
    vContForClick.style.cursor = 'crosshair'
    vContForClick.style.pointerEvents = 'auto'
    vContForClick.addEventListener('click', handleVideoClick)
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
    const rect = getExpectedVideoRect(RC)
    edgeToggle.style.top = `${rect.top + 10}px`
    edgeToggle.style.left = `${rect.left + 10}px`
  }
  positionEdgeToggle()
  // Append to body instead of overlay to avoid pointer-events issues
  document.body.appendChild(edgeToggle)

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
  const expectedRectInitial = getExpectedVideoRect(RC)
  state.lineLengthPx = expectedRectInitial.width * 0.6
  positionGuide(guide, state.lineLengthPx, expectedRectInitial)

  // Re-position the guide after layout settles so it's always at 10% from the bottom of the video
  const scheduleGuideReposition = () => {
    positionVideoRightHalf()
    // Use expected rect based on known positioning (right half of viewport)
    // This avoids issues with getBoundingClientRect returning stale values
    const expectedRect = getExpectedVideoRect(RC)
    if (state.lineLengthPx == null) {
      state.lineLengthPx = expectedRect.width * 0.6
    }
    positionGuide(guide, state.lineLengthPx, expectedRect)
    guide.style.opacity = '1'
  }

  function updateTitle() {
    const idx = Math.min(measurements.length + 1, measurementCount)
    const total = measurementCount
    const t = phrases.RC_distanceTrackingN?.[RC.L]
      ?.replace('[[N1]]', String(idx))
      ?.replace('[[N2]]', String(total))
    title.innerText = t || `Measurement ${idx} of ${total}`
  }

  function renderPage() {
    updateTitle()
    const isRepeat = currentPage === 4

    // Parse and render step instructions (Stepper in left column only)
    try {
      const text = getInstructions(RC, isRepeat)
      stepInstructionModel = parseInstructions(text)
      currentStepFlatIndex = 0
      renderStepInstructions({
        model: stepInstructionModel,
        flatIndex: currentStepFlatIndex,
        elements: {
          leftText: leftInstructionsText,
          rightText: null,
          mediaContainer: mediaContainer,
        },
        options: {
          thresholdFraction: 0.6,
          useCurrentSectionOnly: true,
          stepperHistory: options.stepperHistory,
          layout: 'leftOnly', // 1-column Stepper on the left
        },
        lang: RC.language?.value || RC.L,
        langDirection: RC.LD,
        phrases,
      })
    } catch (e) {
      leftInstructionsText.textContent = getInstructions(RC, isRepeat).replace(
        /<br\s*\/?>/gi,
        '\n',
      )
    }

    // Initial line length = 60% of video width (use expected rect for consistent positioning)
    const expectedRect = getExpectedVideoRect(RC)
    if (state.lineLengthPx == null) {
      state.lineLengthPx = expectedRect.width * 0.6
    }
    scheduleGuideReposition()
  }

  function resizeHandler() {
    scheduleGuideReposition()
    positionEdgeToggle()
  }

  window.addEventListener('resize', resizeHandler)

  // Up/Down to navigate Stepper
  const handleInstructionNav = e => {
    if (![3, 4].includes(currentPage) || !stepInstructionModel) return
    if (e.key === 'ArrowDown') {
      const maxIdx = (stepInstructionModel.flatSteps?.length || 1) - 1
      if (currentStepFlatIndex < maxIdx) {
        currentStepFlatIndex++
        renderStepInstructions({
          model: stepInstructionModel,
          flatIndex: currentStepFlatIndex,
          elements: {
            leftText: leftInstructionsText,
            rightText: null,
            mediaContainer: mediaContainer,
          },
          options: {
            thresholdFraction: 0.6,
            useCurrentSectionOnly: true,
            stepperHistory: options.stepperHistory,
            layout: 'leftOnly',
          },
          lang: RC.language?.value || RC.L,
          langDirection: RC.LD,
          phrases,
        })
      }
      e.preventDefault()
      e.stopPropagation()
    } else if (e.key === 'ArrowUp') {
      if (currentStepFlatIndex > 0) {
        currentStepFlatIndex--
        renderStepInstructions({
          model: stepInstructionModel,
          flatIndex: currentStepFlatIndex,
          elements: {
            leftText: leftInstructionsText,
            rightText: null,
            mediaContainer: mediaContainer,
          },
          options: {
            thresholdFraction: 0.6,
            useCurrentSectionOnly: true,
            stepperHistory: options.stepperHistory,
            layout: 'leftOnly',
          },
          lang: RC.language?.value || RC.L,
          langDirection: RC.LD,
          phrases,
        })
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

    // If user has placed 2 click points, use the distance between them
    if (state.useClickMeasurement && state.clickPoints.length === 2) {
      const p1 = state.clickPoints[0]
      const p2 = state.clickPoints[1]
      // Calculate distance in virtual pixels
      const dx = p2.vPxX - p1.vPxX
      const dy = p2.vPxY - p1.vPxY
      return Math.sqrt(dx * dx + dy * dy)
    }

    // Otherwise use the green line length
    const scaleX = cam.width / v.rect.width
    return state.lineLengthPx * scaleX
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

    const fVpx = (shortVPx * CREDIT_CARD_LONG_CM) / CREDIT_CARD_SHORT_CM
    const factorVpxCm = fVpx * ASSUMED_IPD_CM
    const cam = getCameraResolution(RC)
    const fOverHorizontal = cam ? fVpx / cam.width : null
    const mode = state.useClickMeasurement ? 'clickPoints' : 'lineAdjust'
    measurements.push({ shortVPx, fVpx, factorVpxCm, fOverHorizontal, mode })

    saveCalibrationAttempt(
      RC,
      'justCreditCard',
      { shortVPx, fVpx, factorVpxCm, fOverHorizontal, mode },
      commonCalibrationData,
    )

    // Clear click points after measurement so next page starts fresh
    clearClickPoints()

    if (measurements.length < measurementCount) {
      currentPage = 4
      renderPage()
      return
    }

    const data = finish()
    if (options.calibrateTrackDistanceCheckBool) {
      await RC._checkDistance(
        callback,
        data,
        'trackDistance',
        options.checkCallback,
        options.calibrateTrackDistanceCheckCm,
        options.callbackStatic,
        options.calibrateTrackDistanceCheckSecs,
        options.calibrateTrackDistanceCheckLengthCm,
        options.calibrateTrackDistanceCenterYourEyesBool,
        options.calibrateTrackDistancePupil,
        options.calibrateTrackDistanceChecking,
        options.calibrateTrackDistanceSpotXYDeg,
        options.calibrateTrackDistance,
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
    const expectedRect = getExpectedVideoRect(RC)
    const step = Math.max(2, Math.round(expectedRect.width * 0.01))
    state.lineLengthPx = Math.max(
      10,
      Math.min(expectedRect.width, state.lineLengthPx + delta * step),
    )
    scheduleGuideReposition()
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
      // Clear click points and revert to line measurement
      e.preventDefault()
      clearClickPoints()
    }
  }

  function cleanup() {
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
    // Reset video filter
    const vContainerCleanup = document.getElementById('webgazerVideoContainer')
    if (vContainerCleanup) vContainerCleanup.style.filter = ''
    // Restore camera preview size and position
    const v = document.getElementById('webgazerVideoContainer')
    if (v) {
      // Remove click handler and restore cursor
      v.removeEventListener('click', handleVideoClick)
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

    const avgFVpx =
      measurements.reduce((s, m) => s + (m.fVpx || 0), 0) /
      (measurements.length || 1)
    const fOverHorizontal = width ? avgFVpx / width : null

    const data = {
      method: 'justCreditCard',
      measurementMode: state.useClickMeasurement ? 'clickPoints' : 'lineAdjust',
      timestamp: performance.now(),
      shortCm: CREDIT_CARD_SHORT_CM,
      longCm: CREDIT_CARD_LONG_CM,
      measurements: measurements.map((m, i) => ({
        page: i === 0 ? 3 : 4,
        shortVPx: Math.round(m.shortVPx),
        fVpx: Math.round(m.fVpx),
        mode: m.mode || 'lineAdjust',
      })),
      fVpx: Math.round(avgFVpx),
      fOverHorizontal:
        fOverHorizontal != null ? Number(fOverHorizontal.toFixed(6)) : null,
      cameraResolutionXY: width && height ? `${width}x${height}` : '',
      // For downstream compatibility: provide a calibrationFactor = fVpx * ipdCm
      calibrationFactor: Math.round(avgFVpx * ASSUMED_IPD_CM),
      value: CREDIT_CARD_LONG_CM, // use the long edge as the reference "distance" value
    }

    // Persist in RC for later CSV/log export
    RC.justCreditCardCalibration = data
    RC.fOverHorizontal = data.fOverHorizontal
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

  const calibrationObject = {
    method,
    mode: measurement.mode || 'lineAdjust',
    pxPerCm: safeRoundCm(pxPerCmValue),
    cameraXYPx: safeRoundXYPx(cameraXYPxValue),
    centerXYPx: safeRoundXYPx(centerXYPxValue),
    fOverHorizontal: safeRoundCm(measurement.fOverHorizontal || 0),
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
