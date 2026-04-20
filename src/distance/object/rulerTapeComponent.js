/**
 * rulerTapeComponent.js
 *
 * Self-contained factory that reproduces the ruler/tape UI component from the
 * legacy objectTest function in distance.js.  The component creates its own DOM
 * elements, manages drag state, handles keyboard arrow events, and cleans up
 * after itself.
 *
 * The caller (pageController) calls mount(container) to add it to the DOM and
 * cleanup() to remove it.
 */

import {
  TAPE_WIDTH_INCHES,
  TAPE_LINE_THICKNESS_PX,
  HANDLE_HOTSPOT_DIVISOR,
  BOTTOM_MARGIN_PX,
  RULER_TICK_LENGTH_RATIO,
  RULER_TICK_WIDTH_PX,
  RULER_NUMBER_FONT_SIZE_REM,
  RULER_LABEL_FONT_SIZE_REM,
  RULER_LABEL_SCALE_THRESHOLD,
  RULER_LABEL_MIN_SCALE,
  ARROW_OFFSET_BELOW_TAPE_PX,
  ARROWHEAD_LINE_WIDTH_PX,
  ARROWHEAD_LINE_HEIGHT_PX,
  MIN_RULER_DISTANCE_PX,
  RULER_Y_MAX_MARGIN_PX,
  TEXT_BOX_INITIAL_HEIGHT_PX,
  INTERVAL_BASE_FACTOR,
  INTERVAL_RANDOM_AMPLITUDE,
  INTERVAL_MIN_CM,
  INTERVAL_HEADROOM_CM,
  RULER_SHIFT_ANIMATION_SPEED_PX_PER_SEC,
  RULER_SHIFT_TARGET_MARGIN_PX,
  RULER_SHIFT_BUTTON_SIZE_PX,
  RULER_SHIFT_GAP_ABOVE_RULER_PX,
  ARROW_KEY_FAST_THRESHOLD_COUNT,
  ARROW_KEY_FAST_STEP_MM,
  ARROW_KEY_TAP_STEP_MM,
  ARROW_KEY_INTERVAL_MS,
  PAPER_MODE_PLACEHOLDER_LENGTH_CM,
  DOM_ID,
  Z_INDEX,
} from './objectTestConstants'

import { objectLengthCmGlobal, globalPointXYPx } from './objectTestOrchestrator'

import { debugLog } from './debugLogger'

// ─── Geometry helpers ────────────────────────────────────────────────────────

const getDistance = (x1, y1, x2, y2) =>
  Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)

const getAngle = (x1, y1, x2, y2) =>
  Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI)

// ─── Internal DOM builders ───────────────────────────────────────────────────

/**
 * Build the tape container and every child element that makes up the ruler.
 * Returns the same shape as the legacy `createDiagonalTapeComponent`.
 */
function buildTapeDOM(ppi, tapeWidth, lineThickness, showLength, woodSvg) {
  const handleHotspotWidth = Math.round(ppi / HANDLE_HOTSPOT_DIVISOR)

  const tapeContainer = document.createElement('div')
  tapeContainer.id = DOM_ID.DIAGONAL_TAPE
  tapeContainer.className += ' rc-lang-ltr'
  tapeContainer.style.position = 'absolute'
  tapeContainer.style.left = '0px'
  tapeContainer.style.top = '0px'
  tapeContainer.style.width = '100vw'
  tapeContainer.style.height = '100vh'
  tapeContainer.style.pointerEvents = 'none'
  tapeContainer.style.zIndex = Z_INDEX.TAPE_CONTAINER

  const diagonalTape = document.createElement('div')
  diagonalTape.style.position = 'absolute'
  diagonalTape.style.background = 'rgba(255, 221, 51, 0.95)'
  diagonalTape.style.border = '2px solid rgb(0, 0, 0)'
  diagonalTape.style.borderRadius = '2px'
  diagonalTape.style.zIndex = Z_INDEX.TAPE_BODY
  diagonalTape.style.transformOrigin = 'left center'
  tapeContainer.appendChild(diagonalTape)

  if (!showLength) {
    let sourceSvg = woodSvg
    try {
      const pngMatch =
        woodSvg.match(/xlink:href="([^"]+)"/) || woodSvg.match(/href="([^"]+)"/)
      const widthMatch = woodSvg.match(/width="([\d.]+)px"/)
      const heightMatch = woodSvg.match(/height="([\d.]+)px"/)
      const originalWidth = widthMatch
        ? Math.round(parseFloat(widthMatch[1]))
        : 6000
      const originalHeight = heightMatch
        ? Math.round(parseFloat(heightMatch[1]))
        : 3000
      const croppedHeight = Math.max(1, Math.round(originalHeight / 2))
      if (pngMatch && pngMatch[1]) {
        const pngHref = pngMatch[1]
        sourceSvg =
          `<svg xmlns="http://www.w3.org/2000/svg" ` +
          `xmlns:xlink="http://www.w3.org/1999/xlink" ` +
          `width="${originalWidth}px" height="${croppedHeight}px" ` +
          `viewBox="0 0 ${originalWidth} ${croppedHeight}">` +
          `<image xlink:href="${pngHref}" x="0" y="0" ` +
          `width="${originalWidth}" height="${originalHeight}" />` +
          `</svg>`
      }
    } catch (_e) {
      sourceSvg = woodSvg
    }

    const woodDataUrl = `url("data:image/svg+xml;utf8,${encodeURIComponent(sourceSvg)}")`
    diagonalTape.style.background = 'transparent'
    diagonalTape.style.backgroundImage = woodDataUrl
    diagonalTape.style.backgroundRepeat = 'repeat'
    diagonalTape.style.backgroundPosition = '0 0'
    diagonalTape.style.backgroundSize = `auto ${Math.round(tapeWidth)}px`
  }

  // Left handle
  const leftHandle = document.createElement('div')
  leftHandle.style.position = 'absolute'
  leftHandle.style.width = `${handleHotspotWidth}px`
  leftHandle.style.height = `${tapeWidth}px`
  leftHandle.style.background = 'transparent'
  leftHandle.style.borderRadius = '1px'
  leftHandle.style.boxShadow = 'none'
  leftHandle.style.cursor = 'move'
  leftHandle.style.pointerEvents = 'auto'
  leftHandle.style.zIndex = Z_INDEX.TAPE_HANDLE
  leftHandle.style.transform = 'translate(-50%, -50%)'
  leftHandle.style.transformOrigin = 'center center'
  tapeContainer.appendChild(leftHandle)

  const leftVisualLine = document.createElement('div')
  leftVisualLine.style.position = 'absolute'
  leftVisualLine.style.width = `${lineThickness}px`
  leftVisualLine.style.height = `${tapeWidth}px`
  leftVisualLine.style.background = 'transparent'
  leftVisualLine.style.borderRadius = '1px'
  leftVisualLine.style.boxShadow = 'none'
  leftVisualLine.style.left = '50%'
  leftVisualLine.style.top = '50%'
  leftVisualLine.style.transform = 'translate(-50%, -50%)'
  leftVisualLine.style.pointerEvents = 'none'
  leftVisualLine.style.zIndex = Z_INDEX.TAPE_VISUAL_LINE
  leftHandle.appendChild(leftVisualLine)

  // Right handle
  const rightHandle = document.createElement('div')
  rightHandle.style.position = 'absolute'
  rightHandle.style.width = `${handleHotspotWidth}px`
  rightHandle.style.height = `${tapeWidth}px`
  rightHandle.style.background = 'transparent'
  rightHandle.style.borderRadius = '1px'
  rightHandle.style.boxShadow = 'none'
  rightHandle.style.cursor = 'move'
  rightHandle.style.pointerEvents = 'auto'
  rightHandle.style.zIndex = Z_INDEX.TAPE_HANDLE
  rightHandle.style.transform = 'translate(-50%, -50%)'
  rightHandle.style.transformOrigin = 'center center'
  tapeContainer.appendChild(rightHandle)

  const rightVisualLine = document.createElement('div')
  rightVisualLine.style.position = 'absolute'
  rightVisualLine.style.width = `${lineThickness}px`
  rightVisualLine.style.height = `${tapeWidth}px`
  rightVisualLine.style.background = 'transparent'
  rightVisualLine.style.borderRadius = '1px'
  rightVisualLine.style.boxShadow = 'none'
  rightVisualLine.style.left = '50%'
  rightVisualLine.style.top = '50%'
  rightVisualLine.style.transform = 'translate(-50%, -50%)'
  rightVisualLine.style.pointerEvents = 'none'
  rightVisualLine.style.zIndex = Z_INDEX.TAPE_VISUAL_LINE
  rightHandle.appendChild(rightVisualLine)

  // Dynamic length label
  const dynamicLengthLabel = document.createElement('div')
  dynamicLengthLabel.style.position = 'absolute'
  dynamicLengthLabel.style.color = 'rgb(0, 0, 0)'
  dynamicLengthLabel.style.fontWeight = 'bold'
  dynamicLengthLabel.style.fontSize = '1.4rem'
  dynamicLengthLabel.style.background = '#eee'
  dynamicLengthLabel.style.padding = '2px 6px'
  dynamicLengthLabel.style.whiteSpace = 'nowrap'
  dynamicLengthLabel.style.zIndex = Z_INDEX.DYNAMIC_LABEL
  dynamicLengthLabel.style.transform = 'translate(-50%, -50%)'
  tapeContainer.appendChild(dynamicLengthLabel)
  if (!showLength) {
    dynamicLengthLabel.style.display = 'none'
  }

  // Ruler markings container
  const rulerMarkingsContainer = document.createElement('div')
  rulerMarkingsContainer.style.position = 'absolute'
  rulerMarkingsContainer.style.zIndex = Z_INDEX.RULER_MARKINGS
  rulerMarkingsContainer.style.pointerEvents = 'none'
  tapeContainer.appendChild(rulerMarkingsContainer)

  // Double-sided arrow container
  const arrowContainer = document.createElement('div')
  arrowContainer.style.position = 'absolute'
  arrowContainer.style.zIndex = Z_INDEX.ARROW_CONTAINER
  arrowContainer.style.pointerEvents = 'none'
  tapeContainer.appendChild(arrowContainer)
  if (!showLength) {
    arrowContainer.style.display = 'none'
  }

  const arrowLine = document.createElement('div')
  arrowLine.style.position = 'absolute'
  arrowLine.style.background = 'rgb(0, 0, 0)'
  arrowLine.style.transformOrigin = 'left center'
  arrowLine.style.height = `${ARROWHEAD_LINE_HEIGHT_PX}px`
  arrowContainer.appendChild(arrowLine)

  const makeArrowLeg = () => {
    const leg = document.createElement('div')
    leg.style.position = 'absolute'
    leg.style.background = 'rgb(0, 0, 0)'
    leg.style.width = `${ARROWHEAD_LINE_WIDTH_PX}px`
    leg.style.height = `${ARROWHEAD_LINE_HEIGHT_PX}px`
    leg.style.transformOrigin = 'left center'
    arrowContainer.appendChild(leg)
    return leg
  }

  const leftArrowLine1 = makeArrowLeg()
  const leftArrowLine2 = makeArrowLeg()
  const rightArrowLine1 = makeArrowLeg()
  const rightArrowLine2 = makeArrowLeg()

  return {
    container: tapeContainer,
    elements: {
      diagonalTape,
      leftHandle,
      rightHandle,
      leftVisualLine,
      rightVisualLine,
      dynamicLengthLabel,
      rulerMarkingsContainer,
      arrowContainer,
      arrowLine,
      leftArrowLine1,
      leftArrowLine2,
      rightArrowLine1,
      rightArrowLine2,
    },
    dimensions: { tapeWidth, lineThickness },
    helpers: { getDistance, getAngle },
  }
}

/**
 * Build a simple text-box label (used at left/right tape ends).
 * Faithfully reproduces legacy `createSimpleTextBox`.
 */
function buildSimpleTextBox(text, isLeft, screenWidth, updateDiagonalLabelsFn) {
  const textContainer = document.createElement('div')
  textContainer.style.position = 'absolute'
  textContainer.style.zIndex = Z_INDEX.TEXT_BOX

  const maxWidth = screenWidth / 3

  const textBox = document.createElement('div')
  textBox.style.position = 'relative'
  textBox.style.maxWidth = `${maxWidth}px`
  textBox.style.background = 'transparent'
  textBox.style.border = 'none'
  textBox.style.display = 'flex'
  textBox.style.alignItems = 'center'
  textBox.style.justifyContent = 'center'
  textBox.style.padding = '0px'

  const textElement = document.createElement('div')
  textElement.innerText = text
  textElement.style.color = 'rgb(0, 0, 0)'
  textElement.style.fontWeight = 'normal'
  textElement.style.fontSize = '1.2em'
  textElement.style.textAlign = isLeft ? 'left' : 'right'
  textElement.style.lineHeight = '1.2'
  textElement.style.whiteSpace = 'normal'
  textElement.style.wordWrap = 'break-word'
  textElement.style.textShadow = '1px 1px 2px rgba(255, 255, 255, 0.8)'
  textBox.appendChild(textElement)

  textContainer.appendChild(textBox)

  const updateText = newText => {
    textElement.innerText = newText
    setTimeout(() => {
      const rect = textBox.getBoundingClientRect()
      textContainer.dimensions = { width: rect.width, height: rect.height }
      if (typeof updateDiagonalLabelsFn === 'function') {
        updateDiagonalLabelsFn()
      }
    }, 0)
    return maxWidth
  }

  setTimeout(() => {
    const rect = textBox.getBoundingClientRect()
    textContainer.dimensions = { width: rect.width, height: rect.height }
  }, 0)

  return {
    container: textContainer,
    textElement,
    updateText,
    dimensions: { width: maxWidth, height: TEXT_BOX_INITIAL_HEIGHT_PX },
  }
}

// ─── Public factory ──────────────────────────────────────────────────────────

/**
 * Creates the ruler/tape UI component that was formerly built inline inside the
 * legacy `objectTest` function.
 *
 * @param {Object} config
 * @param {number}  config.ppi               Pixels per inch for this display.
 * @param {number}  config.pxPerMm           Pixels per millimetre.
 * @param {number}  config.pxPerCm           Pixels per centimetre.
 * @param {boolean} config.showLengthBool    Whether to show the numeric length / unit markings.
 * @param {string}  config.selectedUnit      'inches' | 'cm'.
 * @param {Object}  config.phrases           Localised phrase dictionary.
 * @param {Object}  config.RC                RemoteCalibrator instance.
 * @param {Object}  config.options           Calibration options bag.
 * @param {{ value: number }} config.objectLengthCmGlobal  Shared mutable ref for object length.
 * @param {string}  config.woodSvg           SVG markup for the wood-grain texture (used when !showLength).
 * @param {boolean} [config.isPaperSelectionMode=false]  Whether we are in paper-selection mode.
 * @param {function} [config.getCurrentPage]  Returns current page identifier (number | string).
 * @param {string|number} [config.TUBE_CHECK_PAGE]  Page id for the tube-check page.
 *
 * @returns {{
 *   mount:                  function(HTMLElement): void,
 *   getObjectLengthCm:      function(): number,
 *   resetForNewMeasurement: function(): void,
 *   setUnit:                function(string): void,
 *   getEndpoints:           function(): {startX:number,startY:number,endX:number,endY:number},
 *   cleanup:                function(): void,
 *   elements:               Object,
 *   showRulerShiftButton:   function(): void,
 *   hideRulerShiftButton:   function(): void,
 *   updateDiagonalLabels:   function(): void,
 *   cancelRulerShiftAnimation: function(): void,
 *   computeNewIntervalCm:   function(): number,
 *   resetIntervalCm:        function(): void,
 *   tape:                   Object,
 * }}
 */
export function createRulerTapeComponent(config) {
  const {
    ppi,
    pxPerMm,
    pxPerCm,
    showLengthBool,
    selectedUnit: initialSelectedUnit,
    phrases,
    RC,
    options,
    woodSvg,
    isPaperSelectionMode = false,
    getCurrentPage = () => 2,
    TUBE_CHECK_PAGE = 'tubeCheck',
  } = config

  const showLength = !!showLengthBool
  let selectedUnit = initialSelectedUnit

  // ─── Screen / position state ─────────────────────────────────────────────

  let screenWidth = window.innerWidth
  let screenHeight = window.innerHeight
  const tapeYPosition = screenHeight - BOTTOM_MARGIN_PX
  const oneCMInPx = pxPerMm * 10
  const leftMarginPx = oneCMInPx
  const initialRulerLengthPx = screenWidth - oneCMInPx * 2

  let startX = leftMarginPx
  let startY = tapeYPosition
  let endX = leftMarginPx + initialRulerLengthPx
  let endY = tapeYPosition

  // ─── Tape DOM ────────────────────────────────────────────────────────────

  const tapeWidth = Math.round(TAPE_WIDTH_INCHES * ppi)
  const lineThickness = TAPE_LINE_THICKNESS_PX
  const tape = buildTapeDOM(ppi, tapeWidth, lineThickness, showLength, woodSvg)

  // ─── Interval randomisation (showLength === false) ───────────────────────

  let intervalCmCurrent = null

  /** Compute a new random interval so the first tick fits inside the ruler. */
  const computeNewIntervalCm = () => {
    const currentDistancePx = getDistance(startX, startY, endX, endY)
    const currentLengthCm = currentDistancePx / pxPerCm
    const r = INTERVAL_BASE_FACTOR + INTERVAL_RANDOM_AMPLITUDE * Math.random()
    return Math.max(
      INTERVAL_MIN_CM,
      Math.max(0, currentLengthCm - INTERVAL_HEADROOM_CM) * r,
    )
  }

  // ─── Text labels ─────────────────────────────────────────────────────────

  const leftLabel = buildSimpleTextBox(
    phrases.RC_LeftEdge[RC.L],
    true,
    screenWidth,
    () => updateDiagonalLabels(),
  )

  const rightLabel = buildSimpleTextBox(
    phrases.RC_RightEdge[RC.L],
    false,
    screenWidth,
    () => updateDiagonalLabels(),
  )
  rightLabel.container.id = DOM_ID.RIGHT_LINE_LABEL

  // ─── Ruler-Shift button ──────────────────────────────────────────────────

  const rulerShiftButton = document.createElement('button')
  rulerShiftButton.id = DOM_ID.RULER_SHIFT_BUTTON
  rulerShiftButton.innerHTML = '⬅'
  rulerShiftButton.style.position = 'fixed'
  rulerShiftButton.style.fontSize = '60pt'
  rulerShiftButton.style.width = `${RULER_SHIFT_BUTTON_SIZE_PX}px`
  rulerShiftButton.style.height = `${RULER_SHIFT_BUTTON_SIZE_PX}px`
  rulerShiftButton.style.backgroundColor = '#FFD700'
  rulerShiftButton.style.border = 'none'
  rulerShiftButton.style.borderRadius = '50%'
  rulerShiftButton.style.cursor = 'pointer'
  rulerShiftButton.style.zIndex = Z_INDEX.RULER_SHIFT_BUTTON
  rulerShiftButton.style.display = 'flex'
  rulerShiftButton.style.alignItems = 'center'
  rulerShiftButton.style.justifyContent = 'center'
  rulerShiftButton.style.boxShadow =
    '0 6px 16px rgba(255, 140, 0, 0.6), 0 0 20px rgba(255, 215, 0, 0.4)'
  rulerShiftButton.style.transition = `all ${RULER_SHIFT_GAP_ABOVE_RULER_PX ? '0.3s' : '0.3s'} cubic-bezier(0.34, 1.56, 0.64, 1)`
  rulerShiftButton.style.fontWeight = 'bold'
  rulerShiftButton.style.lineHeight = '1'
  rulerShiftButton.style.padding = '0'
  rulerShiftButton.style.outline = 'none'
  rulerShiftButton.title = 'Click to shift ruler left and extend to fit screen'

  // Pulse animation keyframes
  const pulseKeyframes = `
    @keyframes ruler-shift-pulse {
      0%, 100% { transform: translate(-50%, 0) scale(1); }
      50% { transform: translate(-50%, 0) scale(1.08); }
    }
  `
  if (!document.getElementById(DOM_ID.RULER_SHIFT_PULSE_STYLE)) {
    const style = document.createElement('style')
    style.id = DOM_ID.RULER_SHIFT_PULSE_STYLE
    style.textContent = pulseKeyframes
    document.head.appendChild(style)
  }
  rulerShiftButton.style.animation = 'ruler-shift-pulse 2s ease-in-out infinite'

  const positionRulerShiftButton = () => {
    const buttonX = screenWidth / 2
    const rulerY = (startY + endY) / 2
    const rulerTopEdge = rulerY - tape.dimensions.tapeWidth / 2
    const buttonBottomEdge = rulerTopEdge - RULER_SHIFT_GAP_ABOVE_RULER_PX
    const buttonY = buttonBottomEdge - RULER_SHIFT_BUTTON_SIZE_PX
    rulerShiftButton.style.left = `${buttonX}px`
    rulerShiftButton.style.top = `${buttonY}px`
    rulerShiftButton.style.transform = 'translate(-50%, 0)'
  }
  positionRulerShiftButton()

  // Hover / active states
  rulerShiftButton.addEventListener('mouseenter', () => {
    rulerShiftButton.style.animation = 'none'
    rulerShiftButton.style.backgroundColor = '#FFA500'
    rulerShiftButton.style.transform = 'translate(-50%, -5px) scale(1.15)'
    rulerShiftButton.style.boxShadow =
      '0 10px 25px rgba(255, 140, 0, 0.8), 0 0 30px rgba(255, 215, 0, 0.6)'
  })
  rulerShiftButton.addEventListener('mouseleave', () => {
    rulerShiftButton.style.animation =
      'ruler-shift-pulse 2s ease-in-out infinite'
    rulerShiftButton.style.backgroundColor = '#FFD700'
    rulerShiftButton.style.transform = 'translate(-50%, 0) scale(1)'
    rulerShiftButton.style.boxShadow =
      '0 6px 16px rgba(255, 140, 0, 0.6), 0 0 20px rgba(255, 215, 0, 0.4)'
  })
  rulerShiftButton.addEventListener('mousedown', () => {
    if (!isAnimating) {
      rulerShiftButton.style.transform = 'translate(-50%, 2px) scale(1.05)'
      rulerShiftButton.style.boxShadow = '0 2px 8px rgba(255, 140, 0, 0.8)'
    }
  })

  // ─── Ruler-Shift animation ───────────────────────────────────────────────

  let isAnimating = false
  let animationFrameId = null

  const cancelRulerShiftAnimation = () => {
    if (isAnimating) {
      isAnimating = false
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
        animationFrameId = null
      }
      rulerShiftButton.disabled = false
      rulerShiftButton.style.opacity = '1'
      rulerShiftButton.style.cursor = 'pointer'
      rulerShiftButton.style.animation =
        'ruler-shift-pulse 2s ease-in-out infinite'
      rulerShiftButton.style.transform = 'translate(-50%, 0) scale(1)'
      rulerShiftButton.style.backgroundColor = '#FFD700'
    }
  }

  const getRightmostVisibleTickX = () => {
    const distance = getDistance(startX, startY, endX, endY)
    const objectLengthMm = distance / pxPerMm
    const objectLengthCm = objectLengthMm / 10

    let spacingInPx
    let numMarks

    if (!showLength) {
      if (!intervalCmCurrent) intervalCmCurrent = computeNewIntervalCm()
      spacingInPx = intervalCmCurrent * pxPerCm
      numMarks = Math.ceil(objectLengthCm / intervalCmCurrent)
    } else {
      const objectLengthInches = objectLengthCm / 2.54
      if (selectedUnit === 'inches') {
        spacingInPx = pxPerMm * 25.4
        numMarks = Math.ceil(objectLengthInches)
      } else {
        spacingInPx = pxPerMm * 10
        numMarks = Math.ceil(objectLengthCm)
      }
    }

    let rightmostTickX = startX
    for (let i = 1; i <= numMarks; i++) {
      const markPosition = i * spacingInPx
      if (markPosition > distance) break
      rightmostTickX = startX + markPosition
    }
    return rightmostTickX
  }

  const performRulerShift = () => {
    if (isAnimating) return

    isAnimating = true
    rulerShiftButton.disabled = true
    rulerShiftButton.style.animation = 'none'
    rulerShiftButton.style.opacity = '0.6'
    rulerShiftButton.style.cursor = 'not-allowed'
    rulerShiftButton.style.transform = 'translate(-50%, 0) scale(0.95)'
    rulerShiftButton.style.backgroundColor = '#D3D3D3'

    const ANIMATION_SPEED = RULER_SHIFT_ANIMATION_SPEED_PX_PER_SEC
    const TARGET_MARGIN = RULER_SHIFT_TARGET_MARGIN_PX

    let phase = 1
    let lastTimestamp = performance.now()

    const animate = currentTimestamp => {
      const deltaTime = (currentTimestamp - lastTimestamp) / 1000
      lastTimestamp = currentTimestamp
      const movement = ANIMATION_SPEED * deltaTime

      if (phase === 1) {
        const rightmostTickX = getRightmostVisibleTickX()
        const targetX = TARGET_MARGIN

        if (rightmostTickX > targetX + 1) {
          const distanceToMove = Math.min(movement, rightmostTickX - targetX)
          const currentTapeY = startY
          const newStartX = startX - distanceToMove
          const newEndX = endX - distanceToMove
          updateRulerEndpoints(
            newStartX,
            currentTapeY,
            newEndX,
            currentTapeY,
            true,
          )
          animationFrameId = requestAnimationFrame(animate)
        } else {
          phase = 2
          animationFrameId = requestAnimationFrame(animate)
        }
      } else if (phase === 2) {
        const targetEndX = screenWidth - TARGET_MARGIN

        if (endX < targetEndX - 1) {
          const distanceToExtend = Math.min(movement, targetEndX - endX)
          const currentTapeY = startY
          const newEndX = endX + distanceToExtend
          const isStartOffScreen = startX < 0 || startX > screenWidth
          updateRulerEndpoints(
            startX,
            currentTapeY,
            newEndX,
            currentTapeY,
            isStartOffScreen,
          )
          animationFrameId = requestAnimationFrame(animate)
        } else {
          isAnimating = false
          rulerShiftButton.disabled = false
          rulerShiftButton.style.opacity = '1'
          rulerShiftButton.style.cursor = 'pointer'
          rulerShiftButton.style.animation =
            'ruler-shift-pulse 2s ease-in-out infinite'
          rulerShiftButton.style.transform = 'translate(-50%, 0) scale(1)'
          rulerShiftButton.style.backgroundColor = '#FFD700'
        }
      }
    }

    animationFrameId = requestAnimationFrame(animate)
  }

  rulerShiftButton.addEventListener('click', e => {
    e.preventDefault()
    e.stopPropagation()
    performRulerShift()
    rulerShiftButton.style.display = 'none'
  })

  rulerShiftButton.style.display = 'none'

  // ─── Update functions ────────────────────────────────────────────────────

  /** Update ruler tick marks and number labels. */
  const updateRulerMarkings = () => {
    tape.elements.rulerMarkingsContainer.innerHTML = ''

    const distance = getDistance(startX, startY, endX, endY)

    const objectLengthMm = distance / pxPerMm
    const objectLengthCm = objectLengthMm / 10
    objectLengthCmGlobal.value = objectLengthCm

    let spacingInPx
    let numMarks

    if (!showLength) {
      if (!intervalCmCurrent) intervalCmCurrent = computeNewIntervalCm()
      spacingInPx = intervalCmCurrent * pxPerCm
      numMarks = Math.ceil(objectLengthCm / intervalCmCurrent)
    } else {
      const objectLengthInches = objectLengthCm / 2.54
      if (selectedUnit === 'inches') {
        spacingInPx = pxPerMm * 25.4
        numMarks = Math.ceil(objectLengthInches)
      } else {
        spacingInPx = pxPerMm * 10
        numMarks = Math.ceil(objectLengthCm)
      }
    }

    for (let i = 1; i <= numMarks; i++) {
      const markPosition = i * spacingInPx
      if (markPosition > distance) break

      const markX = startX + markPosition
      const markY = startY

      // Top tick
      const tickTop = document.createElement('div')
      tickTop.style.position = 'absolute'
      const tickLength = tape.dimensions.tapeWidth * RULER_TICK_LENGTH_RATIO
      const upperEdgeOffset = tape.dimensions.tapeWidth / 2
      const tickStartX = markX
      const tickStartY = markY - upperEdgeOffset
      tickTop.style.left = `${tickStartX}px`
      tickTop.style.top = `${tickStartY}px`
      tickTop.style.width = `${RULER_TICK_WIDTH_PX}px`
      tickTop.style.height = `${tickLength}px`
      tickTop.style.background = 'rgb(0, 0, 0)'
      tickTop.style.transformOrigin = 'center top'
      tickTop.style.transform = 'rotate(0deg)'
      tape.elements.rulerMarkingsContainer.appendChild(tickTop)

      // Bottom tick
      const tickBottom = document.createElement('div')
      tickBottom.style.position = 'absolute'
      const tickBottomStartX = markX
      const tickBottomStartY = markY + upperEdgeOffset - tickLength
      tickBottom.style.left = `${tickBottomStartX}px`
      tickBottom.style.top = `${tickBottomStartY}px`
      tickBottom.style.width = `${RULER_TICK_WIDTH_PX}px`
      tickBottom.style.height = `${tickLength}px`
      tickBottom.style.background = 'rgb(0, 0, 0)'
      tickBottom.style.transformOrigin = 'center top'
      tickBottom.style.transform = 'rotate(0deg)'
      tape.elements.rulerMarkingsContainer.appendChild(tickBottom)

      // Number label
      const label = document.createElement('div')
      label.style.position = 'absolute'
      label.style.left = `${markX}px`
      label.style.top = `${markY}px`
      label.textContent = i.toString()
      label.style.color = 'rgb(0, 0, 0)'
      label.style.fontSize = `${RULER_NUMBER_FONT_SIZE_REM}rem`
      label.style.fontWeight = 'bold'
      label.style.whiteSpace = 'nowrap'
      label.style.userSelect = 'none'
      label.style.transform = 'translate(-50%, -50%)'
      tape.elements.rulerMarkingsContainer.appendChild(label)
    }
  }

  /** Update tape body geometry, handle positions, label, and arrow. */
  const updateDiagonalTapeComponent = () => {
    const distance = Math.abs(endX - startX)

    tape.elements.diagonalTape.style.left = `${startX}px`
    tape.elements.diagonalTape.style.top = `${startY - tape.dimensions.tapeWidth / 2}px`
    tape.elements.diagonalTape.style.width = `${distance}px`
    tape.elements.diagonalTape.style.height = `${tape.dimensions.tapeWidth}px`
    tape.elements.diagonalTape.style.transform = 'rotate(0deg)'

    tape.elements.leftHandle.style.left = `${startX}px`
    tape.elements.leftHandle.style.top = `${startY}px`
    tape.elements.leftHandle.style.transform =
      'translate(-50%, -50%) rotate(0deg)'
    tape.elements.rightHandle.style.left = `${endX}px`
    tape.elements.rightHandle.style.top = `${endY}px`
    tape.elements.rightHandle.style.transform =
      'translate(-50%, -50%) rotate(0deg)'

    const objectLengthPx = distance
    const objectLengthMm = objectLengthPx / pxPerMm
    const objectLengthCm = objectLengthMm / 10
    objectLengthCmGlobal.value = objectLengthCm
    const objectLengthInches = objectLengthCm / 2.54

    if (showLength) {
      const visibleStartX = Math.max(0, startX)
      const visibleEndX = Math.min(screenWidth, endX)
      const visibleCenterX = (visibleStartX + visibleEndX) / 2
      const visibleCenterY =
        startY + tape.dimensions.tapeWidth / 2 + ARROW_OFFSET_BELOW_TAPE_PX

      tape.elements.dynamicLengthLabel.style.left = `${visibleCenterX}px`
      tape.elements.dynamicLengthLabel.style.top = `${visibleCenterY}px`

      if (selectedUnit === 'inches') {
        tape.elements.dynamicLengthLabel.innerText = `${objectLengthInches.toFixed(1)}`
      } else {
        tape.elements.dynamicLengthLabel.innerText = `${objectLengthCm.toFixed(1)}`
      }

      const estimatedLabelWidth =
        tape.elements.dynamicLengthLabel.innerText.length * 10 + 12
      const visibleDistance = visibleEndX - visibleStartX
      if (estimatedLabelWidth > visibleDistance * RULER_LABEL_SCALE_THRESHOLD) {
        const scaleFactor =
          (visibleDistance * RULER_LABEL_SCALE_THRESHOLD) / estimatedLabelWidth
        const newFontSize =
          Math.max(RULER_LABEL_MIN_SCALE, scaleFactor) *
          RULER_LABEL_FONT_SIZE_REM
        tape.elements.dynamicLengthLabel.style.fontSize = `${newFontSize}rem`
      } else {
        tape.elements.dynamicLengthLabel.style.fontSize = `${RULER_LABEL_FONT_SIZE_REM}rem`
      }

      const arrowLength = distance
      const arrowOffsetBelow =
        tape.dimensions.tapeWidth / 2 + ARROW_OFFSET_BELOW_TAPE_PX
      const arrowStartX = startX
      const arrowStartY = startY + arrowOffsetBelow

      tape.elements.arrowLine.style.left = `${arrowStartX}px`
      tape.elements.arrowLine.style.top = `${arrowStartY}px`
      tape.elements.arrowLine.style.width = `${arrowLength}px`
      tape.elements.arrowLine.style.transform = 'rotate(0deg)'

      const leftTipX = arrowStartX
      const leftTipY = arrowStartY
      tape.elements.leftArrowLine1.style.left = `${leftTipX}px`
      tape.elements.leftArrowLine1.style.top = `${leftTipY}px`
      tape.elements.leftArrowLine1.style.transform = 'rotate(-30deg)'
      tape.elements.leftArrowLine2.style.left = `${leftTipX}px`
      tape.elements.leftArrowLine2.style.top = `${leftTipY}px`
      tape.elements.leftArrowLine2.style.transform = 'rotate(30deg)'

      const rightTipX = arrowStartX + arrowLength
      const rightTipY = arrowStartY
      tape.elements.rightArrowLine1.style.left = `${rightTipX}px`
      tape.elements.rightArrowLine1.style.top = `${rightTipY}px`
      tape.elements.rightArrowLine1.style.transform = 'rotate(150deg)'
      tape.elements.rightArrowLine2.style.left = `${rightTipX}px`
      tape.elements.rightArrowLine2.style.top = `${rightTipY}px`
      tape.elements.rightArrowLine2.style.transform = 'rotate(-150deg)'
    }

    updateRulerMarkings()
  }

  /** Update handle-end colours based on whether the object is too short. */
  const updateDiagonalColors = () => {
    const distance = getDistance(startX, startY, endX, endY)
    const objectLengthMm = distance / pxPerMm
    const objectLengthCm = objectLengthMm / 10
    objectLengthCmGlobal.value = objectLengthCm
    const minDistanceCm = options.calibrateDistanceMinCm || 10

    const isShort = objectLengthCm <= minDistanceCm
    const color = isShort ? 'rgb(255, 0, 0)' : 'rgb(0, 0, 0)'
    const shadow = isShort
      ? '0 0 8px rgba(255, 0, 0, 0.4)'
      : '0 0 8px rgba(0, 0, 0, 0.4)'

    tape.elements.leftVisualLine.style.background = color
    tape.elements.leftVisualLine.style.boxShadow = shadow
    tape.elements.rightVisualLine.style.background = color
    tape.elements.rightVisualLine.style.boxShadow = shadow
    tape.elements.diagonalTape.style.borderColor = color

    rightLabel.textElement.style.color = color
    const newText = isShort
      ? phrases.RC_viewingDistanceObjectTooShort[RC.L]
      : phrases.RC_RightEdge[RC.L]
    if (rightLabel.textElement.innerText !== newText) {
      rightLabel.updateText(newText)
    }
  }

  /** Position both text labels relative to the tape ends and update colours. */
  function updateDiagonalLabels() {
    if (isPaperSelectionMode) {
      objectLengthCmGlobal.value = PAPER_MODE_PLACEHOLDER_LENGTH_CM
      return
    }

    const leftOffScreen = startX < 0

    if (leftOffScreen) {
      leftLabel.container.style.display = 'none'
    } else {
      leftLabel.container.style.display = 'block'
      let leftX = startX
      let leftY =
        startY - leftLabel.dimensions.height - tape.dimensions.tapeWidth / 2
      const marginFromEdge = 10
      leftX = Math.max(
        marginFromEdge,
        Math.min(
          leftX,
          screenWidth - leftLabel.dimensions.width - marginFromEdge,
        ),
      )
      leftY = Math.max(marginFromEdge, leftY)
      leftLabel.container.style.left = `${leftX}px`
      leftLabel.container.style.top = `${leftY}px`
    }

    rightLabel.container.style.display = 'block'
    let rightX = endX - rightLabel.dimensions.width
    let rightY =
      endY - rightLabel.dimensions.height - tape.dimensions.tapeWidth / 2
    const marginFromEdge = 10
    rightX = Math.max(
      marginFromEdge,
      Math.min(
        rightX,
        screenWidth - rightLabel.dimensions.width - marginFromEdge,
      ),
    )
    rightY = Math.max(marginFromEdge, rightY)
    rightLabel.container.style.left = `${rightX}px`
    rightLabel.container.style.top = `${rightY}px`

    updateDiagonalColors()
    updateDiagonalTapeComponent()

    if (typeof positionRulerShiftButton === 'function') {
      positionRulerShiftButton()
    }
  }

  // ─── Handle hover effects ────────────────────────────────────────────────

  tape.elements.leftHandle.addEventListener('mouseenter', () => {
    tape.elements.leftVisualLine.style.boxShadow = '0 0 12px rgba(0, 0, 0, 0.6)'
  })
  tape.elements.leftHandle.addEventListener('mouseleave', () => {
    updateDiagonalColors()
  })
  tape.elements.rightHandle.addEventListener('mouseenter', () => {
    tape.elements.rightVisualLine.style.boxShadow =
      '0 0 12px rgba(0, 0, 0, 0.6)'
  })
  tape.elements.rightHandle.addEventListener('mouseleave', () => {
    updateDiagonalColors()
  })

  // ─── Label dimension fix-up after DOM insertion ──────────────────────────

  let labelDimensionTimer = null
  const fixLabelDimensions = () => {
    labelDimensionTimer = setTimeout(() => {
      const leftRect = leftLabel.container
        .querySelector('div')
        .getBoundingClientRect()
      leftLabel.dimensions = { width: leftRect.width, height: leftRect.height }
      const rightRect = rightLabel.container
        .querySelector('div')
        .getBoundingClientRect()
      rightLabel.dimensions = {
        width: rightRect.width,
        height: rightRect.height,
      }
      updateDiagonalLabels()
    }, 10)
  }

  // ─── Drag state & handlers ───────────────────────────────────────────────

  let leftDragging = false
  let rightDragging = false
  let bodyDragging = false
  let dragStartMouseX = 0
  let dragStartMouseY = 0
  let dragStartTapeStartX = 0
  let dragStartTapeStartY = 0
  let dragStartTapeEndX = 0
  let dragStartTapeEndY = 0

  /** Constrain and apply new endpoint positions, then refresh visuals. */
  const updateRulerEndpoints = (
    newStartX,
    newStartY,
    newEndX,
    newEndY,
    allowStartOffScreen = false,
  ) => {
    const minY = tape.dimensions.tapeWidth
    const maxY = screenHeight - RULER_Y_MAX_MARGIN_PX

    const constrainYToScreen = y => Math.max(minY, Math.min(maxY, y))
    const constrainXToScreen = x => Math.max(0, Math.min(screenWidth, x))

    const constrainedEndX = constrainXToScreen(newEndX)
    const constrainedEndY = constrainYToScreen(newEndY)

    let constrainedStartX
    if (allowStartOffScreen) {
      constrainedStartX = newStartX
    } else {
      constrainedStartX = constrainXToScreen(newStartX)
    }
    const constrainedStartY = constrainYToScreen(newStartY)

    const distance = Math.abs(constrainedEndX - constrainedStartX)
    if (!allowStartOffScreen && distance < MIN_RULER_DISTANCE_PX) {
      return
    }

    startX = constrainedStartX
    startY = constrainedStartY
    endX = constrainedEndX
    endY = constrainedEndY

    positionRulerShiftButton()
    updateDiagonalLabels()
  }

  tape.elements.leftHandle.addEventListener('mousedown', e => {
    cancelRulerShiftAnimation()
    leftDragging = true
    document.body.style.cursor = 'move'
    e.preventDefault()
    e.stopPropagation()
  })

  tape.elements.rightHandle.addEventListener('mousedown', e => {
    cancelRulerShiftAnimation()
    rightDragging = true
    document.body.style.cursor = 'move'
    e.preventDefault()
    e.stopPropagation()
  })

  tape.elements.diagonalTape.style.pointerEvents = 'auto'
  tape.elements.diagonalTape.style.cursor = 'move'
  tape.elements.diagonalTape.addEventListener('mousedown', e => {
    cancelRulerShiftAnimation()
    bodyDragging = true
    dragStartMouseX = e.clientX
    dragStartMouseY = e.clientY
    dragStartTapeStartX = startX
    dragStartTapeStartY = startY
    dragStartTapeEndX = endX
    dragStartTapeEndY = endY
    document.body.style.cursor = 'move'
    e.preventDefault()
  })

  const onMouseMove = e => {
    if (leftDragging) {
      const mouseX = e.clientX
      const currentY = startY
      updateRulerEndpoints(mouseX, currentY, endX, endY, true)
    } else if (rightDragging) {
      const mouseX = e.clientX
      const currentY = endY
      const isStartOffScreen = startX < 0 || startX > screenWidth
      updateRulerEndpoints(startX, startY, mouseX, currentY, isStartOffScreen)
    } else if (bodyDragging) {
      const deltaX = e.clientX - dragStartMouseX
      const deltaY = e.clientY - dragStartMouseY

      const newStartX = dragStartTapeStartX + deltaX
      const newEndX = dragStartTapeEndX + deltaX
      const newStartY = dragStartTapeStartY + deltaY
      const newEndY = dragStartTapeEndY + deltaY

      const constrainedEndX = Math.max(0, Math.min(screenWidth, newEndX))

      // Pre-calculate button position for smooth tracking
      const minY = tape.dimensions.tapeWidth
      const maxY = screenHeight - RULER_Y_MAX_MARGIN_PX
      const constrainedNewStartY = Math.max(minY, Math.min(maxY, newStartY))
      const constrainedNewEndY = Math.max(minY, Math.min(maxY, newEndY))
      const newRulerY = (constrainedNewStartY + constrainedNewEndY) / 2
      const newRulerTopEdge = newRulerY - tape.dimensions.tapeWidth / 2
      const newButtonBottomEdge =
        newRulerTopEdge - RULER_SHIFT_GAP_ABOVE_RULER_PX
      const newButtonY = newButtonBottomEdge - RULER_SHIFT_BUTTON_SIZE_PX
      rulerShiftButton.style.top = `${newButtonY}px`

      if (constrainedEndX !== newEndX) {
        const allowedDeltaX = constrainedEndX - dragStartTapeEndX
        const adjustedStartX = dragStartTapeStartX + allowedDeltaX
        const adjustedEndX = dragStartTapeEndX + allowedDeltaX
        updateRulerEndpoints(
          adjustedStartX,
          newStartY,
          adjustedEndX,
          newEndY,
          true,
        )
      } else {
        updateRulerEndpoints(newStartX, newStartY, newEndX, newEndY, true)
      }
    }
  }

  const onMouseUp = () => {
    if (leftDragging || rightDragging || bodyDragging) {
      leftDragging = false
      rightDragging = false
      bodyDragging = false
      document.body.style.cursor = ''
    }
  }

  // ─── Keyboard arrow handling ─────────────────────────────────────────────

  let arrowKeyDown = false
  let arrowIntervalFunction = null
  let currentArrowKey = null
  let intervalCount = 0

  const arrowDownFunction = e => {
    const currentPage = getCurrentPage()
    if (currentPage !== 2 && currentPage !== TUBE_CHECK_PAGE) return

    e.preventDefault()

    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key))
      return

    // Tube-check page arrow keys are not handled by this component
    if (currentPage === TUBE_CHECK_PAGE) return

    cancelRulerShiftAnimation()

    if (arrowKeyDown) return
    arrowKeyDown = true
    currentArrowKey = e.key
    intervalCount = 0

    if (arrowIntervalFunction) {
      clearInterval(arrowIntervalFunction)
    }

    const calculateStepSize = () => {
      if (intervalCount > ARROW_KEY_FAST_THRESHOLD_COUNT) {
        return ARROW_KEY_FAST_STEP_MM * pxPerMm
      }
      return ARROW_KEY_TAP_STEP_MM * pxPerMm
    }

    arrowIntervalFunction = setInterval(() => {
      intervalCount++
      const moveAmount = calculateStepSize()
      const isStartOffScreen = startX < 0 || startX > screenWidth
      const currentTapeY = startY

      if (currentArrowKey === 'ArrowLeft') {
        const newEndX = endX - moveAmount
        updateRulerEndpoints(
          startX,
          currentTapeY,
          newEndX,
          currentTapeY,
          isStartOffScreen,
        )
      } else if (currentArrowKey === 'ArrowRight') {
        const newEndX = endX + moveAmount
        updateRulerEndpoints(
          startX,
          currentTapeY,
          newEndX,
          currentTapeY,
          isStartOffScreen,
        )
      }
    }, ARROW_KEY_INTERVAL_MS)
  }

  const arrowUpFunction = e => {
    const currentPage = getCurrentPage()
    if (currentPage !== 2 && currentPage !== TUBE_CHECK_PAGE) return

    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key))
      return

    if (currentArrowKey !== e.key) return

    arrowKeyDown = false
    currentArrowKey = null

    if (arrowIntervalFunction) {
      clearInterval(arrowIntervalFunction)
      arrowIntervalFunction = null
    }
  }

  const handleArrowKeys = e => {
    if (e.type === 'keydown') {
      arrowDownFunction(e)
    } else if (e.type === 'keyup') {
      arrowUpFunction(e)
    }
  }

  // ─── Resize handler ─────────────────────────────────────────────────────

  const updateDiagonalTapeOnResize = () => {
    const currentStartProportionX = startX / screenWidth
    const currentEndProportionX = endX / screenWidth
    const currentStartProportionY = startY / screenHeight
    const currentEndProportionY = endY / screenHeight

    screenWidth = window.innerWidth
    screenHeight = window.innerHeight

    startX = currentStartProportionX * screenWidth
    startY = currentStartProportionY * screenHeight
    endX = currentEndProportionX * screenWidth
    endY = currentEndProportionY * screenHeight

    updateDiagonalLabels()
    positionRulerShiftButton()
  }

  // ─── Event registration tracking ────────────────────────────────────────

  let mounted = false

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Append all tape DOM elements to the given container and attach global
   * event listeners (mousemove, mouseup, keydown, keyup, resize).
   * @param {HTMLElement} container
   */
  function mount(container) {
    if (mounted) return
    mounted = true

    container.appendChild(tape.container)
    container.appendChild(leftLabel.container)
    container.appendChild(rightLabel.container)
    container.appendChild(rulerShiftButton)

    fixLabelDimensions()
    updateDiagonalLabels()

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    document.addEventListener('keydown', handleArrowKeys)
    document.addEventListener('keyup', handleArrowKeys)
    window.addEventListener('resize', updateDiagonalTapeOnResize)
    window.addEventListener('beforeunload', cleanupKeyboard)

    debugLog('rulerTape', 'mounted')
  }

  /**
   * Return the current measured object length in centimetres.
   * @returns {number}
   */
  function getObjectLengthCm() {
    const distance = getDistance(startX, startY, endX, endY)
    return distance / pxPerMm / 10
  }

  /**
   * Reset the tape to its initial position for a new measurement pass.
   */
  function resetForNewMeasurement() {
    startX = leftMarginPx
    endX = leftMarginPx + initialRulerLengthPx

    updateDiagonalLabels()

    if (!showLength) {
      intervalCmCurrent = computeNewIntervalCm()
      updateRulerMarkings()
    }

    debugLog('rulerTape', 'reset for new measurement')
  }

  /**
   * Switch the display unit ('inches' or 'cm').
   * @param {string} unit
   */
  function setUnit(unit) {
    selectedUnit = unit
    updateDiagonalTapeComponent()
  }

  /**
   * Return the current endpoint coordinates.
   * @returns {{ startX: number, startY: number, endX: number, endY: number }}
   */
  function getEndpoints() {
    return { startX, startY, endX, endY }
  }

  /** Remove keyboard interval if one is still running. */
  function cleanupKeyboard() {
    document.removeEventListener('keydown', handleArrowKeys)
    document.removeEventListener('keyup', handleArrowKeys)
    if (arrowIntervalFunction) {
      clearInterval(arrowIntervalFunction)
      arrowIntervalFunction = null
    }
  }

  /**
   * Fully tear down the component: remove DOM nodes, detach all listeners,
   * cancel any running animations.
   */
  function cleanup() {
    if (!mounted) return
    mounted = false

    cancelRulerShiftAnimation()
    cleanupKeyboard()

    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
    window.removeEventListener('resize', updateDiagonalTapeOnResize)
    window.removeEventListener('beforeunload', cleanupKeyboard)

    if (labelDimensionTimer) {
      clearTimeout(labelDimensionTimer)
      labelDimensionTimer = null
    }

    tape.container.remove()
    leftLabel.container.remove()
    rightLabel.container.remove()
    rulerShiftButton.remove()

    const pulseStyle = document.getElementById(DOM_ID.RULER_SHIFT_PULSE_STYLE)
    if (pulseStyle) pulseStyle.remove()

    debugLog('rulerTape', 'cleaned up')
  }

  /**
   * Show the ruler-shift button.
   */
  function showRulerShiftButton() {
    positionRulerShiftButton()
    rulerShiftButton.style.display = 'flex'
  }

  /**
   * Hide the ruler-shift button.
   */
  function hideRulerShiftButton() {
    rulerShiftButton.style.display = 'none'
  }

  /** Force a new random interval and redraw markings. */
  function resetIntervalCm() {
    intervalCmCurrent = computeNewIntervalCm()
    updateRulerMarkings()
  }

  return {
    mount,
    getObjectLengthCm,
    resetForNewMeasurement,
    setUnit,
    getEndpoints,
    cleanup,
    showRulerShiftButton,
    hideRulerShiftButton,
    updateDiagonalLabels,
    cancelRulerShiftAnimation,
    computeNewIntervalCm,
    resetIntervalCm,
    tape,
    elements: {
      ...tape.elements,
      leftLabel,
      rightLabel,
      rulerShiftButton,
    },
  }
}
