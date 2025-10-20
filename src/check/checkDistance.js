import RemoteCalibrator, { env } from '../core'
import { takeInput } from '../components/checkInput'
import {
  constructInstructions,
  safeExecuteFunc,
  sleep,
} from '../components/utils'
import { remoteCalibratorPhrases } from '../i18n/phrases'
import { setUpEasyEyesKeypadHandler } from '../extensions/keypadHandler'
import { phrases } from '../i18n/schema'
import Swal from 'sweetalert2'
import { swalInfoOptions } from '../components/swalOptions'
import { setDefaultVideoPosition } from '../components/video'
import { irisTrackingIsActive } from '../distance/distanceTrack'
import {
  calculateNearestPoints,
  getMeshData,
  stdDist,
} from '../distance/distanceTrack'
import { getLeftAndRightEyePointsFromMeshData } from '../distance/distance'

// Import sound feedback
let cameraShutterSound
try {
  const soundModule = require('../components/sound')
  cameraShutterSound = soundModule.cameraShutterSound
} catch (error) {
  console.warn('Sound module not available')
}

// Helper function to adjust instruction font size for distance check (RC_produceDistance)
const adjustDistanceCheckFontSize = () => {
  const instructionElement = document.querySelector('.calibration-instruction')
  if (!instructionElement) {
    console.log('No instruction element found')
    return
  }

  const titleElement = document.getElementById('instruction-title')
  const bodyElement = document.getElementById('instruction-body')

  if (!titleElement && !bodyElement) {
    console.log('No title or body elements found')
    return
  }

  // Get current window size
  const windowWidth = window.innerWidth
  const windowHeight = window.innerHeight

  console.log(`Window resized to: ${windowWidth}x${windowHeight}`)

  // Distance check: start with 1.1rem for body and scale down only
  const baseFontSize = 16
  const baseBodySize = 1.1 * baseFontSize // 17.6px (1.1rem)
  const baseTitleSize = 2.5 * baseFontSize // 40px (2.5rem)

  // Calculate scale factor based on window width
  // For screens 1200px and above, use full size (1.1rem for body)
  // For smaller screens, scale down proportionally
  let scaleFactor = 1.0
  if (windowWidth < 1200) {
    scaleFactor = Math.max(0.05, windowWidth / 1200) // Scale down from 1200px, minimum 5%
  }

  // Calculate font sizes
  const titleFontSize = Math.round(baseTitleSize * scaleFactor)
  const bodyFontSize = Math.round(baseBodySize * scaleFactor)

  console.log(
    `Scale factor: ${scaleFactor.toFixed(2)}, Title: ${titleFontSize}px, Body: ${bodyFontSize}px`,
  )

  // Apply font sizes
  if (titleElement) {
    titleElement.style.fontSize = `${titleFontSize}px`
    titleElement.style.lineHeight = windowWidth <= 480 ? '120%' : '100%'
    console.log(`Applied title font size: ${titleFontSize}px`)
  }

  if (bodyElement) {
    bodyElement.style.fontSize = `${bodyFontSize}px`
    bodyElement.style.lineHeight = '1.6'
    console.log(`Applied body font size: ${bodyFontSize}px`)
  }

  // Check for overflow and reduce font size if needed (only for distance check)
  let attempts = 0
  const maxAttempts = 20 // Allow more attempts since we can go down to 5%

  while (attempts < maxAttempts) {
    const instructionRect = instructionElement.getBoundingClientRect()
    const video = document.getElementById('webgazerVideoContainer')

    // Calculate available space
    let availableWidth = windowWidth
    let availableHeight = windowHeight - 100 // Account for progress bar

    if (video) {
      const videoRect = video.getBoundingClientRect()
      const videoLeftEdge = (windowWidth - videoRect.width) / 2
      availableWidth = videoLeftEdge - 20 // Leave margin
    }

    const overflowsWidth = instructionRect.width > availableWidth
    const overflowsHeight = instructionRect.height > availableHeight

    if (!overflowsWidth && !overflowsHeight) {
      break // Text fits within available space
    }

    // Reduce font size by 5% and try again
    const newTitleFontSize = Math.max(1, Math.round(titleFontSize * 0.95)) // Minimum 1px
    const newBodyFontSize = Math.max(1, Math.round(bodyFontSize * 0.95)) // Minimum 1px

    if (titleElement) {
      titleElement.style.fontSize = `${newTitleFontSize}px`
    }
    if (bodyElement) {
      bodyElement.style.fontSize = `${newBodyFontSize}px`
    }

    attempts++
  }

  console.log(
    `Distance check - Final font sizes after overflow check: Title: ${titleElement?.style.fontSize}, Body: ${bodyElement?.style.fontSize}, Attempts: ${attempts}`,
  )
}

// Helper function to adjust instruction font size for size check (RC_SetLength)
const adjustSizeCheckFontSize = () => {
  const instructionElement = document.querySelector('.calibration-instruction')
  if (!instructionElement) {
    console.log('No instruction element found')
    return
  }

  const titleElement = document.getElementById('instruction-title')
  const bodyElement = document.getElementById('instruction-body')

  if (!titleElement && !bodyElement) {
    console.log('No title or body elements found')
    return
  }

  // Get current window size
  const windowWidth = window.innerWidth
  const windowHeight = window.innerHeight

  console.log(`Size check - Window resized to: ${windowWidth}x${windowHeight}`)

  // Size check: start with 1.4rem for body and scale down only
  const baseFontSize = 16
  const baseBodySize = 1.4 * baseFontSize // 22.4px (1.4rem)
  const baseTitleSize = 2.5 * baseFontSize // 40px (2.5rem)

  // Calculate scale factor based on window width
  let scaleFactor = 1.0
  if (windowWidth < 1200) {
    scaleFactor = Math.max(0.05, windowWidth / 1200) // Scale down from 1200px, minimum 5%
  }

  // Calculate font sizes
  const titleFontSize = Math.round(baseTitleSize * scaleFactor)
  const bodyFontSize = Math.round(baseBodySize * scaleFactor)

  console.log(
    `Size check - Scale factor: ${scaleFactor.toFixed(2)}, Title: ${titleFontSize}px, Body: ${bodyFontSize}px`,
  )

  // Apply font sizes
  if (titleElement) {
    titleElement.style.fontSize = `${titleFontSize}px`
    titleElement.style.lineHeight = windowWidth <= 480 ? '120%' : '100%'
  }

  if (bodyElement) {
    bodyElement.style.fontSize = `${bodyFontSize}px`
    bodyElement.style.lineHeight = '1.6'
  }
}

// Helper function to set up distance check font size adjustment
const setupDistanceCheckFontAdjustment = () => {
  console.log('Setting up distance check font adjustment')

  // Initial adjustment
  adjustDistanceCheckFontSize()

  // Set up resize listener with immediate execution (no debounce for testing)
  const resizeHandler = () => {
    console.log('Resize event detected')
    adjustDistanceCheckFontSize()
  }

  window.addEventListener('resize', resizeHandler)
  console.log('Resize listener added')

  // Return cleanup function
  return () => {
    console.log('Cleaning up distance check font adjustment')
    window.removeEventListener('resize', resizeHandler)
  }
}

// Helper function to set up size check font size adjustment
const setupSizeCheckFontAdjustment = () => {
  console.log('Setting up size check font adjustment')

  // Initial adjustment
  adjustSizeCheckFontSize()

  // Set up resize listener with immediate execution (no debounce for testing)
  const resizeHandler = () => {
    console.log('Resize event detected')
    adjustSizeCheckFontSize()
  }

  window.addEventListener('resize', resizeHandler)
  console.log('Resize listener added')

  // Return cleanup function
  return () => {
    console.log('Cleaning up size check font adjustment')
    window.removeEventListener('resize', resizeHandler)
  }
}

// Helper function to capture current video frame as base64 image
const captureVideoFrame = RC => {
  try {
    const video = document.getElementById('webgazerVideoCanvas')
    if (!video) return null

    // Create a canvas to capture the frame
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    // Set canvas size to match video
    canvas.width = video.videoWidth || video.width
    canvas.height = video.videoHeight || video.height

    // Mirror the image to match the video display (since video is mirrored by default)
    ctx.save()
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    ctx.restore()

    // Convert to base64 data URL
    return canvas.toDataURL('image/jpeg', 0.8)
  } catch (error) {
    console.warn('Failed to capture video frame:', error)
    return null
  }
}

// Helper function to validate face mesh data (5 valid samples required)
const validateFaceMeshSamples = async (
  RC,
  calibrateTrackDistancePupil = 'iris',
) => {
  const samples = []
  let nearestXYPx_left = null
  let nearestXYPx_right = null
  let eyeToCameraCm = null
  let eyeToCenterCm = null
  let footToCameraCm = null
  let footToCenterCm = null
  let calibrationFactor = null
  let footXYPx = null
  let ipdPixels = null

  // Collect exactly 5 samples, using NaN for failed measurements
  for (let i = 0; i < 5; i++) {
    try {
      const ipdData = await captureIPDFromFaceMesh(
        RC,
        calibrateTrackDistancePupil,
      )
      if (ipdData && ipdData.ipdPixels && !isNaN(ipdData.ipdPixels)) {
        samples.push(ipdData.ipdPixels)
        if (
          ipdData.nearestXYPx_left &&
          ipdData.nearestXYPx_left.length > 0 &&
          !isNaN(ipdData.nearestXYPx_left[0]) &&
          !isNaN(ipdData.nearestXYPx_left[1])
        ) {
          nearestXYPx_left = ipdData.nearestXYPx_left
        }
        if (
          ipdData.nearestXYPx_right &&
          ipdData.nearestXYPx_right.length > 0 &&
          !isNaN(ipdData.nearestXYPx_right[0]) &&
          !isNaN(ipdData.nearestXYPx_right[1])
        ) {
          nearestXYPx_right = ipdData.nearestXYPx_right
        }

        if (ipdData.eyeToCameraCm && !isNaN(ipdData.eyeToCameraCm)) {
          eyeToCameraCm = ipdData.eyeToCameraCm.toFixed(1)
        }

        if (ipdData.eyeToCenterCm && !isNaN(ipdData.eyeToCenterCm)) {
          eyeToCenterCm = ipdData.eyeToCenterCm.toFixed(1)
        }

        if (ipdData.footToCameraCm && !isNaN(ipdData.footToCameraCm)) {
          footToCameraCm = ipdData.footToCameraCm.toFixed(1)
        }

        if (ipdData.footToCenterCm && !isNaN(ipdData.footToCenterCm)) {
          footToCenterCm = ipdData.footToCenterCm.toFixed(1)
        }

        if (ipdData.calibrationFactor && !isNaN(ipdData.calibrationFactor)) {
          calibrationFactor = ipdData.calibrationFactor.toFixed(0)
        }

        if (
          ipdData.footXYPx &&
          !isNaN(ipdData.footXYPx[0]) &&
          !isNaN(ipdData.footXYPx[1])
        ) {
          footXYPx = [
            ipdData.footXYPx[0].toFixed(0),
            ipdData.footXYPx[1].toFixed(0),
          ]
        }

        if (ipdData.ipdPixels && !isNaN(ipdData.ipdPixels)) {
          ipdPixels = ipdData.ipdPixels
        }
      } else {
        samples.push(NaN)
        console.warn(`Face Mesh measurement ${i + 1} failed, storing NaN`)
      }
    } catch (error) {
      samples.push(NaN)
      console.warn(`Face Mesh measurement ${i + 1} error:`, error)
    }

    // Wait 100ms between samples
    await new Promise(res => setTimeout(res, 100))
  }

  // Check if we have at least 3 valid samples
  const validSamples = samples.filter(sample => !isNaN(sample))
  const isValid = validSamples.length >= 3

  console.log(`Face Mesh validation: ${validSamples.length}/5 valid samples`)
  console.log(
    'All samples:',
    samples.map(sample => (isNaN(sample) ? 'NaN' : Math.round(sample))),
  )

  return {
    isValid,
    samples,
    validCount: validSamples.length,
    nearestXYPx_left,
    nearestXYPx_right,
    eyeToCameraCm,
    eyeToCenterCm,
    footToCameraCm,
    footToCenterCm,
    calibrationFactor,
    footXYPx,
    ipdPixels,
  }
}

// Helper function to show face blocked popup with retry mechanism
const showFaceBlockedPopup = async (RC, capturedImage) => {
  // Hide video container when popup opens
  const videoContainer = document.getElementById('webgazerVideoContainer')
  let originalVideoDisplay = null
  if (videoContainer) {
    originalVideoDisplay = videoContainer.style.display
    videoContainer.style.display = 'none'
  }

  const result = await Swal.fire({
    ...swalInfoOptions(RC, { showIcon: false }),
    title: phrases.RC_FaceBlocked[RC.language.value],
    html: `<div style="text-align: center;">
        <img src="${capturedImage}" style="max-width: 300px; max-height: 400px; border: 2px solid #ccc; border-radius: 8px;" alt="Camera view" />
        <p style="margin-top: 15px; font-size: 0.7em; color: #666;">${phrases.RC_FaceImageNotSaved[RC.language.value]}</p>
       </div>`,
    showCancelButton: false,
    showConfirmButton: true,
    confirmButtonText: phrases.EE_ok[RC.language.value],
    allowEnterKey: false,
    didOpen: () => {
      // Handle keyboard events - only allow Enter/Return, prevent Space
      const keydownListener = event => {
        if (event.key === ' ') {
          event.preventDefault()
          event.stopPropagation()
          return
        }
        if (event.key === 'Enter' || event.key === 'Return') {
          Swal.clickConfirm()
        }
      }
      document.addEventListener('keydown', keydownListener, true)
      RC.popupKeydownListener = keydownListener
    },
    willClose: () => {
      // Remove keyboard event listener
      if (RC.popupKeydownListener) {
        document.removeEventListener('keydown', RC.popupKeydownListener, true)
        RC.popupKeydownListener = null
      }
    },
  })

  // Show video container again when popup closes
  if (videoContainer) {
    videoContainer.style.display = originalVideoDisplay || ''
  }

  return result
}

// Helper function to capture IPD from face mesh data
const captureIPDFromFaceMesh = async (
  RC,
  calibrateTrackDistancePupil = 'iris',
) => {
  try {
    const video = document.getElementById('webgazerVideoCanvas')
    if (!video) {
      console.warn('No video canvas found for IPD measurement')
      return null
    }
    // Ensure model is loaded
    const model = await RC.gazeTracker.webgazer.getTracker().model
    const faces = await model.estimateFaces(video)

    if (!faces.length) {
      console.warn('No faces detected for IPD measurement')
      return null
    }

    // Get face mesh keypoints
    const mesh = faces[0].keypoints || faces[0].scaledMesh
    // Calculate eye positions using same logic as distanceTrack.js
    const eyeDist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
    const { leftEye, rightEye } = getLeftAndRightEyePointsFromMeshData(
      mesh,
      calibrateTrackDistancePupil,
    )

    // Calculate IPD in pixels
    const ipdPixels = eyeDist(leftEye, rightEye)
    // Convert to cm if we have screen PPI
    let ipdCm = null
    if (RC.screenPpi && RC.screenPpi.value) {
      // Use the same conversion logic as in distance tracking
      const cameraPxPerCm = ipdPixels / RC._CONST.IPD_CM
      ipdCm = ipdPixels / cameraPxPerCm
    }
    const webcamToEyeDistance = stdDist.current.calibrationFactor / ipdPixels
    const cameraPxPerCm = ipdPixels / RC._CONST.IPD_CM
    const ppi = RC.screenPpi ? RC.screenPpi.value : RC._CONST.N.PPI_DONT_USE

    const pxPerCm = ppi / 2.54

    const nearestPoints = calculateNearestPoints(
      video,
      leftEye,
      rightEye,
      ipdPixels,
      webcamToEyeDistance,
      pxPerCm,
      RC.screenPpi.value,
      RC,
      {},
      0,
      0,
      '',
      1,
      [],
      [],
      0,
      0,
      ipdPixels,
      true,
    )
    const {
      nearestXYPx_left,
      nearestXYPx_right,
      eyeToCameraCm,
      eyeToCenterCm,
      footToCameraCm,
      footToCenterCm,
      calibrationFactor,
      footXYPx,
    } = nearestPoints

    return {
      ipdPixels: Math.round(ipdPixels), // Round to integer
      ipdCm: ipdCm ? Number(ipdCm.toFixed(2)) : null,
      timestamp: performance.now(),
      eyePositions: {
        left: leftEye,
        right: rightEye,
      },
      nearestXYPx_left,
      nearestXYPx_right,
      eyeToCameraCm,
      eyeToCenterCm,
      footToCameraCm,
      footToCenterCm,
      calibrationFactor,
      footXYPx,
    }
  } catch (error) {
    console.error('Error capturing IPD from face mesh:', error)
    return null
  }
}

RemoteCalibrator.prototype._checkDistance = async function (
  distanceCallback,
  distanceData,
  measureName, // 'measureDistance' OR 'trackDistance'
  checkCallback,
  calibrateTrackDistanceCheckCm = [],
  callbackStatic = () => {},
  calibrateTrackDistanceCheckSecs = 0,
  calibrateTrackDistanceCheckLengthCm = [],
  calibrateTrackDistanceCenterYourEyesBool = true,
  calibrateTrackDistancePupil = 'iris',
  calibrateTrackDistanceChecking = undefined,
) {
  await this.getEquipment(
    async () => {
      return await trackDistanceCheck(
        this,
        distanceCallback,
        distanceData,
        measureName,
        checkCallback,
        calibrateTrackDistanceCheckCm,
        callbackStatic,
        calibrateTrackDistanceCheckSecs,
        calibrateTrackDistanceCheckLengthCm,
        calibrateTrackDistanceCenterYourEyesBool,
        calibrateTrackDistancePupil,
        calibrateTrackDistanceChecking,
      )
    },
    false,
    'new',
  )
}

const checkDistance = async (
  RC,
  distanceCallback,
  distanceData,
  measureName,
  checkCallback,
) => {
  const isTrack = measureName === 'trackDistance'

  const quit = () => {
    RC._removeBackground()
    if (!isTrack) safeExecuteFunc(distanceCallback, distanceData)
  }

  // Start tracking right away
  if (isTrack) safeExecuteFunc(distanceCallback, distanceData)

  if (RC.equipment?.value?.has) {
    RC._addBackground()

    // ! Has equipment
    RC._replaceBackground(
      constructInstructions(
        '📏 ' + 'Hold Still and Measure Viewing Distance with Ruler',
        'Hold still so that your viewing distance from the screen stays unchanged from the last measurement. Please measure the distance from the middle of your screen to one of your eyes using your ruler (or measuring tape). If your ruler is not long enough, then select "Ruler is too short" below. Type your numerical answer into the box, then click OK or hit RETURN.',
      ),
    )

    // Set max-width to avoid video overlap
    const instructionElement = document.querySelector(
      '.calibration-instruction',
    )
    const video = document.getElementById('webgazerVideoContainer')
    if (instructionElement && video) {
      const videoRect = video.getBoundingClientRect()
      const screenWidth = window.innerWidth
      const videoLeftEdge = (screenWidth - videoRect.width) / 2
      instructionElement.style.maxWidth = `${videoLeftEdge - 3}px`
    }

    const measureData = await takeInput(RC, null, null, {
      callback: () => {},
      content: 'Ruler is too short',
    })

    if (measureData) {
      const measureValue = measureData.value
      const value = {
        ...measureValue,
        calibratorCm: RC.viewingDistanceCm.value,
        calibratorMethod: RC.viewingDistanceCm.method,
      }

      const newCheckData = {
        value: value,
        timestamp: measureData.timestamp,
        measure: measureName,
      }
      RC.newCheckData = newCheckData

      quit()
      safeExecuteFunc(checkCallback, newCheckData)

      return
    }
  }
  quit()
}

// Helper function to create yellow tape rectangle (extracted from object test)
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
  lengthContainer.style.top = `${screenCenterY - threeQuarterInchesInPx / 2 - 375}px`
  lengthContainer.style.transform = 'translate(-50%)'
  lengthContainer.style.width = '100%'
  lengthContainer.style.height = '350px'
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
    lengthContainer.style.top = `${newScreenCenterY - threeQuarterInchesInPx / 2 - 375}px`
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

const soundModule = require('../components/sound')
const stampOfApprovalSound = soundModule.stampOfApprovalSound

const checkSize = async (
  RC,
  calibrateTrackDistanceCheckLengthCm = [],
  calibrateTrackDistanceChecking = undefined,
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

  // Process calibrateTrackDistanceCheckLengthCm the same way as calibrateTrackDistanceCheckCm
  let processedLengthCm = calibrateTrackDistanceCheckLengthCm.map(cm =>
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

  // Initialize arrays to store length data (similar to distance tracking)
  RC.calibrateTrackLengthMeasuredCm = []
  RC.calibrateTrackLengthRequestedCm = []
  RC.calibrateTrackDistancePxPerCm = []

  // Create the length display div
  createLengthDisplayDiv(RC)

  // Loop through each length value to create dynamic pages
  for (let i = 0; i < processedLengthCm.length; i++) {
    const cm = processedLengthCm[i]
    const index = i + 1

    // Update the length display with the current required length
    updateLengthDisplayDiv(cm, RC.equipment?.value?.unit)

    // Create and update instruction content
    const updateInstructionText = currentLength => {
      const instructionTitle = phrases.RC_SetLengthTitle[RC.language.value]
        .replace('[[N11]]', index)
        .replace('[[N22]]', processedLengthCm.length)

      const instructionBody = phrases.RC_SetLength[RC.language.value]
        .replace('[[N33]]', currentLength)
        .replace('[[UUU]]', RC.equipment?.value?.unit)
        .replace(/(?:\r\n|\r|\n)/g, '<br><br>')

      if (!document.getElementById('instruction-title')) {
        const html = constructInstructions(
          instructionTitle,
          instructionBody,
          false,
          'bodyText',
          'left',
        )
        RC._replaceBackground(html)

        // Set max-width to avoid video overlap
        const instructionElement = document.querySelector(
          '.calibration-instruction',
        )
        const video = document.getElementById('webgazerVideoContainer')
        if (instructionElement && video) {
          const videoRect = video.getBoundingClientRect()
          const screenWidth = window.innerWidth
          const videoLeftEdge = (screenWidth - videoRect.width) / 2
          instructionElement.style.maxWidth = `${videoLeftEdge - 3}px`
        }
      } else {
        const titleElement = document.getElementById('instruction-title')
        const bodyElement = document.getElementById('instruction-body')
        if (titleElement) titleElement.innerHTML = instructionTitle
        if (bodyElement) bodyElement.innerHTML = instructionBody
      }
    }

    updateInstructionText(cm)

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

      function handleMeasurement() {
        if (register) {
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
          RC.calibrateTrackDistancePxPerCm.push(
            (Number(measuredLength.toFixed(1)) / lengthInCm).toFixed(1),
          )

          document.removeEventListener('keyup', keyupListener)
          // Remove from tracking
          const index = checkSizeListeners.indexOf(keyupListener)
          if (index > -1) checkSizeListeners.splice(index, 1)
          removeKeypadHandler()
          cleanupFontAdjustment() // Clean up font adjustment listeners
          yellowTape.cleanup() // Clean up the yellow tape
          resolve()
        }
      }

      function keyupListener(event) {
        if (event.key === ' ') {
          handleMeasurement()
        }
      }

      // Set up keypad handler for space key (for devices with keypad)
      const removeKeypadHandler = setUpEasyEyesKeypadHandler(
        null,
        RC.keypadHandler,
        value => {
          if (value === 'space') {
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
        e.target.value = `${clamped} ${RC.equipment?.value?.unit || ''}`
        updateInstructionText(clamped)
        adjustLengthFontSize(lengthDisplayInput)
      })

      lengthDisplayInput.addEventListener('blur', e => {
        const raw = e.target.value
        const numeric = parseNumeric(raw)
        if (e.target.value === '' || isNaN(numeric) || numeric < 1) {
          e.target.value = `1 ${RC.equipment?.value?.unit || ''}`
          updateInstructionText(1)
        } else {
          const clamped = Math.max(1, Math.min(100, numeric))
          e.target.value = `${clamped} ${RC.equipment?.value?.unit || ''}`
          updateInstructionText(clamped)
        }
        adjustLengthFontSize(lengthDisplayInput)
      })

      document.addEventListener('keyup', keyupListener)
      // Track this listener for cleanup
      checkSizeListeners.push(keyupListener)
    })
  }

  // Clean up the length display div when done
  removeLengthDisplayDiv()

  // Show video again after checkSize completes
  RC.showVideo(true)

  // Position video properly based on calibrateTrackDistanceChecking option
  const videoContainer = document.getElementById('webgazerVideoContainer')
  if (videoContainer) {
    // Check if option includes "camera" - if so, don't reposition (keep camera position)
    const checkingOptions = calibrateTrackDistanceChecking
    let shouldPositionAtCamera = false

    if (checkingOptions && typeof checkingOptions === 'string') {
      const optionsArray = checkingOptions
        .toLowerCase()
        .split(',')
        .map(s => s.trim())
      shouldPositionAtCamera = optionsArray.includes('camera')
    }

    if (!shouldPositionAtCamera) {
      // Only reposition to default if NOT using camera positioning
      setDefaultVideoPosition(RC, videoContainer)
    }
    // If shouldPositionAtCamera is true, don't call setDefaultVideoPosition
    // The video will stay at the camera position set by createProgressBar
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

const trimVideoFeedbackDisplay = (
  videoId,
  videoCanvasId,
  cameraDownshiftFraction = 0,
  RC,
) => {
  if (!videoId) {
    console.warn('//.No videoId provided')
    return
  }

  const video = document.getElementById(videoId)
  if (!video) {
    console.warn('//.Video element not found:', videoId)
    return
  }

  const videoContainer = document.getElementById('webgazerVideoContainer')
  if (!videoContainer) {
    console.warn('//.Video container not found')
    return
  }

  const webgazerFaceFeedbackBox = document.getElementById(
    'webgazerFaceFeedbackBox',
  )

  // Calculate the trim amount as percentage of video height
  const trimTopPercent = (2 * cameraDownshiftFraction * 100).toFixed(2)
  // Apply CSS clipping to trim the top of the video
  // clip-path: inset(top right bottom left)
  videoContainer.style.clipPath = `inset(${trimTopPercent}% 0% 0% 0%)`

  // Center the cropped video container on the screen
  // We need to adjust positioning to account for the clipped top portion
  const containerRect = videoContainer.getBoundingClientRect()
  const originalHeight = containerRect.height
  const trimTopFraction = parseFloat(trimTopPercent) / 100
  const clippedHeight = originalHeight * (1 - trimTopFraction)
  const clippedTopOffset = originalHeight * trimTopFraction

  videoContainer.style.position = 'fixed'
  videoContainer.style.left = '50%'
  // Adjust top position to center the visible clipped area
  videoContainer.style.top = `calc(50% - ${clippedTopOffset / 2}px)`
  videoContainer.style.transform = 'translate(-50%, -50%)'
  // videoContainer.style.zIndex = '1000'

  if (webgazerFaceFeedbackBox) {
    // Get the original container dimensions
    const containerRect = videoContainer.getBoundingClientRect()
    const originalHeight = containerRect.height

    // Calculate the effective height after clipping
    const trimTopFraction = parseFloat(trimTopPercent) / 100
    const effectiveHeight = originalHeight * (1 - trimTopFraction)

    // Calculate the center position within the clipped area
    // The clipped area starts at trimTopFraction of the original height
    const clippedAreaTop = originalHeight * trimTopFraction
    const centerYWithinClipped = clippedAreaTop + effectiveHeight / 2

    // Convert to percentage of the original container height for positioning
    const centerYPercent = (centerYWithinClipped / originalHeight) * 100

    // Set the feedback box height to 60% of the trimmed height
    const feedbackBoxHeight = effectiveHeight * 0.66

    //center the feedback box inside the video container AFTER clip-path is applied
    webgazerFaceFeedbackBox.style.left = '50%'
    webgazerFaceFeedbackBox.style.top = `${centerYPercent}%`
    webgazerFaceFeedbackBox.style.height = `${feedbackBoxHeight}px`
    webgazerFaceFeedbackBox.style.transform = 'translate(-50%, -50%)'
  }
}

const trackDistanceCheck = async (
  RC,
  distanceCallback,
  distanceData,
  measureName,
  checkCallback,
  calibrateTrackDistanceCheckCm, // list of distances to check
  callbackStatic,
  calibrateTrackDistanceCheckSecs = 0,
  calibrateTrackDistanceCheckLengthCm = [], // list of lengths to check
  calibrateTrackDistanceCenterYourEyesBool = true,
  calibrateTrackDistancePupil = 'iris',
  calibrateTrackDistanceChecking = undefined,
) => {
  const isTrack = measureName === 'trackDistance'

  // Track all space bar listeners for proper cleanup
  const activeListeners = []

  const quit = () => {
    stopVideoTrimming()
    RC._removeBackground()
    if (!isTrack) safeExecuteFunc(distanceCallback, distanceData, false)
    callbackStatic()
  }

  // Start tracking right away
  if (isTrack) safeExecuteFunc(distanceCallback, distanceData, false)

  // Set up continuous video trimming for screen center distance measurement
  let videoTrimmingInterval = null
  const startVideoTrimming = () => {
    if (videoTrimmingInterval) return // Already running

    videoTrimmingInterval = setInterval(async () => {
      // Constants for calculation
      const IPDCm = 6.3 // Assumed IPD in cm (average for adults)

      // Get current IPD in pixels from WebGazer/FaceMesh
      let IPDPx = null
      try {
        const videoCanvas = document.getElementById('webgazerVideoCanvas')
        if (videoCanvas && RC.gazeTracker?.webgazer) {
          const model = await RC.gazeTracker.webgazer.getTracker().model
          const faces = await model.estimateFaces(videoCanvas)
          if (faces.length > 0) {
            const mesh = faces[0].keypoints || faces[0].scaledMesh
            const { leftEye, rightEye } = getLeftAndRightEyePointsFromMeshData(
              mesh,
              calibrateTrackDistancePupil,
            )
            if (leftEye && rightEye) {
              // Calculate IPD using the same method as in distanceTrack.js
              //left eye: average of 362 and 263
              //right eye: average of 133 and 33
              const leftEyeX = leftEye.x
              const leftEyeY = leftEye.y
              const leftEyeZ = leftEye.z
              const rightEyeX = rightEye.x
              const rightEyeY = rightEye.y
              const rightEyeZ = rightEye.z

              IPDPx = Math.hypot(
                rightEyeX - leftEyeX,
                rightEyeY - leftEyeY,
                rightEyeZ - leftEyeZ,
              )
            }
          }
        }
      } catch (error) {
        console.error('Error getting IPD:', error)
        // Silently handle errors - face detection might not always work
      }

      if (IPDPx && RC.screenHeightCm?.value) {
        // Get camera video dimensions
        const videoCanvas = document.getElementById('webgazerVideoCanvas')

        if (videoCanvas) {
          const cameraHeightPx = videoCanvas.height
          const screenHeightCm = RC.screenHeightCm.value

          // Calculate camera downshift fraction
          // cameraDownshiftFraction = (screenHeightCm/2) * (IPDPx/IPDCm) / cameraHeightPx
          const cameraDownshiftFraction =
            ((screenHeightCm / 2) * (IPDPx / IPDCm)) / cameraHeightPx

          // Trim the video using the existing function
          trimVideoFeedbackDisplay(
            'webgazerVideoFeed',
            'webgazerVideoCanvas',
            cameraDownshiftFraction, // Use the actual calculated value
            RC,
          )
        }
      }
    }, 100) // Update every 100ms for smooth trimming
  }

  const stopVideoTrimming = () => {
    if (videoTrimmingInterval) {
      clearInterval(videoTrimmingInterval)
      videoTrimmingInterval = null
    }

    // Reset video styling
    const videoContainer = document.getElementById('webgazerVideoContainer')

    if (videoContainer) {
      videoContainer.style.clipPath = ''
      videoContainer.style.position = ''
      videoContainer.style.left = ''
      videoContainer.style.top = ''
      videoContainer.style.transform = ''
      videoContainer.style.zIndex = ''
      console.log('//.Reset video container clipPath and positioning')
    }
  }

  //if participant has equipment
  //if the unit is inches, convert calibrateTrackDistanceCheckCm to inches and round to integer
  //discard negative, zero, and values exceeding equipment length
  if (RC.equipment?.value?.has) {
    // Show dummy test page right after equipment is confirmed
    RC.pauseNudger()
    await checkSize(
      RC,
      calibrateTrackDistanceCheckLengthCm,
      calibrateTrackDistanceChecking,
    )
    RC.resumeNudger()
    // Start video trimming for screen center distance measurement
    // only trim video if calibrateTrackDistanceCenterYourEyesBool is true AND not using camera positioning
    // Video trimming centers the video, which conflicts with camera positioning
    const checkingOptions = calibrateTrackDistanceChecking
    let shouldPositionAtCamera = false

    if (checkingOptions && typeof checkingOptions === 'string') {
      const optionsArray = checkingOptions
        .toLowerCase()
        .split(',')
        .map(s => s.trim())
      shouldPositionAtCamera = optionsArray.includes('camera')
    }

    if (calibrateTrackDistanceCenterYourEyesBool && !shouldPositionAtCamera) {
      startVideoTrimming()
    }

    calibrateTrackDistanceCheckCm = calibrateTrackDistanceCheckCm.map(cm =>
      RC.equipment?.value?.unit === 'inches'
        ? Math.round(Number(cm) / 2.54)
        : Math.round(Number(cm)),
    )

    calibrateTrackDistanceCheckCm = calibrateTrackDistanceCheckCm.filter(
      cm => cm > 0 && cm <= RC.equipment?.value?.length,
    )

    if (calibrateTrackDistanceCheckCm.length === 0) {
      console.warn('No valid distances to check.')
      quit()
      return
    }

    RC._removeBackground()
    RC.pauseNudger()
    createProgressBar(RC, calibrateTrackDistanceChecking)
    createViewingDistanceDiv()
    RC.calibrateTrackDistanceMeasuredCm = []
    RC.calibrateTrackDistanceRequestedCm = []
    // Initialize IPD and requested distance arrays
    RC.calibrateTrackDistanceIPDPixels = []
    RC.calibrateTrackDistanceRequestedDistances = []
    RC.calibrateTrackDistanceEyeFeetXYPx = []
    let skippedDistancesCount = 0
    const ppi = RC.screenPpi ? RC.screenPpi.value : RC._CONST.N.PPI_DONT_USE

    const pxPerCm = ppi / 2.54

    RC.distanceCheckJSON = {
      _calibrateTrackDistanceCheckPoint: 'camera',
      pointXYPx: [window.innerWidth / 2, 0],
      cameraXYPx: [window.innerWidth / 2, 0],
      centerXYPx: [window.innerWidth / 2, window.innerHeight / 2],
      pxPerCm: pxPerCm,
      factorCameraPxCm: stdDist.current.calibrationFactor,
      distanceChecks: [],
    }

    for (let i = 0; i < calibrateTrackDistanceCheckCm.length; i++) {
      let register = true
      const cm = calibrateTrackDistanceCheckCm[i]
      const index = i + 1

      // Track space bar listeners for this iteration
      const iterationListeners = []

      updateProgressBar(
        (index / calibrateTrackDistanceCheckCm.length) * 100,
        index,
        calibrateTrackDistanceCheckCm.length,
      )
      updateViewingDistanceDiv(cm, RC.equipment?.value?.unit)

      // Determine which instruction text to show based on calibrateTrackDistanceChecking option
      const checkingOptions = calibrateTrackDistanceChecking
      let instructionBodyPhrase = phrases.RC_produceDistance[RC.language.value]

      if (checkingOptions && typeof checkingOptions === 'string') {
        const optionsArray = checkingOptions
          .toLowerCase()
          .split(',')
          .map(s => s.trim())
        const hasTiltAndSwivel = optionsArray.includes('tiltandswivel')
        const hasCamera = optionsArray.includes('camera')

        if (hasTiltAndSwivel && hasCamera) {
          // Both tiltAndSwivel and camera
          instructionBodyPhrase =
            phrases.RC_produceDistanceCameraTiltAndSwivel?.[
              RC.language.value
            ] || phrases.RC_produceDistance[RC.language.value]
        } else if (hasTiltAndSwivel) {
          // Only tiltAndSwivel
          instructionBodyPhrase =
            phrases.RC_produceDistanceTiltAndSwivel?.[RC.language.value] ||
            phrases.RC_produceDistance[RC.language.value]
        } else if (hasCamera) {
          // Only camera
          instructionBodyPhrase =
            phrases.RC_produceDistanceCamera?.[RC.language.value] ||
            phrases.RC_produceDistance[RC.language.value]
        }
      }

      const html = constructInstructions(
        phrases.RC_produceDistanceTitle[RC.language.value]
          .replace('[[N22]]', index)
          .replace('[[N33]]', calibrateTrackDistanceCheckCm.length),
        instructionBodyPhrase
          .replace('[[N11]]', cm)
          .replace('[[UUU]]', RC.equipment?.value?.unit)
          .replace(/(?:\r\n|\r|\n)/g, '<br><br>'),
        false,
        'bodyText',
        'left',
      )
      RC._replaceBackground(html)

      // Set max-width to avoid video overlap
      const instructionElement = document.querySelector(
        '.calibration-instruction',
      )
      const video = document.getElementById('webgazerVideoContainer')
      if (instructionElement && video) {
        const videoRect = video.getBoundingClientRect()
        const screenWidth = window.innerWidth
        const videoLeftEdge = (screenWidth - videoRect.width) / 2
        instructionElement.style.maxWidth = `${videoLeftEdge - 3}px`
      }

      // Set up adaptive font sizing for distance check instructions
      let cleanupFontAdjustment = setupDistanceCheckFontAdjustment()

      //wait for return key press
      await new Promise(async resolve => {
        if (!calibrateTrackDistanceCheckSecs)
          calibrateTrackDistanceCheckSecs = 0

        setTimeout(async () => {
          // Store the last captured face image
          let lastCapturedFaceImage = null

          async function keyupListener(event) {
            if (event.key === ' ' && register) {
              // Check if iris tracking is active before proceeding
              if (!irisTrackingIsActive) {
                console.log('Iris tracking not active - ignoring space bar')
                return
              }

              // Remove the event listener immediately to prevent multiple rapid presses
              document.removeEventListener('keyup', keyupListener)
              // Remove from active listeners tracking
              const index = iterationListeners.indexOf(keyupListener)
              if (index > -1) iterationListeners.splice(index, 1)

              // Play camera shutter sound
              if (cameraShutterSound) {
                cameraShutterSound()
              }

              // Capture the video frame immediately on space press
              lastCapturedFaceImage = captureVideoFrame(RC)

              // Validate face mesh data with retry mechanism
              const faceValidation = await validateFaceMeshSamples(
                RC,
                calibrateTrackDistancePupil,
              )

              if (!faceValidation.isValid) {
                console.log(
                  '=== FACE MESH VALIDATION FAILED - SHOWING RETRY POPUP ===',
                )

                // Show face blocked popup
                await showFaceBlockedPopup(RC, lastCapturedFaceImage)

                // Clean up the captured image for privacy
                lastCapturedFaceImage = null

                // Re-add the space key listener after popup closes for retry
                document.addEventListener('keyup', keyupListener)
                // Track this listener for cleanup
                iterationListeners.push(keyupListener)

                // Don't resolve - let user try again
                console.log('=== RETRYING FACE MESH VALIDATION ===')
                return
              }

              // Face mesh validation passed - proceed with measurement
              console.log(
                '=== FACE MESH VALIDATION PASSED - SAVING MEASUREMENT ===',
              )
              register = false

              // Re-add the listener (though register=false will prevent processing)
              document.addEventListener('keyup', keyupListener)
              // Track this listener for cleanup
              iterationListeners.push(keyupListener)

              // Determine which distance to save based on calibrateTrackDistanceChecking option
              let measuredDistanceCm = RC.viewingDistanceCm.value // Default to eye-to-camera

              if (
                calibrateTrackDistanceChecking &&
                typeof calibrateTrackDistanceChecking === 'string'
              ) {
                const optionsArray = calibrateTrackDistanceChecking
                  .toLowerCase()
                  .split(',')
                  .map(s => s.trim())

                // If includes "camera", use eye-to-camera distance (distanceCm)
                if (optionsArray.includes('camera')) {
                  measuredDistanceCm =
                    RC.improvedDistanceTrackingData?.distanceCm ||
                    RC.viewingDistanceCm.value
                }
                // If includes "center", use eye-to-center distance (distanceCm_left or distanceCm_right based on nearEye)
                if (optionsArray.includes('center')) {
                  const nearEye =
                    RC.improvedDistanceTrackingData?.nearEye || 'left'
                  if (nearEye === 'left') {
                    measuredDistanceCm =
                      RC.improvedDistanceTrackingData?.left?.distanceCm ||
                      RC.viewingDistanceCm.value
                  } else {
                    measuredDistanceCm =
                      RC.improvedDistanceTrackingData?.right?.distanceCm ||
                      RC.viewingDistanceCm.value
                  }
                }
              }

              const distanceFromRC = Number(measuredDistanceCm.toFixed(1))

              // Use the validated face mesh samples for IPD data (average of valid samples)
              const validSamples = faceValidation.samples.filter(
                sample => !isNaN(sample),
              )
              const averageIPD =
                validSamples.length > 0
                  ? Math.round(
                      validSamples.reduce((a, b) => a + b, 0) /
                        validSamples.length,
                    )
                  : null

              RC.calibrateTrackDistanceMeasuredCm.push(distanceFromRC)
              RC.calibrateTrackDistanceRequestedCm.push(
                Number(
                  RC.equipment?.value?.unit === 'inches'
                    ? (cm * 2.54).toFixed(1)
                    : cm.toFixed(1),
                ),
              )
              const EyeFeetXYPxLeft = faceValidation.nearestXYPx_left
              const EyeFeetXYPxRight = faceValidation.nearestXYPx_right

              // Store the averaged IPD pixels from validation test
              RC.calibrateTrackDistanceIPDPixels.push(averageIPD)
              RC.calibrateTrackDistanceEyeFeetXYPx.push(
                EyeFeetXYPxLeft,
                EyeFeetXYPxRight,
              )
              RC.calibrateTrackDistanceRequestedDistances.push(
                Number(
                  RC.equipment?.value?.unit === 'inches'
                    ? (cm * 2.54).toFixed(1)
                    : cm.toFixed(1),
                ),
              )
              const requestedEyesToPointCm = Number(
                RC.equipment?.value?.unit === 'inches'
                  ? (cm * 2.54).toFixed(1)
                  : cm.toFixed(1),
              )
              const requestedEyesToFootCm = Math.sqrt(
                requestedEyesToPointCm * requestedEyesToPointCm -
                  parseFloat(faceValidation.footToCameraCm) *
                    parseFloat(faceValidation.footToCameraCm),
              )
              const requestedEyesToCameraCm = Math.sqrt(
                requestedEyesToFootCm * requestedEyesToFootCm +
                  parseFloat(faceValidation.footToCameraCm) *
                    parseFloat(faceValidation.footToCameraCm),
              )
              const measuredFactorCameraPxCm =
                requestedEyesToCameraCm * parseFloat(faceValidation.ipdPixels)
              RC.distanceCheckJSON.distanceChecks.push({
                requestedEyesToPointCm: Number(
                  RC.equipment?.value?.unit === 'inches'
                    ? (cm * 2.54).toFixed(1)
                    : cm.toFixed(1),
                ),
                eyesToCameraCm: faceValidation.eyeToCameraCm,
                eyesToPointCm: faceValidation.eyeToCameraCm,
                eyesToCenterCm: faceValidation.eyeToCenterCm,
                footToCameraCm: faceValidation.footToCameraCm,
                footToCenterCm: faceValidation.footToCenterCm,
                footToPointCm: faceValidation.footToCameraCm,
                ipdCameraPx: faceValidation.ipdPixels,
                rightEyeFeetXYPx: [
                  faceValidation.nearestXYPx_right[0].toFixed(0),
                  faceValidation.nearestXYPx_right[1].toFixed(0),
                ],
                leftEyeFeetXYPx: [
                  faceValidation.nearestXYPx_left[0].toFixed(0),
                  faceValidation.nearestXYPx_left[1].toFixed(0),
                ],
                footXYPx: faceValidation.footXYPx,
                measuredFactorCameraPxCm: measuredFactorCameraPxCm.toFixed(0),
              })

              // Clean up the captured image for privacy
              lastCapturedFaceImage = null

              document.removeEventListener('keydown', keyupListener)
              removeKeypadHandler()
              cleanupFontAdjustment() // Clean up font adjustment listeners
              resolve()
            }
            //check for the x key to skip
            else if (event.key === 'x' && register) {
              register = false
              skippedDistancesCount++
              //remove distance from requested list
              calibrateTrackDistanceCheckCm.splice(i, 1)
              i--
              document.removeEventListener('keydown', keyupListener)
              removeKeypadHandler()
              cleanupFontAdjustment() // Clean up font adjustment listeners
              resolve()
            }
          }
          const removeKeypadHandler = setUpEasyEyesKeypadHandler(
            null,
            RC.keypadHandler,
            async value => {
              if (value === 'space') {
                // Check if iris tracking is active before proceeding
                if (!irisTrackingIsActive) {
                  console.log(
                    'Iris tracking not active - ignoring space keypad',
                  )
                  return
                }

                // Play camera shutter sound
                if (cameraShutterSound) {
                  cameraShutterSound()
                }

                // Capture the video frame immediately on space press
                lastCapturedFaceImage = captureVideoFrame(RC)

                // Validate face mesh data with retry mechanism
                const faceValidation = await validateFaceMeshSamples(
                  RC,
                  calibrateTrackDistancePupil,
                )

                if (!faceValidation.isValid) {
                  console.log(
                    '=== KEYPAD: FACE MESH VALIDATION FAILED - SHOWING RETRY POPUP ===',
                  )

                  // Show face blocked popup
                  await showFaceBlockedPopup(RC, lastCapturedFaceImage)

                  // Clean up the captured image for privacy
                  lastCapturedFaceImage = null

                  // Don't resolve - let user try again
                  console.log('=== KEYPAD: RETRYING FACE MESH VALIDATION ===')
                  return
                }

                // Face mesh validation passed - proceed with measurement
                console.log(
                  '=== KEYPAD: FACE MESH VALIDATION PASSED - SAVING MEASUREMENT ===',
                )

                // Determine which distance to save based on calibrateTrackDistanceChecking option
                let measuredDistanceCm = RC.viewingDistanceCm.value // Default to eye-to-camera

                if (
                  calibrateTrackDistanceChecking &&
                  typeof calibrateTrackDistanceChecking === 'string'
                ) {
                  const optionsArray = calibrateTrackDistanceChecking
                    .toLowerCase()
                    .split(',')
                    .map(s => s.trim())

                  // If includes "camera", use eye-to-camera distance (distanceCm)
                  if (optionsArray.includes('camera')) {
                    measuredDistanceCm =
                      RC.improvedDistanceTrackingData?.distanceCm ||
                      RC.viewingDistanceCm.value
                  }
                  // If includes "center", use eye-to-center distance (distanceCm_left or distanceCm_right based on nearEye)
                  if (optionsArray.includes('center')) {
                    const nearEye =
                      RC.improvedDistanceTrackingData?.nearEye || 'left'
                    if (nearEye === 'left') {
                      measuredDistanceCm =
                        RC.improvedDistanceTrackingData?.left?.distanceCm ||
                        RC.viewingDistanceCm.value
                    } else {
                      measuredDistanceCm =
                        RC.improvedDistanceTrackingData?.right?.distanceCm ||
                        RC.viewingDistanceCm.value
                    }
                  }
                }

                const distanceFromRC = Number(measuredDistanceCm.toFixed(1))

                // Use the validated face mesh samples for IPD data (average of valid samples)
                const validSamples = faceValidation.samples.filter(
                  sample => !isNaN(sample),
                )
                const averageIPD =
                  validSamples.length > 0
                    ? Math.round(
                        validSamples.reduce((a, b) => a + b, 0) /
                          validSamples.length,
                      )
                    : null

                RC.calibrateTrackDistanceMeasuredCm.push(distanceFromRC)
                RC.calibrateTrackDistanceRequestedCm.push(
                  RC.equipment?.value?.unit === 'inches'
                    ? (cm * 2.54).toFixed(1)
                    : cm.toFixed(1),
                )

                const EyeFeetXYPxLeft = faceValidation.nearestXYPx_left
                const EyeFeetXYPxRight = faceValidation.nearestXYPx_right
                RC.calibrateTrackDistanceEyeFeetXYPx.push(
                  EyeFeetXYPxLeft,
                  EyeFeetXYPxRight,
                )

                // Store the averaged IPD pixels from validation test
                RC.calibrateTrackDistanceIPDPixels.push(averageIPD)
                RC.calibrateTrackDistanceRequestedDistances.push(
                  Number(
                    RC.equipment?.value?.unit === 'inches'
                      ? (cm * 2.54).toFixed(1)
                      : cm.toFixed(1),
                  ),
                )

                const requestedEyesToPointCm = Number(
                  RC.equipment?.value?.unit === 'inches'
                    ? (cm * 2.54).toFixed(1)
                    : cm.toFixed(1),
                )
                const requestedEyesToFootCm = Math.sqrt(
                  requestedEyesToPointCm * requestedEyesToPointCm -
                    parseFloat(faceValidation.footToCameraCm) *
                      parseFloat(faceValidation.footToCameraCm),
                )
                const requestedEyesToCameraCm = Math.sqrt(
                  requestedEyesToFootCm * requestedEyesToFootCm +
                    parseFloat(faceValidation.footToCameraCm) *
                      parseFloat(faceValidation.footToCameraCm),
                )
                const measuredFactorCameraPxCm =
                  requestedEyesToCameraCm * parseFloat(faceValidation.ipdPixels)
                RC.distanceCheckJSON.distanceChecks.push({
                  requestedEyesToPointCm: Number(
                    RC.equipment?.value?.unit === 'inches'
                      ? (cm * 2.54).toFixed(1)
                      : cm.toFixed(1),
                  ),
                  eyesToCameraCm: faceValidation.eyeToCameraCm,
                  eyesToPointCm: faceValidation.eyeToCameraCm,
                  eyesToCenterCm: faceValidation.eyeToCenterCm,
                  footToCameraCm: faceValidation.footToCameraCm,
                  footToCenterCm: faceValidation.footToCenterCm,
                  footToPointCm: faceValidation.footToCameraCm,
                  ipdCameraPx: faceValidation.ipdPixels,
                  rightEyeFeetXYPx: [
                    faceValidation.nearestXYPx_right[0].toFixed(0),
                    faceValidation.nearestXYPx_right[1].toFixed(0),
                  ],
                  leftEyeFeetXYPx: [
                    faceValidation.nearestXYPx_left[0].toFixed(0),
                    faceValidation.nearestXYPx_left[1].toFixed(0),
                  ],
                  footXYPx: faceValidation.footXYPx,
                  measuredFactorCameraPxCm: measuredFactorCameraPxCm.toFixed(0),
                })

                // Clean up the captured image for privacy
                lastCapturedFaceImage = null

                removeKeypadHandler()
                cleanupFontAdjustment() // Clean up font adjustment listeners
                document.removeEventListener('keyup', keyupListener)
                resolve()
              }
              //check for the x key to skip
              else if (value === '❌') {
                skippedDistancesCount++
                //remove distance from requested list
                calibrateTrackDistanceCheckCm.splice(i, 1)
                i--
                removeKeypadHandler()
                cleanupFontAdjustment() // Clean up font adjustment listeners
                document.removeEventListener('keyup', keyupListener)
                resolve()
              }
            },
            false,
            ['space', '❌'],
            RC,
            true,
          )

          document.addEventListener('keyup', keyupListener)
          // Track this listener for cleanup
          iterationListeners.push(keyupListener)
        }, calibrateTrackDistanceCheckSecs * 1000)
      })
    }

    removeProgressBar(RC, calibrateTrackDistanceChecking)
    removeViewingDistanceDiv()

    // Hide video container after all measurements are complete
    const videoContainer = document.getElementById('webgazerVideoContainer')
    if (videoContainer) {
      videoContainer.style.display = 'none'
    }

    // Log the captured IPD data for debugging
    console.log('=== IPD Data Captured During Distance Checking ===')
    console.log(
      'Total measurements:',
      RC.calibrateTrackDistanceIPDPixels.length,
    )
    console.log('IPD Pixels Array:', RC.calibrateTrackDistanceIPDPixels)
    console.log(
      'Requested Distances Array (cm):',
      RC.calibrateTrackDistanceRequestedDistances,
    )
    console.log(
      'Measured Distances Array (cm):',
      RC.calibrateTrackDistanceMeasuredCm,
    )
    console.log('=================================================')

    //join the arrays into a string
    //show thank you message
    await Swal.fire({
      ...swalInfoOptions(RC, {
        showIcon: false,
      }),
      title:
        '<p class="heading2">' +
        phrases.RC_AllDistancesRecorded[RC.language.value].replace(
          '[[N11]]',
          RC.calibrateTrackDistanceRequestedCm.length,
        ) +
        '</p>',
      didOpen: () => {
        if (RC.keypadHandler) {
          const removeKeypadHandler = setUpEasyEyesKeypadHandler(
            null,
            RC.keypadHandler,
            () => {
              removeKeypadHandler()
              Swal.clickConfirm()
            },
            false,
            ['space'],
            RC,
          )
        }
      },
    })

    RC.resumeNudger()
  }
  quit()
}

// Function to create the div and start updating the value
const createViewingDistanceDiv = () => {
  // Check if the div already exists
  if (document.getElementById('viewing-distance-div')) {
    console.warn('Viewing distance div already exists.')
    return
  }

  const distanceContainer = document.createElement('viewing-distance-div')
  distanceContainer.id =
    'calibration-trackDistance-check-viewingDistance-container'
  distanceContainer.className =
    'calibration-trackDistance-check-viewingDistance-container'

  // Create the div element
  const viewingDistanceDiv = document.createElement('p')
  viewingDistanceDiv.id = 'viewing-distance-p'
  viewingDistanceDiv.className =
    'calibration-trackDistance-check-viewingDistance'

  //create p for units
  const units = document.createElement('p')
  units.id = 'calibration-trackDistance-check-viewingDistance-units'
  units.className = 'calibration-trackDistance-check-viewingDistance-units'

  // Append to the body
  distanceContainer.appendChild(viewingDistanceDiv)
  distanceContainer.appendChild(units)
  document.body.appendChild(distanceContainer)
}

const removeViewingDistanceDiv = () => {
  const viewingDistanceDiv = document.getElementById('viewing-distance-p')
  const unitsDiv = document.getElementById(
    'calibration-trackDistance-check-viewingDistance-units',
  )
  const distanceContainer = document.getElementById(
    'calibration-trackDistance-check-viewingDistance-container',
  )

  if (viewingDistanceDiv) {
    viewingDistanceDiv.remove()
  }

  if (unitsDiv) {
    unitsDiv.remove()
  }

  if (distanceContainer) {
    distanceContainer.remove()
  }
}

const adjustFontSize = (distanceDiv, unitsDiv) => {
  const container = distanceDiv.parentElement
  const containerWidth = container.offsetWidth
  const containerHeight = container.offsetHeight

  let fontSize = containerWidth // Start with the width as a base for font size
  distanceDiv.style.fontSize = `${fontSize}px`
  unitsDiv.style.fontSize = `${fontSize * 0.5}px`

  // Adjust dynamically to prevent overflow in width or height
  while (
    (distanceDiv.scrollWidth > containerWidth ||
      unitsDiv.scrollWidth > containerWidth ||
      distanceDiv.offsetHeight + unitsDiv.offsetHeight > containerHeight) &&
    fontSize > 10
  ) {
    fontSize -= 1
    distanceDiv.style.fontSize = `${fontSize}px`
    unitsDiv.style.fontSize = `${fontSize * 0.5}px`
  }
}

const updateViewingDistanceDiv = (distance, units) => {
  const viewingDistanceDiv = document.getElementById('viewing-distance-p')

  if (!viewingDistanceDiv) {
    console.warn(
      'Viewing distance div does not exist. Call createViewingDistanceDiv() first.',
    )
    return
  }

  viewingDistanceDiv.innerText = distance

  const unitsDiv = document.getElementById(
    'calibration-trackDistance-check-viewingDistance-units',
  )

  if (!unitsDiv) {
    console.warn('Units div does not exist.')
    return
  }

  unitsDiv.innerText = units

  adjustFontSize(viewingDistanceDiv, unitsDiv)
}

// Function to create the progress bar div
const createProgressBar = (RC, calibrateTrackDistanceChecking = undefined) => {
  // Check if the progress bar already exists
  if (document.getElementById('custom-progress-bar')) {
    console.warn('Progress bar already exists.')
    return
  }

  // Create the progress bar container
  const progressBarContainer = document.createElement('div')
  progressBarContainer.id = 'custom-progress-bar'
  progressBarContainer.className =
    'calibration-trackDistance-check-progessBar-container'

  // Create the progress bar element
  const progressBar = document.createElement('div')
  progressBar.id = 'calibration-trackDistance-check-progessBar'
  progressBar.className = 'calibration-trackDistance-check-progessBar'

  const progressBarText = document.createElement('p')
  progressBarText.id = 'calibration-trackDistance-check-progessBar-text'
  progressBarText.className = 'calibration-trackDistance-check-progessBar-text'

  // Append the progress bar to the container
  progressBarContainer.appendChild(progressBar)
  progressBarContainer.appendChild(progressBarText)
  document.body.appendChild(progressBarContainer)

  // Reposition video based on calibrateTrackDistanceChecking option
  const videoContainer = document.getElementById('webgazerVideoContainer')
  if (videoContainer && RC) {
    // Check if option includes "camera" - if so, position at cameraXYPx (top center)
    const checkingOptions = calibrateTrackDistanceChecking
    let shouldPositionAtCamera = false

    if (checkingOptions && typeof checkingOptions === 'string') {
      const optionsArray = checkingOptions
        .toLowerCase()
        .split(',')
        .map(s => s.trim())
      shouldPositionAtCamera = optionsArray.includes('camera')
    }

    if (shouldPositionAtCamera) {
      // Position video at cameraXYPx (top center of screen)
      // cameraXYPx is defined as [window.innerWidth / 2, 0]
      const cameraXYPx = [window.innerWidth / 2, 0]

      videoContainer.style.zIndex = '999999999999'
      videoContainer.style.position = 'fixed'

      if (RC.isMobile.value) {
        // Mobile - keep standard positioning
        videoContainer.style.left = 'unset'
        videoContainer.style.right = RC._CONST.N.VIDEO_MARGIN
        videoContainer.style.top = '0px'
        videoContainer.style.bottom = 'unset'
      } else {
        // Desktop - position at top center (cameraXYPx)
        const videoWidth =
          parseInt(videoContainer.style.width) ||
          videoContainer.offsetWidth ||
          0

        // Center horizontally at cameraXYPx[0]
        videoContainer.style.left = `${cameraXYPx[0] - videoWidth / 2}px`
        videoContainer.style.right = 'unset'

        // Position at top (cameraXYPx[1] = 0)
        videoContainer.style.top = `${cameraXYPx[1]}px`
        videoContainer.style.bottom = 'unset'
        videoContainer.style.transform = 'none'
      }
    } else {
      // Default positioning (centered on screen)
      setDefaultVideoPosition(RC, videoContainer)
    }
  }
}

// Function to update the progress
const updateProgressBar = (progress, current, total) => {
  const progressBar = document.getElementById(
    'calibration-trackDistance-check-progessBar',
  )

  //update the progress bar text
  const progressBarText = document.getElementById(
    'calibration-trackDistance-check-progessBar-text',
  )

  if (!progressBar || !progressBarText) {
    console.warn('Progress bar does not exist. Call createProgressBar() first.')
    return
  }

  // Ensure progress is within bounds [0, 100]
  const sanitizedProgress = Math.min(100, Math.max(0, progress))
  progressBar.style.width = `${sanitizedProgress}%`

  progressBarText.innerText = `${current}/${total}`
}

// Function to remove the progress bar
const removeProgressBar = (RC, calibrateTrackDistanceChecking = undefined) => {
  const progressBarContainer = document.getElementById('custom-progress-bar')
  if (progressBarContainer) {
    document.body.removeChild(progressBarContainer)

    // Reposition video based on calibrateTrackDistanceChecking option
    const videoContainer = document.getElementById('webgazerVideoContainer')
    if (videoContainer && RC) {
      // Check if option includes "camera" - if so, don't reposition (keep camera position)
      const checkingOptions = calibrateTrackDistanceChecking
      let shouldPositionAtCamera = false

      if (checkingOptions && typeof checkingOptions === 'string') {
        const optionsArray = checkingOptions
          .toLowerCase()
          .split(',')
          .map(s => s.trim())
        shouldPositionAtCamera = optionsArray.includes('camera')
      }

      if (!shouldPositionAtCamera) {
        // Only reposition to default if NOT using camera positioning
        setDefaultVideoPosition(RC, videoContainer)
      }
      // If shouldPositionAtCamera is true, don't call setDefaultVideoPosition
      // The video will stay at the camera position
    }
  } else {
    console.warn('Progress bar does not exist.')
  }

  // Global cleanup: Space bar listeners are cleaned up as each iteration completes
  // Each iteration tracks its own listeners and removes them when done
  console.log('=== CHECK DISTANCE CLEANUP COMPLETE ===')
}
