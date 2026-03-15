import { env } from '../core'
import {
  constructInstructions,
  enforceFullscreenOnSpacePress,
  fitInstructionPanelToViewport,
} from '../components/utils'
import { phrases } from '../i18n/schema'
import Swal from 'sweetalert2'
import { swalInfoOptions } from '../components/swalOptions'
import { processInlineFormatting } from '../distance/markdownInstructionParser'
import { setDefaultVideoPosition } from '../components/video'
import { setUpEasyEyesKeypadHandler } from '../extensions/keypadHandler'
import { showPopup } from '../components/popup'
import {
  createStepInstructionsUI,
  renderStepInstructions,
} from '../distance/stepByStepInstructionHelps'
import { parseInstructions } from '../distance/instructionParserAdapter'
import { resolveInstructionMediaUrl } from '../distance/instructionMediaCache'
import { test_assetMap } from '../distance/assetMap'
import {
  createFixationCrossOnVideo,
  removeFixationCrossFromVideo,
} from './videoHelpers'
import { setupSizeCheckFontAdjustment } from './fontSizeAdjustment'
import { getLocalizedUnit } from './distanceCheckUI'

const soundModule = require('../components/sound')
const stampOfApprovalSound = soundModule.stampOfApprovalSound

const createYellowTapeRectangle = RC => {
  // Get the screen's pixels per millimeter (for accurate physical placement)
  const ppi = RC.screenPpi.value
  const pxPerMm = ppi / 25.4 // Note: 25.4 mm = 1 inch, so pxPerMm = ppi / 25.4

  // The left vertical line is always 5mm from the left edge of the screen
  let leftLinePx = Math.round(5 * pxPerMm) // 5mm from left
  let screenWidth = window.innerWidth

  // The right vertical line starts at 2/3 of the screen width
  let rightLinePx = Math.round((screenWidth * 2) / 3)

  // Calculate the vertical position for all elements (bottom of screen with margin)
  let screenCenterY = window.innerHeight - 65 // 100px margin from bottom

  // Create the main container
  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.top = '0'
  container.style.left = '0'
  container.style.width = '100vw'
  container.style.height = '100vh'
  container.style.userSelect = 'none'
  container.style.overflow = 'hidden'
  container.style.zIndex = '1000'
  // Allow clicks to pass through to stepper arrows underneath
  container.style.pointerEvents = 'none'

  // Calculate 3/4 inch in pixels for line height
  const threeQuarterInchesInPx = Math.round(0.75 * ppi)
  const lineThickness = 3 // Original thickness for horizontal lines
  const verticalLineThickness = 6 // Thicker vertical lines only

  // Style for both vertical lines - use translateX to center them at their position
  const verticalLineStyle = `
    position: absolute; 
    top: ${screenCenterY}px; 
    transform: translate(-50%, -50%); 
    height: ${threeQuarterInchesInPx}px; 
    width: ${verticalLineThickness}px; 
    background: rgb(0, 0, 0); 
    border-radius: 2px; 
    z-index: 1;
    pointer-events: auto;
  `

  // Left vertical line
  const leftLine = document.createElement('div')
  leftLine.style =
    verticalLineStyle + `left: ${leftLinePx}px; cursor: ew-resize;`
  container.appendChild(leftLine)

  // Right vertical line
  const rightLine = document.createElement('div')
  rightLine.style =
    verticalLineStyle + `left: ${rightLinePx}px; cursor: ew-resize;`
  container.appendChild(rightLine)

  // Rectangle background fill
  const rectangleBackground = document.createElement('div')
  rectangleBackground.style.position = 'absolute'
  rectangleBackground.style.left = `${leftLinePx}px`
  rectangleBackground.style.width = `${rightLinePx - leftLinePx + lineThickness}px`
  rectangleBackground.style.top = `calc(${screenCenterY}px - ${threeQuarterInchesInPx / 2}px)`
  rectangleBackground.style.height = `${threeQuarterInchesInPx}px`
  rectangleBackground.style.background = 'rgba(255, 221, 51, 0.95)'
  rectangleBackground.style.borderRadius = '2px'
  rectangleBackground.style.zIndex = '0'
  container.appendChild(rectangleBackground)

  // Top horizontal line
  const topHorizontalLine = document.createElement('div')
  topHorizontalLine.style.position = 'absolute'
  topHorizontalLine.style.left = `${leftLinePx}px`
  topHorizontalLine.style.width = `${rightLinePx - leftLinePx + lineThickness}px`
  topHorizontalLine.style.top = `calc(${screenCenterY}px - ${threeQuarterInchesInPx / 2}px)`
  topHorizontalLine.style.height = `${lineThickness}px`
  topHorizontalLine.style.background = 'rgb(0, 0, 0)'
  topHorizontalLine.style.borderRadius = '2px'
  topHorizontalLine.style.zIndex = '1'
  container.appendChild(topHorizontalLine)

  // Bottom horizontal line
  const bottomHorizontalLine = document.createElement('div')
  bottomHorizontalLine.style.position = 'absolute'
  bottomHorizontalLine.style.left = `${leftLinePx}px`
  bottomHorizontalLine.style.width = `${rightLinePx - leftLinePx + lineThickness}px`
  bottomHorizontalLine.style.top = `calc(${screenCenterY}px + ${threeQuarterInchesInPx / 2}px - ${lineThickness}px)`
  bottomHorizontalLine.style.height = `${lineThickness}px`
  bottomHorizontalLine.style.background = 'rgb(0, 0, 0)'
  bottomHorizontalLine.style.borderRadius = '2px'
  bottomHorizontalLine.style.zIndex = '1'
  container.appendChild(bottomHorizontalLine)

  // Function to update rectangle when lines move
  function updateRectangleLines() {
    rectangleBackground.style.left = `${leftLinePx}px`
    rectangleBackground.style.width = `${rightLinePx - leftLinePx + lineThickness}px`
    topHorizontalLine.style.left = `${leftLinePx}px`
    topHorizontalLine.style.width = `${rightLinePx - leftLinePx + lineThickness}px`
    bottomHorizontalLine.style.left = `${leftLinePx}px`
    bottomHorizontalLine.style.width = `${rightLinePx - leftLinePx + lineThickness}px`
  }

  // Function to update all positions when window is resized
  function updatePositionsOnResize() {
    const newScreenWidth = window.innerWidth
    const newScreenCenterY = window.innerHeight - 65

    // Update screen dimensions
    screenWidth = newScreenWidth
    screenCenterY = newScreenCenterY

    // Recalculate right line position to maintain proportional distance
    const proportion = rightLinePx / (screenWidth || 1) // Avoid division by zero
    rightLinePx = Math.round(newScreenWidth * proportion)

    // Ensure right line doesn't go beyond screen bounds (line is centered)
    const minX = leftLinePx + 10
    const maxX = newScreenWidth
    rightLinePx = Math.max(minX, Math.min(rightLinePx, maxX))

    // Update all vertical positions
    const newVerticalLineStyle = `
      position: absolute; 
      top: ${screenCenterY}px; 
      transform: translate(-50%, -50%); 
      height: ${threeQuarterInchesInPx}px; 
      width: ${verticalLineThickness}px; 
      background: rgb(0, 0, 0); 
      border-radius: 2px; 
      z-index: 1;
      pointer-events: auto;
    `

    // Update line positions
    leftLine.style =
      newVerticalLineStyle + `left: ${leftLinePx}px; cursor: ew-resize;`
    rightLine.style =
      newVerticalLineStyle + `left: ${rightLinePx}px; cursor: ew-resize;`

    // Update rectangle background position and size
    rectangleBackground.style.left = `${leftLinePx}px`
    rectangleBackground.style.width = `${rightLinePx - leftLinePx + lineThickness}px`
    rectangleBackground.style.top = `calc(${screenCenterY}px - ${threeQuarterInchesInPx / 2}px)`
    rectangleBackground.style.height = `${threeQuarterInchesInPx}px`

    // Update horizontal lines
    topHorizontalLine.style.left = `${leftLinePx}px`
    topHorizontalLine.style.width = `${rightLinePx - leftLinePx + lineThickness}px`
    topHorizontalLine.style.top = `calc(${screenCenterY}px - ${threeQuarterInchesInPx / 2}px)`

    bottomHorizontalLine.style.left = `${leftLinePx}px`
    bottomHorizontalLine.style.width = `${rightLinePx - leftLinePx + lineThickness}px`
    bottomHorizontalLine.style.top = `calc(${screenCenterY}px + ${threeQuarterInchesInPx / 2}px - ${lineThickness}px)`
  }

  // Dragging functionality for right line
  let dragging = false
  rightLine.addEventListener('mousedown', e => {
    dragging = true
    document.body.style.cursor = 'ew-resize'
    e.preventDefault()
  })

  const mouseMoveHandler = e => {
    if (!dragging) return
    let x = e.clientX
    // Line is now centered at position, so can reach screenWidth
    x = Math.max(leftLinePx + 10, Math.min(x, screenWidth))
    rightLinePx = x
    rightLine.style.left = `${rightLinePx}px`
    updateRectangleLines()
  }

  const mouseUpHandler = () => {
    dragging = false
    document.body.style.cursor = ''
  }

  window.addEventListener('mousemove', mouseMoveHandler)
  window.addEventListener('mouseup', mouseUpHandler)

  // Dragging functionality for left line
  let leftDragging = false
  leftLine.addEventListener('mousedown', e => {
    leftDragging = true
    document.body.style.cursor = 'ew-resize'
    e.preventDefault()
  })

  const leftMouseMoveHandler = e => {
    if (!leftDragging) return
    let x = e.clientX
    // Line is now centered at position, so can reach x=0
    x = Math.max(0, Math.min(x, rightLinePx - 2))
    leftLinePx = x
    leftLine.style.left = `${leftLinePx}px`
    updateRectangleLines()
  }

  const leftMouseUpHandler = () => {
    leftDragging = false
    document.body.style.cursor = ''
  }

  window.addEventListener('mousemove', leftMouseMoveHandler)
  window.addEventListener('mouseup', leftMouseUpHandler)

  // Keyboard handling for arrow keys
  let arrowKeyDown = false
  let arrowIntervalFunction = null
  let currentArrowKey = null

  // Dynamic step size variables
  let intervalCount = 0 // Track how many intervals have fired

  const arrowDownFunction = e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    if (arrowKeyDown) return

    arrowKeyDown = true
    currentArrowKey = e.key
    intervalCount = 0 // Reset counter for new key press

    if (arrowIntervalFunction) {
      clearInterval(arrowIntervalFunction)
    }

    // Calculate dynamic step size based on whether key is being held
    const calculateStepSize = () => {
      // If held for more than 3 intervals (~150ms), switch to fast movement
      if (intervalCount > 3) {
        return 5 * pxPerMm // 5mm for held keys (fast approach)
      }
      return 0.5 * pxPerMm // 0.5mm for taps (precise adjustment)
    }

    arrowIntervalFunction = setInterval(() => {
      intervalCount++
      const moveAmount = calculateStepSize()
      if (currentArrowKey === 'ArrowLeft') {
        rightLinePx -= moveAmount
        helpMoveRightLine()
      } else if (currentArrowKey === 'ArrowRight') {
        rightLinePx += moveAmount
        helpMoveRightLine()
      }
    }, 50)
  }

  const arrowUpFunction = e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    if (currentArrowKey !== e.key) return

    arrowKeyDown = false
    currentArrowKey = null

    if (arrowIntervalFunction) {
      clearInterval(arrowIntervalFunction)
      arrowIntervalFunction = null
    }
  }

  const helpMoveRightLine = () => {
    const minX = leftLinePx + 10
    const maxX = screenWidth
    rightLinePx = Math.max(minX, Math.min(rightLinePx, maxX))
    rightLine.style.left = `${rightLinePx}px`
    updateRectangleLines()
  }

  document.addEventListener('keydown', arrowDownFunction)
  document.addEventListener('keyup', arrowUpFunction)

  // Prevent Tab key from moving focus during checkSize measurement
  // This ensures arrow keys continue to control the yellow tape
  const preventTabHandler = e => {
    if (e.key === 'Tab') {
      e.preventDefault()
    }
  }
  document.addEventListener('keydown', preventTabHandler)

  // Add window resize event listener to handle fullscreen exit and window size changes
  window.addEventListener('resize', updatePositionsOnResize)

  // Cleanup function
  const cleanup = () => {
    window.removeEventListener('mousemove', mouseMoveHandler)
    window.removeEventListener('mouseup', mouseUpHandler)
    window.removeEventListener('mousemove', leftMouseMoveHandler)
    window.removeEventListener('mouseup', leftMouseUpHandler)
    window.removeEventListener('resize', updatePositionsOnResize)
    document.removeEventListener('keydown', arrowDownFunction)
    document.removeEventListener('keyup', arrowUpFunction)
    document.removeEventListener('keydown', preventTabHandler)
    if (arrowIntervalFunction) {
      clearInterval(arrowIntervalFunction)
    }
    if (container.parentNode) {
      container.parentNode.removeChild(container)
    }
  }

  // Function to get current length in cm
  const getCurrentLengthPx = () => {
    const objectLengthPx = rightLinePx - leftLinePx
    return objectLengthPx
  }

  return {
    container,
    cleanup,
    getCurrentLengthPx,
  }
}

// Function to create the length display div (similar to viewing distance but for top half of right side)
const createLengthDisplayDiv = RC => {
  // Check if the div already exists
  if (document.getElementById('length-display-div')) {
    console.warn('Length display div already exists.')
    return
  }

  const ppi = RC.screenPpi.value
  const threeQuarterInchesInPx = Math.round(0.75 * ppi)
  const lengthContainer = document.createElement('div')
  lengthContainer.id = 'calibration-checkSize-lengthDisplay-container'
  lengthContainer.className = 'calibration-checkSize-lengthDisplay-container'
  lengthContainer.style.display = 'inline-flex'
  lengthContainer.style.alignItems = 'baseline'
  lengthContainer.style.justifyContent = 'flex-start'
  lengthContainer.style.position = 'absolute'
  //right above the yellow tape rectangle
  let screenCenterY = window.innerHeight - 65 // Same as yellow tape positioning
  lengthContainer.style.top = `${screenCenterY - threeQuarterInchesInPx / 2 - 187.5}px`
  lengthContainer.style.transform = 'translate(-50%)'
  lengthContainer.style.width = '100%'
  lengthContainer.style.height = '175px' // Halved from 350px
  lengthContainer.style.marginLeft = '25px'

  // Create the input element for the length value (single string with unit)
  const lengthDisplayInput = document.createElement('input')
  lengthDisplayInput.id = 'length-display-input'
  lengthDisplayInput.className = 'calibration-checkSize-lengthDisplay'
  lengthDisplayInput.type = 'text'
  lengthDisplayInput.style.border = 'none'
  lengthDisplayInput.style.background = 'transparent'
  lengthDisplayInput.style.textAlign = 'left'
  lengthDisplayInput.style.width = 'auto'
  lengthDisplayInput.style.outline = 'none'
  lengthDisplayInput.style.marginRight = '0'
  lengthDisplayInput.style.marginLeft = '0'
  lengthDisplayInput.style.padding = '0'

  // Append to the container
  lengthContainer.appendChild(lengthDisplayInput)
  document.body.appendChild(lengthContainer)

  // Function to update position on window resize
  window.updateLengthDisplayPosition = () => {
    const newScreenCenterY = window.innerHeight - 65
    lengthContainer.style.top = `${newScreenCenterY - threeQuarterInchesInPx / 2 - 187.5}px`
  }

  // Add resize listener for this specific element
  window.addEventListener('resize', window.updateLengthDisplayPosition)
}

const removeLengthDisplayDiv = () => {
  const lengthDisplayInput = document.getElementById('length-display-input')
  const unitsDiv = document.getElementById(
    'calibration-checkSize-lengthDisplay-units',
  )
  const lengthContainer = document.getElementById(
    'calibration-checkSize-lengthDisplay-container',
  )

  // Remove resize listener if it exists
  if (window.updateLengthDisplayPosition) {
    window.removeEventListener('resize', window.updateLengthDisplayPosition)
    delete window.updateLengthDisplayPosition
  }

  if (lengthDisplayInput) {
    lengthDisplayInput.remove()
  }

  if (unitsDiv) {
    unitsDiv.remove()
  }

  if (lengthContainer) {
    lengthContainer.remove()
  }
}

const adjustLengthFontSize = lengthDiv => {
  const container = lengthDiv.parentElement
  const containerWidth = container.offsetWidth
  const containerHeight = container.offsetHeight
  let fontSize = containerWidth
  lengthDiv.style.fontSize = `${fontSize}px`

  // Adjust dynamically to prevent overflow in width or height
  while (
    (lengthDiv.scrollWidth > containerWidth ||
      lengthDiv.offsetHeight > containerHeight) &&
    fontSize > 10
  ) {
    fontSize -= 1
    lengthDiv.style.fontSize = `${fontSize}px`
  }
}

const updateLengthDisplayDiv = (length, units) => {
  const lengthDisplayInput = document.getElementById('length-display-input')

  if (!lengthDisplayInput) {
    console.warn(
      'Length display div does not exist. Call createLengthDisplayDiv() first.',
    )
    return
  }

  lengthDisplayInput.value = `${length} ${units}`
  adjustLengthFontSize(lengthDisplayInput)
}

// Helper function to check if two values are within a percentage of each other
export const areValuesWithinPercent = (val1, val2, percent) => {
  if (val1 === 0 && val2 === 0) return true
  const larger = Math.max(Math.abs(val1), Math.abs(val2))
  const diff = Math.abs(val1 - val2)
  return diff / larger <= percent / 100
}

export const checkSize = async (
  RC,
  calibrateDistanceCheckLengthCm = [],
  calibrateDistanceChecking = undefined,
  stepperHistory = 1,
  calibrateScreenSizeAllowedRatio = 1.1,
) => {
  // Hide video during checkSize (yellow tape measurement)
  RC.showVideo(false)

  // Track space bar listeners for proper cleanup
  const checkSizeListeners = []

  // Use the already calculated values from screen calibration
  const pxPerCm = RC.screenPpi.value / 2.54 // pixels per cm from calibrated PPI (Note: 2.54 cm = 1 inch)
  const screenWidthCm = RC.screenWidthCm.value // already calculated during screen calibration
  const rulerLengthCm = RC.equipment?.value?.length
  const maxLengthCm = Math.min(rulerLengthCm, screenWidthCm)

  // Initialize arrays to store length data (similar to distance tracking)
  RC.calibrateTrackLengthMeasuredCm = []
  RC.calibrateTrackLengthRequestedCm = []
  RC.calibrateDistancePxPerCm = []

  // Tracking arrays for checkSize (following distance calibration pattern)
  RC.checkSizeAcceptedLength = []
  RC.checkSizeAcceptedRatioLength = []
  RC.checkSizeRejectedLength = []
  RC.checkSizeRejectedRatioLength = []
  RC.checkSizeHistoryLength = []

  // Initialize RC.sizeCheckJSON immediately so it always exists (even on early return)
  RC.sizeCheckJSON = {
    _calibrateScreenSizeAllowedRatio: calibrateScreenSizeAllowedRatio,
    calibrationPxPerCm: parseFloat(Number(pxPerCm).toFixed(1)),
    screenWidthCm: screenWidthCm,
    rulerUnit: RC.equipment?.value?.unit,
    pxPerCm: [],
    lengthMeasuredPx: [],
    lengthRequestedCm: [],
    acceptedLength: [],
    acceptedRatioLength: [],
    rejectedLength: [],
    rejectedRatioLength: [],
    historyLength: [],
  }

  // Process calibrateDistanceCheckLengthCm the same way as calibrateDistanceCheckCm
  let processedLengthCm = calibrateDistanceCheckLengthCm.map(cm =>
    RC.equipment?.value?.unit === 'inches'
      ? Math.floor(Number(cm) / 2.54)
      : Math.floor(Number(cm)),
  )

  // Filter out invalid values (non-positive)
  processedLengthCm = processedLengthCm.filter(cm => cm > 0)

  if (processedLengthCm.length === 0) {
    console.warn('No valid lengths to check.')
    return
  }

  // If the largest requested size exceeds screen width, scale all sizes down
  // so that the largest equals 90% of the screen width
  const maxRequestedCm = Math.max(...processedLengthCm)
  const targetMaxCm = screenWidthCm * 0.9 // 90% of screen width

  if (maxRequestedCm > screenWidthCm) {
    const scaleFactor = targetMaxCm / maxRequestedCm
    processedLengthCm = processedLengthCm.map(cm =>
      Math.floor(cm * scaleFactor),
    )
    console.log(
      `Requested sizes scaled down by factor ${scaleFactor.toFixed(3)} to fit screen. Original max: ${maxRequestedCm} cm, New max: ${Math.max(...processedLengthCm)} cm`,
    )
  }

  // Create the length display div
  createLengthDisplayDiv(RC)

  // Shared stepper state for RC_SetLength instructions
  const lengthStepperState = {
    ui: null,
    model: null,
    stepIndex: 0,
    navHandler: null,
  }

  const checkSizePhraseKey = 'RC_SetLength'
  let _showingReadFirstPopup = false

  // Loop through each length value to create dynamic pages
  for (let i = 0; i < processedLengthCm.length; i++) {
    const cm = processedLengthCm[i]
    const index = i + 1

    // Update the length display with the current required length
    updateLengthDisplayDiv(cm, getLocalizedUnit(RC.equipment?.value?.unit, RC.L))

    // Create and update instruction content
    const updateInstructionText = (
      currentLength,
      yellowTapeRef = null,
      resetStepper = false,
    ) => {
      const instructionTitle = phrases.RC_SetLengthTitle[RC.language.value]
        .replace('[[N11]]', index)
        .replace('[[N22]]', processedLengthCm.length)

      const instructionBodyText = phrases.RC_SetLength[RC.language.value]
        .replace('[[N33]]', currentLength)
        .replace('[[UUU]]', RC.equipment?.value?.unit)

      if (!document.getElementById('instruction-title')) {
        const html = constructInstructions(
          instructionTitle,
          '',
          false,
          'bodyText',
          'left',
        )
        RC._replaceBackground(html)

        // Reset stepper state when the instruction container is replaced
        if (lengthStepperState.navHandler) {
          document.removeEventListener('keydown', lengthStepperState.navHandler)
          lengthStepperState.navHandler = null
        }
        lengthStepperState.ui = null
        lengthStepperState.model = null

        const instructionElement = document.querySelector(
          '.calibration-instruction',
        )

        // Add RTL class if language is RTL
        if (RC.LD === RC._CONST.RTL && instructionElement) {
          instructionElement.classList.add('rtl')
        }

        const video = document.getElementById('webgazerVideoContainer')
        if (instructionElement && video) {
          const videoRect = video.getBoundingClientRect()
          const screenWidth = window.innerWidth
          const videoLeftEdge = (screenWidth - videoRect.width) / 2
          const leftColumnMaxPx = window.innerWidth * 0.495
          // Give instruction column barely under half the screen to avoid occlusion with right-side elements
          instructionElement.style.width = '49.5vw'
          instructionElement.style.minWidth = '49.5vw'
          instructionElement.style.maxWidth = `${Math.max(videoLeftEdge - 3, leftColumnMaxPx)}px`
        }

        // Re-append yellow tape if it exists after background replacement
        if (
          yellowTapeRef &&
          yellowTapeRef.container &&
          yellowTapeRef.container.parentNode !== RC.background
        ) {
          RC.background.appendChild(yellowTapeRef.container)
        }
      }

      const titleElement = document.getElementById('instruction-title')
      if (titleElement) titleElement.innerHTML = instructionTitle

      // Ensure a body container exists (constructInstructions omits it when body is empty)
      let instructionBody = document.getElementById('instruction-body')
      if (!instructionBody) {
        const container = document.querySelector('.calibration-instruction')
        if (container) {
          instructionBody = document.createElement('div')
          instructionBody.id = 'instruction-body'
          instructionBody.className = 'calibration-description bodyText'
          container.appendChild(instructionBody)
        }
      }

      if (!instructionBody) return

      // Keep title on the left half and place instructions+stepper as a single
      // right-side column directly under the title baseline.
      const placeCheckSizeInstructionColumn = () => {
        const sideInset = RC.LD === RC._CONST.RTL ? 'left' : 'right'
        const oppositeSideInset = RC.LD === RC._CONST.RTL ? 'right' : 'left'
        const titleEl = document.getElementById('instruction-title')

        if (titleEl) {
          titleEl.style.minWidth = '0'
          titleEl.style.maxWidth = 'calc(50vw - 3rem)'
          titleEl.style.overflowWrap = 'break-word'
          titleEl.style.wordBreak = 'break-word'
        }

        instructionBody.style.position = 'fixed'
        instructionBody.style.top = '7rem'
        instructionBody.style[sideInset] = '0'
        instructionBody.style[oppositeSideInset] = 'auto'
        instructionBody.style.width = '50vw'
        instructionBody.style.minWidth = '50vw'
        instructionBody.style.maxWidth = '50vw'
        instructionBody.style.boxSizing = 'border-box'
        instructionBody.style.margin = '0'
        instructionBody.style.padding = '0.25rem 1.25rem 0.5rem 0.75rem'
        instructionBody.style.display = 'flex'
        instructionBody.style.flexDirection = 'column'
        instructionBody.style.alignItems = 'flex-start'
        instructionBody.style.gap = '0.5rem'
        instructionBody.style.overflowY = 'auto'
        instructionBody.style.overflowX = 'hidden'
        instructionBody.style.pointerEvents = 'auto'

        const titleRect = titleEl?.getBoundingClientRect?.()
        const topOffsetPx =
          titleRect && Number.isFinite(titleRect.bottom)
            ? Math.max(16, Math.ceil(titleRect.bottom + 8))
            : 112
        instructionBody.style.top = `${topOffsetPx}px`
        instructionBody.style.maxHeight = `calc(100vh - ${topOffsetPx + 16}px)`
      }

      placeCheckSizeInstructionColumn()

      // Enable pointer events so stepper arrows are clickable (parent has pointer-events: none)
      instructionBody.style.pointerEvents = 'auto'

      if (!lengthStepperState.ui) {
        instructionBody.innerHTML = ''
        // The right-side instruction column owns its full half-screen width.
        instructionBody.style.width = '100%'
        instructionBody.style.maxWidth = '100%'

        lengthStepperState.ui = createStepInstructionsUI(instructionBody, {
          layout: 'leftOnly',
          leftWidth: '100%',
          leftPaddingStart: '0rem',
          leftPaddingEnd: '0.25rem',
          fontSize: 'inherit',
          lineHeight: 'inherit',
        })
      }

      if (resetStepper) {
        lengthStepperState.stepIndex = 0
      }

      try {
        lengthStepperState.model = parseInstructions(instructionBodyText, {
          assetMap: test_assetMap,
        })
        const maxIdx = (lengthStepperState.model.flatSteps?.length || 1) - 1
        if (lengthStepperState.stepIndex > maxIdx) {
          lengthStepperState.stepIndex = Math.max(0, maxIdx)
        }

        const handlePrev = () => {
          if (lengthStepperState.stepIndex > 0) {
            lengthStepperState.stepIndex--
          }
          // Always re-render to provide visual feedback (even if only one step)
          doRender()
        }

        const handleNext = () => {
          const maxStep = (lengthStepperState.model.flatSteps?.length || 1) - 1
          if (lengthStepperState.stepIndex < maxStep) {
            lengthStepperState.stepIndex++
            if (lengthStepperState.stepIndex >= maxStep) {
              RC._readInstructionPhraseKeys.add(checkSizePhraseKey)
            }
          }
          doRender()
        }

        const doRender = () => {
          placeCheckSizeInstructionColumn()
          renderStepInstructions({
            model: lengthStepperState.model,
            flatIndex: lengthStepperState.stepIndex,
            elements: {
              leftText: lengthStepperState.ui.leftText,
              rightText: lengthStepperState.ui.rightText,
              mediaContainer: lengthStepperState.ui.mediaContainer,
            },
            options: {
              thresholdFraction: 0.4,
              useCurrentSectionOnly: true,
              resolveMediaUrl: resolveInstructionMediaUrl,
              layout: 'leftOnly',
              stepperHistory: stepperHistory,
              readFirstPhraseKey: checkSizePhraseKey,
              readPhraseKeys: RC._readInstructionPhraseKeys,
              onPrev: handlePrev,
              onNext: handleNext,
            },
            lang: RC.language.value,
            langDirection: RC.LD,
            phrases: phrases,
          })
          fitInstructionPanelToViewport()
        }

        doRender()

        if (lengthStepperState.navHandler) {
          document.removeEventListener('keydown', lengthStepperState.navHandler)
          lengthStepperState.navHandler = null
        }

        const navHandler = e => {
          if (!lengthStepperState.model) return
          if (e.key === 'ArrowDown') {
            const maxStep =
              (lengthStepperState.model.flatSteps?.length || 1) - 1
            if (lengthStepperState.stepIndex < maxStep) {
              lengthStepperState.stepIndex++
              if (lengthStepperState.stepIndex >= maxStep) {
                RC._readInstructionPhraseKeys.add(checkSizePhraseKey)
              }
            }
            doRender()
            e.preventDefault()
            e.stopPropagation()
          } else if (e.key === 'ArrowUp') {
            if (lengthStepperState.stepIndex > 0) {
              lengthStepperState.stepIndex--
            }
            // Always re-render to provide visual feedback (even if only one step)
            doRender()
            e.preventDefault()
            e.stopPropagation()
          }
        }
        lengthStepperState.navHandler = navHandler
        document.addEventListener('keydown', lengthStepperState.navHandler)
      } catch (e) {
        instructionBody.innerText = instructionBodyText
      }
    }

    updateInstructionText(cm, null, true)

    const yellowTape = createYellowTapeRectangle(RC)
    RC.background.appendChild(yellowTape.container)

    // Set up adaptive font sizing for size check instructions
    let cleanupFontAdjustment = setupSizeCheckFontAdjustment()

    // Wait for space key press for each page
    await new Promise(resolve => {
      let register = true
      function parseNumeric(valueStr) {
        if (typeof valueStr !== 'string') return NaN
        const match = valueStr.match(/-?\d+(?:\.\d+)?/)
        return match ? Number(match[0]) : NaN
      }

      async function handleMeasurement() {
        if (register) {
          // Enforce fullscreen - if not in fullscreen, force it, wait 4 seconds, and ignore this key press
          const canProceed = await enforceFullscreenOnSpacePress(RC.L, RC)
          if (!canProceed) {
            // Key press flushed - not in fullscreen, now in fullscreen after 4 second wait
            // Wait for a new key press (do nothing, just return)
            return
          }

          //play stamp of approval sound
          if (env !== 'mocha' && stampOfApprovalSound) {
            stampOfApprovalSound()
          }

          register = false
          const lengthDisplayInput = document.getElementById(
            'length-display-input',
          )
          const editedLength = parseNumeric(lengthDisplayInput.value)

          // Store the requested length (and measured length from yellow tape)
          const measuredLength = yellowTape.getCurrentLengthPx()
          RC.calibrateTrackLengthMeasuredCm.push(
            Number(measuredLength.toFixed(1)),
          )
          RC.calibrateTrackLengthRequestedCm.push(
            Number(
              RC.equipment?.value?.unit === 'inches'
                ? (editedLength * 2.54).toFixed(1)
                : editedLength.toFixed(1),
            ),
          )
          const lengthInCm = Number(
            RC.equipment?.value?.unit === 'inches'
              ? (editedLength * 2.54).toFixed(1)
              : editedLength.toFixed(1),
          )
          RC.calibrateDistancePxPerCm.push(
            (Number(measuredLength.toFixed(1)) / lengthInCm).toFixed(1),
          )

          // Track: push to history (every measurement, regardless of accept/reject)
          const currentCheckPxPerCm = parseFloat(
            (Number(measuredLength.toFixed(1)) / lengthInCm).toFixed(1),
          )
          RC.checkSizeHistoryLength.push(currentCheckPxPerCm)

          // Tentatively accept (will pop on rejection, following distance calibration pattern)
          const prevAcceptedCheckLength =
            RC.checkSizeAcceptedLength.length > 0
              ? RC.checkSizeAcceptedLength[
                  RC.checkSizeAcceptedLength.length - 1
                ]
              : null
          RC.checkSizeAcceptedLength.push(currentCheckPxPerCm)
          RC.checkSizeAcceptedRatioLength.push(
            prevAcceptedCheckLength === null
              ? NaN
              : parseFloat(
                  Number(currentCheckPxPerCm / prevAcceptedCheckLength).toFixed(
                    4,
                  ),
                ),
          )

          document.removeEventListener('keyup', keyupListener)
          // Remove from tracking
          const index = checkSizeListeners.indexOf(keyupListener)
          if (index > -1) checkSizeListeners.splice(index, 1)
          removeKeypadHandler()
          cleanupFontAdjustment() // Clean up font adjustment listeners
          yellowTape.cleanup() // Clean up the yellow tape
          if (lengthStepperState.navHandler) {
            document.removeEventListener(
              'keydown',
              lengthStepperState.navHandler,
            )
            lengthStepperState.navHandler = null
          }
          resolve()
        }
      }

      function keyupListener(event) {
        if (event.key === ' ') {
          if (lengthStepperState.model) {
            const maxIdx = (lengthStepperState.model.flatSteps?.length || 1) - 1
            const alreadyRead =
              RC._readInstructionPhraseKeys.has(checkSizePhraseKey)
            if (!alreadyRead && lengthStepperState.stepIndex < maxIdx) {
              if (!_showingReadFirstPopup) {
                _showingReadFirstPopup = true
                ;(async () => {
                  await showPopup(
                    RC,
                    '',
                    phrases.EE_SpaceBarDisabledUntilInstructionsFullyRead?.[
                      RC.language.value
                    ] || '',
                  )
                  _showingReadFirstPopup = false
                })()
              }
              return
            }
            RC._readInstructionPhraseKeys.add(checkSizePhraseKey)
          }
          handleMeasurement()
        }
      }

      // Set up keypad handler for space key (for devices with keypad)
      const removeKeypadHandler = setUpEasyEyesKeypadHandler(
        null,
        RC.keypadHandler,
        value => {
          if (value === 'space') {
            if (lengthStepperState.model) {
              const maxIdx =
                (lengthStepperState.model.flatSteps?.length || 1) - 1
              const alreadyRead =
                RC._readInstructionPhraseKeys.has(checkSizePhraseKey)
              if (!alreadyRead && lengthStepperState.stepIndex < maxIdx) {
                if (!_showingReadFirstPopup) {
                  _showingReadFirstPopup = true
                  ;(async () => {
                    await showPopup(
                      RC,
                      '',
                      phrases.EE_SpaceBarDisabledUntilInstructionsFullyRead?.[
                        RC.language.value
                      ] || '',
                    )
                    _showingReadFirstPopup = false
                  })()
                }
                return
              }
              RC._readInstructionPhraseKeys.add(checkSizePhraseKey)
            }
            handleMeasurement()
          }
        },
        false,
        ['space'],
        RC,
        true,
      )

      const lengthDisplayInput = document.getElementById('length-display-input')
      lengthDisplayInput.addEventListener('input', e => {
        if (e.target.value === '' || e.target.value === '-') return
        const raw = e.target.value
        const numeric = parseNumeric(raw)
        if (isNaN(numeric)) return
        const clamped = Math.max(1, Math.min(100, numeric))
        e.target.value = `${clamped} ${getLocalizedUnit(RC.equipment?.value?.unit, RC.L)}`
        updateInstructionText(clamped, yellowTape)
        adjustLengthFontSize(lengthDisplayInput)
      })

      lengthDisplayInput.addEventListener('blur', e => {
        const raw = e.target.value
        const numeric = parseNumeric(raw)
        if (e.target.value === '' || isNaN(numeric) || numeric < 1) {
          e.target.value = `1 ${getLocalizedUnit(RC.equipment?.value?.unit, RC.L)}`
          updateInstructionText(1, yellowTape)
        } else {
          const clamped = Math.max(1, Math.min(100, numeric))
          e.target.value = `${clamped} ${getLocalizedUnit(RC.equipment?.value?.unit, RC.L)}`
          updateInstructionText(clamped, yellowTape)
        }
        adjustLengthFontSize(lengthDisplayInput)
      })

      document.addEventListener('keyup', keyupListener)
      // Track this listener for cleanup
      checkSizeListeners.push(keyupListener)
    })

    // RULER UNIT MISMATCH DETECTION
    // Detect if user selected wrong ruler units (inches vs cm)
    const detectRulerUnitMismatch = () => {
      // Local median helper
      const computeMedian = arr => {
        if (!arr || arr.length === 0) return 0
        const sorted = arr.slice().sort((a, b) => a - b)
        const middle = Math.floor(sorted.length / 2)
        return sorted.length % 2 === 0
          ? (sorted[middle - 1] + sorted[middle]) / 2
          : sorted[middle]
      }

      // Get calibration pxPerCm (from credit card/screen size calibration)
      const calibrationPxPerCm = RC.screenSizeMeasurements?.mean
      if (!calibrationPxPerCm || calibrationPxPerCm <= 0) {
        console.log('[Unit Detection] No calibration pxPerCm available')
        return null
      }

      // Get check pxPerCm values (from yellow tape measurements so far)
      const checkPxPerCmArray = RC.calibrateDistancePxPerCm.map(v =>
        parseFloat(v),
      )
      if (!checkPxPerCmArray || checkPxPerCmArray.length === 0) {
        console.log('[Unit Detection] No check pxPerCm values available')
        return null
      }

      // Compute medians
      const medianCalibration = calibrationPxPerCm
      const medianCheck = computeMedian(checkPxPerCmArray)

      if (medianCheck <= 0) {
        console.log('[Unit Detection] Invalid medianCheck:', medianCheck)
        return null
      }

      // Compute ratio r = median(calibration) / median(check)
      const r = medianCalibration / medianCheck
      const log10_1_2 = Math.log10(1.2) // ~0.079
      const log10_1_1 = Math.log10(1.1) // ~0.041

      const selectedUnit = RC.equipment?.value?.unit

      console.log('[Unit Detection] ===== Measurement', i + 1, '=====')
      console.log('[Unit Detection] Selected unit:', selectedUnit)
      console.log('[Unit Detection] Calibration pxPerCm:', medianCalibration)
      console.log('[Unit Detection] Check pxPerCm array:', checkPxPerCmArray)
      console.log('[Unit Detection] Median check pxPerCm:', medianCheck)
      console.log('[Unit Detection] Ratio r:', r)
      console.log('[Unit Detection] log10(r):', Math.log10(r))
      console.log('[Unit Detection] log10(r/2.54):', Math.log10(r / 2.54))
      console.log('[Unit Detection] log10(r*2.54):', Math.log10(r * 2.54))

      let mismatchType = null

      // If "inches" selected and abs(log10(r/2.54)) < log10(1.2), they probably used cm ruler
      if (
        selectedUnit === 'inches' &&
        Math.abs(Math.log10(r / 2.54)) < log10_1_2
      ) {
        mismatchType = 'notInches'
        console.log(
          '[Unit Detection] MISMATCH DETECTED: User selected inches but likely used cm ruler',
        )
      }
      // If "cm" selected and abs(log10(r*2.54)) < log10(1.2), they probably used inch ruler
      else if (
        selectedUnit === 'cm' &&
        Math.abs(Math.log10(r * 2.54)) < log10_1_2
      ) {
        mismatchType = 'notCm'
        console.log(
          '[Unit Detection] MISMATCH DETECTED: User selected cm but likely used inch ruler',
        )
      } else {
        console.log(
          '[Unit Detection] No mismatch detected - measurements consistent',
        )
      }

      return mismatchType ? { type: mismatchType, ratio: r } : null
    }

    // Run detection after each measurement
    const mismatchResult = detectRulerUnitMismatch()
    if (mismatchResult) {
      console.log(
        '[Unit Detection] RESULT:',
        mismatchResult.type,
        '| Ratio:',
        mismatchResult.ratio.toFixed(3),
      )

      // Determine the appropriate error message based on mismatch type
      let errorMessage = ''
      switch (mismatchResult.type) {
        case 'notInches':
          // User selected inches but likely used cm ruler
          errorMessage =
            phrases.RC_screenSizeNotInches?.[RC.language.value] ||
            'Oops. You selected "inches" but it appears that your ruler or tape is marked in centimeters. Please try again. Click OK or press RETURN.'
          break
        case 'notCm':
          // User selected cm but likely used inch ruler
          errorMessage =
            phrases.RC_screenSizeNotCm?.[RC.language.value] ||
            'Oops. You selected "cm" but it appears that your ruler or tape is marked in inches. Please try again. Click OK or press RETURN.'
          break
      }

      // Show popup and wait for OK or RETURN
      await Swal.fire({
        ...swalInfoOptions(RC, { showIcon: false }),
        icon: '',
        title: '',
        html: processInlineFormatting(errorMessage),
        allowEnterKey: true,
        focusConfirm: true,
        confirmButtonText: phrases.RC_ok?.[RC.L] || 'OK',
        didOpen: () => {
          // Prevent Space key from triggering OK (only allow Return/Enter)
          const confirmBtn = Swal.getConfirmButton()
          if (confirmBtn) {
            confirmBtn.addEventListener('keydown', e => {
              if (e.key === ' ' || e.code === 'Space') {
                e.preventDefault()
                e.stopPropagation()
              }
            })
          }
        },
      })

      // Reset all measurements
      RC.calibrateTrackLengthMeasuredCm = []
      RC.calibrateTrackLengthRequestedCm = []
      RC.calibrateDistancePxPerCm = []

      // Reset checkSize tracking arrays
      RC.checkSizeAcceptedLength = []
      RC.checkSizeAcceptedRatioLength = []
      RC.checkSizeRejectedLength = []
      RC.checkSizeRejectedRatioLength = []
      RC.checkSizeHistoryLength = []

      // Clean up current UI
      removeLengthDisplayDiv()

      // Go back to unit selection page by calling getEquipment with forcedGet=true
      await RC.getEquipment(null, true)

      // Check if user selected "no ruler" - if so, exit checkSize
      if (!RC.equipment?.value?.has) {
        console.log(
          '[Unit Detection] User selected no ruler, exiting checkSize',
        )
        removeLengthDisplayDiv()
        RC.showVideo(true)
        return
      }

      // Recalculate processedLengthCm based on newly selected unit
      processedLengthCm = calibrateDistanceCheckLengthCm.map(cm =>
        RC.equipment?.value?.unit === 'inches'
          ? Math.floor(Number(cm) / 2.54)
          : Math.floor(Number(cm)),
      )
      processedLengthCm = processedLengthCm.filter(cm => cm > 0)

      // Restart the checkSize loop from the beginning
      // Re-create the length display div
      createLengthDisplayDiv(RC)

      // Reset loop counter to start from first measurement
      i = -1
      continue
    }

    // PIXEL DENSITY CONSISTENCY CHECK: Starting from the second estimate, check if
    // pxPerCm values are consistent. If not, reject BOTH measurements and restart.
    // Uses: abs(log10(newPxPerCm/oldPxPerCm)) > log10(threshold)
    if (RC.calibrateDistancePxPerCm.length >= 2) {
      const allowedRatioLength = calibrateScreenSizeAllowedRatio // Use passed threshold
      const newPxPerCm = parseFloat(
        RC.calibrateDistancePxPerCm[RC.calibrateDistancePxPerCm.length - 1],
      )
      const oldPxPerCm = parseFloat(
        RC.calibrateDistancePxPerCm[RC.calibrateDistancePxPerCm.length - 2],
      )

      const T_pxDen = allowedRatioLength
      const pxDenRatio = newPxPerCm / oldPxPerCm
      const pxDenRoundedPct = Math.round(100 * pxDenRatio)
      const pxDenLower = Math.round(100 / T_pxDen)
      const pxDenUpper = Math.round(100 * T_pxDen)
      const pxDenAccepted =
        pxDenRoundedPct >= pxDenLower && pxDenRoundedPct <= pxDenUpper

      console.log('[Pixel Density Check] ===== Measurement', i + 1, '=====')
      console.log('[Pixel Density Check] Old pxPerCm:', oldPxPerCm)
      console.log('[Pixel Density Check] New pxPerCm:', newPxPerCm)
      console.log(
        `[Pixel Density Check] Rounded ratio: ${pxDenRoundedPct}%, interval: [${pxDenLower}%, ${pxDenUpper}%]`,
      )

      if (!pxDenAccepted) {
        console.log(
          `[Pixel Density Check] MISMATCH: New length is ${pxDenRoundedPct}% of expected. Rejecting BOTH measurements.`,
        )

        const errorMessage =
          phrases.RC_pixelDensityMismatch?.[RC.language.value]
            ?.replace('[[N1]]', pxDenRoundedPct.toString())
            .replace('[[TT1]]', pxDenLower.toString())
            .replace('[[TT2]]', pxDenUpper.toString()) ||
          `❌ The last two length settings are inconsistent. The new length is ${pxDenRoundedPct}% of that expected from the previous one. Let's try again. Click OK or press RETURN.`

        // Show popup and wait for OK or RETURN
        await Swal.fire({
          ...swalInfoOptions(RC, { showIcon: false }),
          icon: '',
          title: '',
          html: processInlineFormatting(errorMessage),
          allowEnterKey: true,
          focusConfirm: true,
          confirmButtonText: phrases.RC_ok?.[RC.L] || 'OK',
          didOpen: () => {
            // Prevent Space key from triggering OK (only allow Return/Enter)
            const confirmBtn = Swal.getConfirmButton()
            if (confirmBtn) {
              confirmBtn.addEventListener('keydown', e => {
                if (e.key === ' ' || e.code === 'Space') {
                  e.preventDefault()
                  e.stopPropagation()
                }
              })
            }
          },
        })

        // Rejected plot lists: capture before popping (only the more recent pxPerCm)
        RC.checkSizeRejectedLength.push(
          parseFloat(Number(newPxPerCm).toFixed(1)),
        )
        RC.checkSizeRejectedRatioLength.push(
          parseFloat(Number(newPxPerCm / oldPxPerCm).toFixed(4)),
        )

        // Shrink accepted lists: remove the two rejected entries (following distance check pattern)
        for (let popCount = 0; popCount < 2; popCount++) {
          RC.checkSizeAcceptedLength.pop()
          RC.checkSizeAcceptedRatioLength.pop()
        }

        // Reject BOTH measurements - remove them from the arrays
        RC.calibrateDistancePxPerCm.pop() // Remove last (new)
        RC.calibrateDistancePxPerCm.pop() // Remove second-to-last (old)
        RC.calibrateTrackLengthMeasuredCm.pop()
        RC.calibrateTrackLengthMeasuredCm.pop()
        RC.calibrateTrackLengthRequestedCm.pop()
        RC.calibrateTrackLengthRequestedCm.pop()

        // Reduce page count appropriately - go back 2 iterations to remeasure both
        i = RC.calibrateDistancePxPerCm.length - 1 // Will be incremented to correct position

        console.log(
          `[Pixel Density Check] After rejection: ${RC.calibrateDistancePxPerCm.length} measurements remaining, continuing from index ${i + 1}`,
        )
        continue
      } else {
        console.log('[Pixel Density Check] Measurements consistent - passed')
      }
    }
  }

  // Update RC.sizeCheckJSON with final data (copies by value to avoid reference issues)
  RC.sizeCheckJSON = {
    // Configuration
    _calibrateScreenSizeAllowedRatio: calibrateScreenSizeAllowedRatio,
    calibrationPxPerCm: parseFloat(Number(pxPerCm).toFixed(1)),
    screenWidthCm: screenWidthCm,
    rulerUnit: RC.equipment?.value?.unit,
    // Per-measurement arrays (one entry per yellow tape measurement)
    pxPerCm: RC.calibrateDistancePxPerCm.map(v => parseFloat(v)),
    lengthMeasuredPx: RC.calibrateTrackLengthMeasuredCm.slice(),
    lengthRequestedCm: RC.calibrateTrackLengthRequestedCm.slice(),
    // Tracking arrays (following distance calibration pattern)
    acceptedLength: RC.checkSizeAcceptedLength.slice(),
    acceptedRatioLength: RC.checkSizeAcceptedRatioLength.slice(),
    rejectedLength: RC.checkSizeRejectedLength.slice(),
    rejectedRatioLength: RC.checkSizeRejectedRatioLength.slice(),
    historyLength: RC.checkSizeHistoryLength.slice(),
  }

  console.log(
    '[checkSize] Final RC.sizeCheckJSON:',
    JSON.stringify(RC.sizeCheckJSON, null, 2),
  )

  // Clean up the length display div when done
  removeLengthDisplayDiv()

  // Show video again after checkSize completes
  RC.showVideo(true)

  // Position video properly based on calibrateDistanceChecking option
  const videoContainer = document.getElementById('webgazerVideoContainer')
  if (videoContainer) {
    // Check if option includes "camera" - if so, don't reposition (keep camera position)
    const checkingOptions = calibrateDistanceChecking
    let shouldPositionAtCamera = false

    let shouldShowCross = false
    if (checkingOptions && typeof checkingOptions === 'string') {
      const optionsArray = checkingOptions
        .toLowerCase()
        .split(',')
        .map(s => s.trim())
      shouldPositionAtCamera = optionsArray.includes('camera')
      shouldShowCross = optionsArray.includes('tiltandswivel')
    }

    if (!shouldPositionAtCamera) {
      // Only reposition to default if NOT using camera positioning
      setDefaultVideoPosition(RC, videoContainer)
      // Show red cross when tiltandswivel is on (even when camera is centered), otherwise remove
      if (shouldShowCross) {
        createFixationCrossOnVideo()
      } else {
        removeFixationCrossFromVideo()
      }
    } else {
      // Re-create fixation cross when returning to camera mode - only if tiltandswivel is included
      if (shouldShowCross) {
        createFixationCrossOnVideo()
      } else {
        removeFixationCrossFromVideo()
      }
    }
  }

  // Global cleanup: Remove any remaining space bar listeners from checkSize
  // This ensures no space bar listeners are left active after checkSize completes
  console.log('=== CLEANING UP CHECK SIZE SPACE BAR LISTENERS ===')
  checkSizeListeners.forEach(listener => {
    document.removeEventListener('keyup', listener)
  })
  checkSizeListeners.length = 0 // Clear the array
  console.log('=== CHECK SIZE CLEANUP COMPLETE ===')
}
