import { phrases } from '../i18n/schema'
import Swal from 'sweetalert2'
import { swalInfoOptions } from '../components/swalOptions'
import { setDefaultVideoPosition } from '../components/video'
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

function getInstructions(RC, isRepeat) {
  const fallbackPage3 =
    'Hold a credit card level with the floor, pressing one of its short edges firmly against the top center of your screen.\n' +
    'Slide the card left/right until it is left-right centered in the video.\n' +
    'Tilt the card slightly downward until, in the video, its bottom edge meets the green line.\n' +
    "Use the ◀ ▶ keys to resize the green line until it matches the card's bottom edge.\n" +
    'When the line matches the edge, press the SPACE bar. 🔉 You’ll hear a shutter click.'
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
  const rightColumn = instructionsUI.rightColumn
  const mediaContainer = instructionsUI.mediaContainer

  // Overlay and guide line
  const overlay = createOverlayLayer()
  const guide = createDashedGuide()
  overlay.appendChild(guide)
  document.body.appendChild(overlay)

  // Add to RC background (below overlay but above page)
  RC._replaceBackground('')
  RC.background.appendChild(container)

  // Move video to the right half and maximize within that area; remember original style
  let originalVideoCssText = null
  const positionVideoRightHalf = () => {
    const v = document.getElementById('webgazerVideoContainer')
    if (!v) return
    if (originalVideoCssText == null) {
      originalVideoCssText = v.style.cssText || ''
    }
    v.style.position = 'fixed'
    v.style.left = '50vw'
    v.style.right = '0'
    v.style.top = '0'
    v.style.bottom = 'unset'
    v.style.width = '50vw'
    v.style.height = '100vh'
    v.style.transform = 'none'
    v.style.zIndex = '999999999999' // below overlay but above page
  }
  positionVideoRightHalf()

  // Re-position the guide after layout settles so it's always at 10% from the bottom of the video
  const scheduleGuideReposition = () => {
    positionVideoRightHalf()
    requestAnimationFrame(() => {
      const v1 = getVideoContainerRect()
      if (v1) {
        if (state.lineLengthPx == null) {
          state.lineLengthPx = v1.rect.width * 0.6
        }
        positionGuide(guide, state.lineLengthPx, v1.rect)
      }
      requestAnimationFrame(() => {
        const v2 = getVideoContainerRect()
        if (v2) {
          positionGuide(guide, state.lineLengthPx, v2.rect)
        }
      })
    })
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
      console.log('stepInstructionModel...', stepInstructionModel)
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

    const v = getVideoContainerRect()
    if (!v) return

    // Initial line length = 60% of video width
    if (state.lineLengthPx == null) {
      state.lineLengthPx = v.rect.width * 0.6
    }
    scheduleGuideReposition()
  }

  function resizeHandler() {
    const v = getVideoContainerRect()
    if (!v) return
    scheduleGuideReposition()
  }

  window.addEventListener('resize', resizeHandler)

  const state = {
    lineLengthPx: null, // in CSS px on screen
  }

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
    const fVpx = (shortVPx * CREDIT_CARD_LONG_CM) / CREDIT_CARD_SHORT_CM
    measurements.push({ shortVPx, fVpx })

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
    const v = getVideoContainerRect()
    if (!v) return
    const step = Math.max(2, Math.round(v.rect.width * 0.01))
    state.lineLengthPx = Math.max(
      10,
      Math.min(v.rect.width, state.lineLengthPx + delta * step),
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
    }
  }

  function cleanup() {
    document.removeEventListener('keydown', keyHandler)
    window.removeEventListener('resize', resizeHandler)
    document.removeEventListener('keydown', handleInstructionNav)
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay)
    if (container && container.parentNode)
      container.parentNode.removeChild(container)
    // Restore camera preview size and position
    const v = document.getElementById('webgazerVideoContainer')
    if (v) {
      if (originalVideoCssText != null) {
        v.style.cssText = originalVideoCssText
      } else {
        setDefaultVideoPosition(RC, v)
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
      timestamp: performance.now(),
      shortCm: CREDIT_CARD_SHORT_CM,
      longCm: CREDIT_CARD_LONG_CM,
      measurements: measurements.map((m, i) => ({
        page: i === 0 ? 3 : 4,
        shortVPx: Math.round(m.shortVPx),
        fVpx: Math.round(m.fVpx),
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
