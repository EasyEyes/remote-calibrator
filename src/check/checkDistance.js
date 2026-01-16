import RemoteCalibrator, { env } from '../core'
import { takeInput } from '../components/checkInput'
import {
  constructInstructions,
  getCameraResolutionXY,
  safeExecuteFunc,
  sleep,
} from '../components/utils'
import { remoteCalibratorPhrases } from '../i18n/phrases'
import { setUpEasyEyesKeypadHandler } from '../extensions/keypadHandler'
import { phrases } from '../i18n/schema'
import Swal from 'sweetalert2'
import { swalInfoOptions } from '../components/swalOptions'
import { setDefaultVideoPosition } from '../components/video'
import {
  buildStepInstructions,
  createStepInstructionsUI,
  renderStepInstructions,
} from '../distance/stepByStepInstructionHelps'
import { parseInstructions } from '../distance/instructionParserAdapter'
import { resolveInstructionMediaUrl } from '../distance/instructionMediaCache'
import { test_phrases, test_assetMap } from '../distance/assetMap'
import { irisTrackingIsActive } from '../distance/distanceTrack'

// Debug: Log what's imported
console.log('📦 checkDistance.js imports:', {
  test_phrases_exists: !!test_phrases,
  test_phrases_keys: test_phrases ? Object.keys(test_phrases) : [],
  test_phrases_sample: test_phrases?.RC_produceDistance_MD,
  test_assetMap_exists: !!test_assetMap,
})
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

// Helper function to create/show fixation cross on video
const createFixationCrossOnVideo = () => {
  // Remove existing cross if any
  const existingCross = document.getElementById('video-fixation-cross')
  if (existingCross) {
    existingCross.parentNode.removeChild(existingCross)
  }

  const videoContainer = document.getElementById('webgazerVideoContainer')
  if (!videoContainer) return null

  // Create cross container
  const crossContainer = document.createElement('div')
  crossContainer.id = 'video-fixation-cross'
  crossContainer.style.position = 'absolute'
  crossContainer.style.top = '50%'
  crossContainer.style.left = '50%'
  crossContainer.style.transform = 'translate(-50%, -50%)'
  crossContainer.style.pointerEvents = 'none'
  crossContainer.style.zIndex = '999999999999'

  // Create horizontal line
  const horizontalLine = document.createElement('div')
  horizontalLine.style.position = 'absolute'
  horizontalLine.style.width = '32px'
  horizontalLine.style.height = '3px'
  horizontalLine.style.backgroundColor = '#ac0d0d'
  horizontalLine.style.left = '50%'
  horizontalLine.style.top = '50%'
  horizontalLine.style.transform = 'translate(-50%, -50%)'

  // Create vertical line
  const verticalLine = document.createElement('div')
  verticalLine.style.position = 'absolute'
  verticalLine.style.width = '3px'
  verticalLine.style.height = '32px'
  verticalLine.style.backgroundColor = '#ac0d0d'
  verticalLine.style.left = '50%'
  verticalLine.style.top = '50%'
  verticalLine.style.transform = 'translate(-50%, -50%)'

  crossContainer.appendChild(horizontalLine)
  crossContainer.appendChild(verticalLine)
  videoContainer.appendChild(crossContainer)

  return crossContainer
}

// Helper function to remove fixation cross from video
const removeFixationCrossFromVideo = () => {
  const cross = document.getElementById('video-fixation-cross')
  if (cross && cross.parentNode) {
    cross.parentNode.removeChild(cross)
  }
}

// Helper function to reposition video based on camera monitoring option
const repositionVideoForCameraMonitoring = (RC, calibrateDistanceChecking) => {
  if (!RC || !calibrateDistanceChecking) return

  const videoContainer = document.getElementById('webgazerVideoContainer')
  if (!videoContainer) return

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

  if (shouldPositionAtCamera) {
    // Mark video container as being in camera mode (prevents setDefaultVideoPosition from overriding)
    videoContainer.dataset.cameraMode = 'true'

    // Position video at cameraXYPx (top center of screen)
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
        parseInt(videoContainer.style.width) || videoContainer.offsetWidth || 0

      // Center horizontally at cameraXYPx[0]
      videoContainer.style.left = `${cameraXYPx[0] - videoWidth / 2}px`
      videoContainer.style.right = 'unset'

      // Position at top (cameraXYPx[1] = 0)
      videoContainer.style.top = `${cameraXYPx[1]}px`
      videoContainer.style.bottom = 'unset'
      videoContainer.style.transform = 'none'
    }

    // Add fixation cross centered on video only if tiltandswivel is included
    if (shouldShowCross) {
      createFixationCrossOnVideo()
    } else {
      removeFixationCrossFromVideo()
    }
  } else {
    // Clear camera mode flag
    delete videoContainer.dataset.cameraMode

    // Default positioning (centered on screen)
    setDefaultVideoPosition(RC, videoContainer)
    // Remove cross if not in camera mode
    removeFixationCrossFromVideo()
  }
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
// DISABLED: Title now uses default h1 styling to match object test page 2
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
  // const baseTitleSize = 2.5 * baseFontSize // 40px (2.5rem) - DISABLED

  // Calculate scale factor based on window width
  let scaleFactor = 1.0
  if (windowWidth < 1200) {
    scaleFactor = Math.max(0.05, windowWidth / 1200) // Scale down from 1200px, minimum 5%
  }

  // Calculate font sizes
  // const titleFontSize = Math.round(baseTitleSize * scaleFactor) - DISABLED
  const bodyFontSize = Math.round(baseBodySize * scaleFactor)

  console.log(
    `Size check - Scale factor: ${scaleFactor.toFixed(2)}, Body: ${bodyFontSize}px`,
  )

  // Apply font sizes - Title styling removed to use default h1
  // if (titleElement) {
  //   titleElement.style.fontSize = `${titleFontSize}px`
  //   titleElement.style.lineHeight = windowWidth <= 480 ? '120%' : '100%'
  // }

  if (bodyElement) {
    bodyElement.style.fontSize = `${bodyFontSize}px`
    bodyElement.style.lineHeight = '1.6'
  }
}

// Helper function to set up distance check font size adjustment
const setupDistanceCheckFontAdjustment = (
  RC = null,
  calibrateDistanceChecking = undefined,
) => {
  console.log('Setting up distance check font adjustment')

  // Initial adjustment
  adjustDistanceCheckFontSize()

  // Set up resize listener with immediate execution (no debounce for testing)
  const resizeHandler = () => {
    console.log('Resize event detected')
    adjustDistanceCheckFontSize()

    // Reposition video to maintain camera monitoring position after resize
    if (RC && calibrateDistanceChecking) {
      repositionVideoForCameraMonitoring(RC, calibrateDistanceChecking)
    }
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
  calibrateDistancePupil = 'iris',
  calibrateDistanceChecking = 'camera',
) => {
  const samples = []

  // Accumulators for averaging over valid samples
  let ipdPixelsSum = 0
  let ipdPixelsCount = 0

  let leftXSum = 0
  let leftYSum = 0
  let leftCount = 0

  let rightXSum = 0
  let rightYSum = 0
  let rightCount = 0

  let eyeToCameraSum = 0
  let eyeToCameraCount = 0

  let eyeToCenterSum = 0
  let eyeToCenterCount = 0

  let eyeToPointSum = 0
  let eyeToPointCount = 0

  let eyeToFootSum = 0
  let eyeToFootCount = 0

  let footToCameraSum = 0
  let footToCameraCount = 0

  let footToCenterSum = 0
  let footToCenterCount = 0

  let footToPointSum = 0
  let footToPointCount = 0

  let calibrationFactorSum = 0
  let calibrationFactorCount = 0

  let footXXSum = 0
  let footYYSum = 0
  let footXYCount = 0

  let pointXXSum = 0
  let pointYYSum = 0
  let pointXYCount = 0

  // Collect exactly 5 samples, using NaN for failed measurements
  for (let i = 0; i < 5; i++) {
    try {
      const ipdData = await captureIPDFromFaceMesh(
        RC,
        calibrateDistancePupil,
        calibrateDistanceChecking,
      )
      if (ipdData && ipdData.ipdPixels && !isNaN(ipdData.ipdPixels)) {
        samples.push(ipdData.ipdPixels)
        ipdPixelsSum += ipdData.ipdPixels
        ipdPixelsCount++

        if (
          ipdData.nearestXYPx_left &&
          ipdData.nearestXYPx_left.length > 0 &&
          !isNaN(ipdData.nearestXYPx_left[0]) &&
          !isNaN(ipdData.nearestXYPx_left[1])
        ) {
          leftXSum += Number(ipdData.nearestXYPx_left[0])
          leftYSum += Number(ipdData.nearestXYPx_left[1])
          leftCount++
        }
        if (
          ipdData.nearestXYPx_right &&
          ipdData.nearestXYPx_right.length > 0 &&
          !isNaN(ipdData.nearestXYPx_right[0]) &&
          !isNaN(ipdData.nearestXYPx_right[1])
        ) {
          rightXSum += Number(ipdData.nearestXYPx_right[0])
          rightYSum += Number(ipdData.nearestXYPx_right[1])
          rightCount++
        }

        if (ipdData.eyeToCameraCm && !isNaN(ipdData.eyeToCameraCm)) {
          eyeToCameraSum += Number(ipdData.eyeToCameraCm)
          eyeToCameraCount++
        }

        if (ipdData.eyeToCenterCm && !isNaN(ipdData.eyeToCenterCm)) {
          eyeToCenterSum += Number(ipdData.eyeToCenterCm)
          eyeToCenterCount++
        }

        if (ipdData.eyeToPointCm && !isNaN(ipdData.eyeToPointCm)) {
          eyeToPointSum += Number(ipdData.eyeToPointCm)
          eyeToPointCount++
        }

        if (ipdData.footToCameraCm && !isNaN(ipdData.footToCameraCm)) {
          footToCameraSum += Number(ipdData.footToCameraCm)
          footToCameraCount++
        }

        if (ipdData.footToCenterCm && !isNaN(ipdData.footToCenterCm)) {
          footToCenterSum += Number(ipdData.footToCenterCm)
          footToCenterCount++
        }

        if (ipdData.footToPointCm && !isNaN(ipdData.footToPointCm)) {
          footToPointSum += Number(ipdData.footToPointCm)
          footToPointCount++
        }

        if (ipdData.calibrationFactor && !isNaN(ipdData.calibrationFactor)) {
          calibrationFactorSum += Number(ipdData.calibrationFactor)
          calibrationFactorCount++
        }

        if (ipdData.eyeToFootCm && !isNaN(ipdData.eyeToFootCm)) {
          eyeToFootSum += Number(ipdData.eyeToFootCm)
          eyeToFootCount++
        }

        if (
          ipdData.footXYPx &&
          !isNaN(ipdData.footXYPx[0]) &&
          !isNaN(ipdData.footXYPx[1])
        ) {
          footXXSum += Number(ipdData.footXYPx[0])
          footYYSum += Number(ipdData.footXYPx[1])
          footXYCount++
        }

        if (
          ipdData.pointXYPx &&
          !isNaN(ipdData.pointXYPx[0]) &&
          !isNaN(ipdData.pointXYPx[1])
        ) {
          pointXXSum += Number(ipdData.pointXYPx[0])
          pointYYSum += Number(ipdData.pointXYPx[1])
          pointXYCount++
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

  // Compute averaged results
  const nearestXYPx_left =
    leftCount > 0
      ? [Math.round(leftXSum / leftCount), Math.round(leftYSum / leftCount)]
      : null
  const nearestXYPx_right =
    rightCount > 0
      ? [Math.round(rightXSum / rightCount), Math.round(rightYSum / rightCount)]
      : null

  const eyeToCameraCm =
    eyeToCameraCount > 0
      ? Math.round((eyeToCameraSum / eyeToCameraCount) * 10) / 10
      : null
  const eyeToCenterCm =
    eyeToCenterCount > 0
      ? Math.round((eyeToCenterSum / eyeToCenterCount) * 10) / 10
      : null
  const eyeToPointCm =
    eyeToPointCount > 0
      ? Math.round((eyeToPointSum / eyeToPointCount) * 10) / 10
      : null

  const footToCameraCm =
    footToCameraCount > 0
      ? Math.round((footToCameraSum / footToCameraCount) * 10) / 10
      : null
  const footToCenterCm =
    footToCenterCount > 0
      ? Math.round((footToCenterSum / footToCenterCount) * 10) / 10
      : null
  const footToPointCm =
    footToPointCount > 0
      ? Math.round((footToPointSum / footToPointCount) * 10) / 10
      : null

  const calibrationFactor =
    calibrationFactorCount > 0
      ? Math.round(calibrationFactorSum / calibrationFactorCount)
      : null

  const eyeToFootCm =
    eyeToFootCount > 0
      ? Math.round((eyeToFootSum / eyeToFootCount) * 10) / 10
      : null

  const footXYPx =
    footXYCount > 0
      ? [
          Math.round(footXXSum / footXYCount),
          Math.round(footYYSum / footXYCount),
        ]
      : null
  const pointXYPx =
    pointXYCount > 0
      ? [
          Math.round(pointXXSum / pointXYCount),
          Math.round(pointYYSum / pointXYCount),
        ]
      : null
  const ipdPixels =
    ipdPixelsCount > 0
      ? Math.round((ipdPixelsSum / ipdPixelsCount) * 10) / 10
      : null

  return {
    isValid,
    samples,
    validCount: validSamples.length,
    nearestXYPx_left,
    nearestXYPx_right,
    eyeToCameraCm,
    eyeToCenterCm,
    eyeToPointCm,
    footToCameraCm,
    footToPointCm,
    footToCenterCm,
    calibrationFactor,
    footXYPx,
    ipdPixels,
    pointXYPx,
    eyeToFootCm,
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
  calibrateDistancePupil = 'iris',
  calibrateDistanceChecking = 'camera',
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
      calibrateDistancePupil,
    )

    // Calculate IPD in pixels
    const ipdPixels = eyeDist(leftEye, rightEye)
    // Convert to cm if we have screen PPI
    let ipdCm = null
    if (RC.screenPpi && RC.screenPpi.value) {
      // Use the same conversion logic as in distance tracking
      const VpxPerCm = ipdPixels / RC._CONST.IPD_CM
      ipdCm = ipdPixels / VpxPerCm
    }
    let webcamToEyeDistance = stdDist.current.calibrationFactor / ipdPixels
    if (
      RC.useObjectTestData === 'justCreditCard' ||
      RC.useObjectTestData === 'autoCreditCard'
    ) {
      try {
        webcamToEyeDistance =
          (RC.fRatio * RC.getHorizontalVpx() * RC._CONST.IPD_CM) / ipdPixels
      } catch (error) {
        console.error('Error calculating webcamToEyeDistance:', error)
      }
    }
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
      calibrateDistanceChecking,
    )
    const {
      nearestXYPx_left,
      nearestXYPx_right,
      eyeToCameraCm,
      eyeToPointCm,
      eyeToCenterCm,
      footToCameraCm,
      footToCenterCm,
      footToPointCm,
      calibrationFactor,
      footXYPx,
      pointXYPx,
      eyeToFootCm,
    } = nearestPoints

    return {
      ipdPixels: ipdPixels ? Number(ipdPixels.toFixed(1)) : null,
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
      eyeToPointCm,
      footToPointCm,
      footXYPx,
      pointXYPx,
      eyeToFootCm,
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
  calibrateDistanceCheckCm = [],
  callbackStatic = () => {},
  calibrateDistanceCheckSecs = 0,
  calibrateDistanceCheckLengthCm = [],
  calibrateDistanceCenterYourEyesBool = true,
  calibrateDistancePupil = 'iris',
  calibrateDistanceChecking = undefined,
  calibrateDistanceSpotXYDeg = null,
  calibrateDistance = '',
  stepperHistory = 1,
) {
  await this.getEquipment(
    async () => {
      return await trackDistanceCheck(
        this,
        distanceCallback,
        distanceData,
        measureName,
        checkCallback,
        calibrateDistanceCheckCm,
        callbackStatic,
        calibrateDistanceCheckSecs,
        calibrateDistanceCheckLengthCm,
        calibrateDistanceCenterYourEyesBool,
        calibrateDistancePupil,
        calibrateDistanceChecking,
        calibrateDistanceSpotXYDeg,
        calibrateDistance,
        stepperHistory,
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

const soundModule = require('../components/sound')
const stampOfApprovalSound = soundModule.stampOfApprovalSound

// Helper function to check if two values are within a percentage of each other
const areValuesWithinPercent = (val1, val2, percent) => {
  if (val1 === 0 && val2 === 0) return true
  const larger = Math.max(Math.abs(val1), Math.abs(val2))
  const diff = Math.abs(val1 - val2)
  return diff / larger <= percent / 100
}

const checkSize = async (
  RC,
  calibrateDistanceCheckLengthCm = [],
  calibrateDistanceChecking = undefined,
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

  // Initialize arrays to store length data (similar to distance tracking)
  RC.calibrateTrackLengthMeasuredCm = []
  RC.calibrateTrackLengthRequestedCm = []
  RC.calibrateDistancePxPerCm = []

  // Create the length display div
  createLengthDisplayDiv(RC)

  // Loop through each length value to create dynamic pages
  for (let i = 0; i < processedLengthCm.length; i++) {
    const cm = processedLengthCm[i]
    const index = i + 1

    // Update the length display with the current required length
    updateLengthDisplayDiv(cm, RC.equipment?.value?.unit)

    // Create and update instruction content
    const updateInstructionText = (currentLength, yellowTapeRef = null) => {
      const instructionTitle = phrases.RC_SetLengthTitle[RC.language.value]
        .replace('[[N11]]', index)
        .replace('[[N22]]', processedLengthCm.length)

      const instructionBody = phrases.RC_SetLength[RC.language.value]
        .replace('[[N33]]', currentLength)
        .replace('[[UUU]]', RC.equipment?.value?.unit)
        .replace(/(?:\r\n|\r|\n)/g, '<br>')

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

        // Add RTL class if language is RTL
        if (RC.LD === RC._CONST.RTL && instructionElement) {
          instructionElement.classList.add('rtl')
        }

        const video = document.getElementById('webgazerVideoContainer')
        if (instructionElement && video) {
          const videoRect = video.getBoundingClientRect()
          const screenWidth = window.innerWidth
          const videoLeftEdge = (screenWidth - videoRect.width) / 2
          instructionElement.style.maxWidth = `${videoLeftEdge - 3}px`
        }

        // Re-append yellow tape if it exists after background replacement
        if (
          yellowTapeRef &&
          yellowTapeRef.container &&
          yellowTapeRef.container.parentNode !== RC.background
        ) {
          RC.background.appendChild(yellowTapeRef.container)
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
          RC.calibrateDistancePxPerCm.push(
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
        updateInstructionText(clamped, yellowTape)
        adjustLengthFontSize(lengthDisplayInput)
      })

      lengthDisplayInput.addEventListener('blur', e => {
        const raw = e.target.value
        const numeric = parseNumeric(raw)
        if (e.target.value === '' || isNaN(numeric) || numeric < 1) {
          e.target.value = `1 ${RC.equipment?.value?.unit || ''}`
          updateInstructionText(1, yellowTape)
        } else {
          const clamped = Math.max(1, Math.min(100, numeric))
          e.target.value = `${clamped} ${RC.equipment?.value?.unit || ''}`
          updateInstructionText(clamped, yellowTape)
        }
        adjustLengthFontSize(lengthDisplayInput)
      })

      document.addEventListener('keyup', keyupListener)
      // Track this listener for cleanup
      checkSizeListeners.push(keyupListener)
    })

    // COMPLIANCE CHECK: Starting from the second setting, check for non-compliance
    // (user pressing space without actually adjusting the tape)
    if (i >= 1) {
      const currentRequestedLength = processedLengthCm[i]
      const previousRequestedLength = processedLengthCm[i - 1]

      // Only run compliance check if the REQUESTS differ by at least 20%
      // (skip if requests are within 20% of being equal)
      const requestsDifferEnough = !areValuesWithinPercent(
        currentRequestedLength,
        previousRequestedLength,
        20,
      )

      if (requestsDifferEnough) {
        // Compare the user's SETTINGS (measured lengths from yellow tape)
        const currentMeasuredLength =
          RC.calibrateTrackLengthMeasuredCm[
            RC.calibrateTrackLengthMeasuredCm.length - 1
          ]
        const previousMeasuredLength =
          RC.calibrateTrackLengthMeasuredCm[
            RC.calibrateTrackLengthMeasuredCm.length - 2
          ]

        // If settings are within 10% of being equal, this is invalid (non-compliance)
        const settingsTooSimilar = areValuesWithinPercent(
          currentMeasuredLength,
          previousMeasuredLength,
          10,
        )

        if (settingsTooSimilar) {
          console.warn(
            `Compliance check failed: User set similar lengths (${previousMeasuredLength} vs ${currentMeasuredLength}) ` +
              `despite different requests (${previousRequestedLength} vs ${currentRequestedLength})`,
          )

          // Discard all length settings so far
          RC.calibrateTrackLengthMeasuredCm = []
          RC.calibrateTrackLengthRequestedCm = []
          RC.calibrateDistancePxPerCm = []

          // Get the error message (use fallback if phrase not available)
          const errorMessage =
            phrases.RC_RejectEqualLengths?.[RC.language.value]

          // Show popup error message and wait for OK
          await Swal.fire({
            ...swalInfoOptions(RC, { showIcon: false }),
            icon: '', //no icon
            title: '', //no title
            html: errorMessage,
            allowEnterKey: true,
            focusConfirm: true, // Focus OK button so Enter key works
            confirmButtonText: phrases.RC_ok?.[RC.L],
            didOpen: () => {
              // Prevent Space key from triggering the OK button (only allow Return/Enter)
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

          // Reset loop to start from the first setting
          // Set i to -1 so the next iteration starts at i = 0
          i = -1
        }
      }
    }
  }

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
      // Remove fixation cross when not in camera mode
      removeFixationCrossFromVideo()
    } else {
      // Re-create fixation cross when returning to camera mode - only if tiltandswivel is included
      const optionsArray = checkingOptions
        .toLowerCase()
        .split(',')
        .map(s => s.trim())
      const shouldShowCross = optionsArray.includes('tiltandswivel')
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

const median = array => {
  if (!array || array.length === 0) return 0
  const sorted = array.slice().sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

const trackDistanceCheck = async (
  RC,
  distanceCallback,
  distanceData,
  measureName,
  checkCallback,
  calibrateDistanceCheckCm, // list of distances to check
  callbackStatic,
  calibrateDistanceCheckSecs = 0,
  calibrateDistanceCheckLengthCm = [], // list of lengths to check
  calibrateDistanceCenterYourEyesBool = true,
  calibrateDistancePupil = 'iris',
  calibrateDistanceChecking = 'camera',
  calibrateDistanceSpotXYDeg = null,
  calibrateDistance = '',
  stepperHistory = 1,
) => {
  const isTrack = measureName === 'trackDistance'

  // Track all space bar listeners for proper cleanup
  const activeListeners = []

  const quit = () => {
    stopVideoTrimming()
    RC._removeBackground()
    if (!isTrack) safeExecuteFunc(distanceCallback, distanceData, false)
    callbackStatic(distanceData)
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
              calibrateDistancePupil,
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
  //if the unit is inches, convert calibrateDistanceCheckCm to inches and round to integer
  //discard negative, zero, and values exceeding equipment length
  if (RC.equipment?.value?.has) {
    // Show dummy test page right after equipment is confirmed
    RC.pauseNudger()
    await checkSize(
      RC,
      calibrateDistanceCheckLengthCm,
      calibrateDistanceChecking,
    )
    RC.resumeNudger()
    // Start video trimming for screen center distance measurement
    // only trim video if calibrateDistanceCenterYourEyesBool is true AND not using camera positioning
    // Video trimming centers the video, which conflicts with camera positioning
    const checkingOptions = calibrateDistanceChecking
    let shouldPositionAtCamera = false

    if (checkingOptions && typeof checkingOptions === 'string') {
      const optionsArray = checkingOptions
        .toLowerCase()
        .split(',')
        .map(s => s.trim())
      shouldPositionAtCamera = optionsArray.includes('camera')
    }

    if (calibrateDistanceCenterYourEyesBool && !shouldPositionAtCamera) {
      startVideoTrimming()
    }

    calibrateDistanceCheckCm = calibrateDistanceCheckCm.map(cm =>
      RC.equipment?.value?.unit === 'inches'
        ? Math.round(Number(cm) / 2.54)
        : Math.round(Number(cm)),
    )

    calibrateDistanceCheckCm = calibrateDistanceCheckCm.filter(
      cm => cm > 0 && cm <= RC.equipment?.value?.length,
    )

    if (calibrateDistanceCheckCm.length === 0) {
      console.warn('No valid distances to check.')
      quit()
      return
    }

    RC._removeBackground()
    RC.pauseNudger()
    createProgressBar(RC, calibrateDistanceChecking)
    createViewingDistanceDiv(RC)
    RC.calibrateDistanceMeasuredCm = []
    RC.calibrateDistanceRequestedCm = []
    // Initialize IPD and requested distance arrays
    RC.calibrateDistanceIPDPixels = []
    RC.calibrateDistanceRequestedDistances = []
    RC.calibrateDistanceEyeFeetXYPx = []
    let skippedDistancesCount = 0
    const ppi = RC.screenPpi ? RC.screenPpi.value : RC._CONST.N.PPI_DONT_USE

    const pxPerCm = ppi / 2.54

    let cameraResolutionXY = ''
    let cameraResolutionMaxXY = ''
    if (
      RC.gazeTracker &&
      RC.gazeTracker.webgazer &&
      RC.gazeTracker.webgazer.videoParamsToReport
    ) {
      const res = getCameraResolutionXY(RC)
      const height = res[1]
      const width = res[0]
      const maxHeight = RC.gazeTracker.webgazer.videoParamsToReport.maxHeight
      const maxWidth = RC.gazeTracker.webgazer.videoParamsToReport.maxWidth
      cameraResolutionXY = `${width}x${height}`
      cameraResolutionMaxXY = `${maxWidth},${maxHeight}`
    }

    let calibrationFVpx = null
    try {
      if (stdDist.current && stdDist.current.calibrationFactor) {
        calibrationFVpx = stdDist.current.calibrationFactor / RC._CONST.IPD_CM
        calibrationFVpx = Math.round(calibrationFVpx * 10) / 10
      }
    } catch (e) {}

    RC.distanceCheckJSON = {
      rulerUnit: RC.equipment?.value?.unit,
      calibrationFVpx: calibrationFVpx, // median(calibration)
      imageBasedEyesToFootCm: [], //calibrationFVpx * ipdCm / ipdVpx
      imageBasedEyesToPointCm: [], //sqrt(imageBasedEyesToFootCm**2 + footToPoint**2)
      rulerBasedEyesToPointCm: [], //requestedEyesToPointCm
      rulerBasedEyesToFootCm: [], //sqrt(rulerBasedEyesToPointCm**2 - footToPoint**2)
      _calibrateDistanceChecking: calibrateDistanceChecking,
      _calibrateDistance: calibrateDistance,
      _calibrateDistanceSpotXYDeg: calibrateDistanceSpotXYDeg,
      _calibrateDistancePupil: calibrateDistancePupil,
      pointXYPx: [],
      cameraXYPx: [window.innerWidth / 2, 0],
      pxPerCm: Math.round(pxPerCm * 10) / 10,
      webcamMaxXYVpx: cameraResolutionMaxXY,
      cameraResolutionXYVpx: [],
      requestedEyesToPointCm: [],
      eyesToPointCm: [],
      eyesToFootCm: [],
      footToPointCm: [],
      ipdVpx: [],
      rightEyeFootXYPx: [],
      leftEyeFootXYPx: [],
      footXYPx: [],
    }

    for (let i = 0; i < calibrateDistanceCheckCm.length; i++) {
      let register = true
      const cm = calibrateDistanceCheckCm[i]
      const index = i + 1

      // Track space bar listeners for this iteration
      const iterationListeners = []

      updateProgressBar(
        (index / calibrateDistanceCheckCm.length) * 100,
        index,
        calibrateDistanceCheckCm.length,
      )
      updateViewingDistanceDiv(cm, RC.equipment?.value?.unit)

      // Determine which instruction text to show based on calibrateDistanceChecking option
      const checkingOptions = calibrateDistanceChecking
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

      // Choose step-by-step phrase key
      // Mapping for checkDistance.js: _MD keys → actual phrase keys in main system
      const phraseKeyMapping = {
        RC_produceDistanceCameraTiltAndSwivel_MD:
          'RC_produceDistanceCameraTiltAndSwivel',
        RC_produceDistanceCamera_MD: 'RC_produceDistanceCamera',
        RC_produceDistanceTiltAndSwivel_MD: 'RC_produceDistanceTiltAndSwivel',
        RC_produceDistance_MD: 'RC_produceDistance',
      }

      let phraseKeyForSteps = 'RC_produceDistance_MD'
      if (checkingOptions && typeof checkingOptions === 'string') {
        const optionsArray = checkingOptions
          .toLowerCase()
          .split(',')
          .map(s => s.trim())
        const hasTiltAndSwivel = optionsArray.includes('tiltandswivel')
        const hasCamera = optionsArray.includes('camera')
        if (hasTiltAndSwivel && hasCamera) {
          phraseKeyForSteps = 'RC_produceDistanceCameraTiltAndSwivel_MD'
        } else if (hasTiltAndSwivel) {
          phraseKeyForSteps = 'RC_produceDistanceTiltAndSwivel_MD'
        } else if (hasCamera) {
          phraseKeyForSteps = 'RC_produceDistanceCamera_MD'
        }
      }

      // Keep the title, render step-by-step body ourselves
      {
        const html = constructInstructions(
          phrases.RC_produceDistanceTitle[RC.language.value]
            .replace('[[N22]]', index)
            .replace('[[N33]]', calibrateDistanceCheckCm.length),
          '',
          false,
          'bodyText',
          'left',
          null,
          false,
          'check-distance-instruction-title',
        )
        RC._replaceBackground(html)
      }

      // Set max-width to avoid video overlap
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
        instructionElement.style.maxWidth = `${videoLeftEdge - 3}px`
      }

      // Build single-column (left-only) step-by-step UI in the instruction body
      let navHandlerRef = null
      // Ensure an instruction body exists; constructInstructions omits it when body is empty
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
      if (instructionBody) {
        instructionBody.innerHTML = ''
        // Add bottom padding to prevent content from being occluded by progress bar
        instructionBody.style.paddingBottom = '50px'
        // Also ensure max-height accounts for progress bar
        instructionBody.style.maxHeight = `calc(100vh - 50px)`
        instructionBody.style.overflow = 'auto'
        const ui = createStepInstructionsUI(instructionBody, {
          layout: 'leftOnly',
          leftWidth: '100%',
          leftPaddingStart: '0rem',
          leftPaddingEnd: '1rem',
          fontSize: 'clamp(1.1em, 2.5vw, 1.4em)',
          lineHeight: '1.4',
        })
        // For checkDistance.js: bypass test_phrases and access phrases directly using mapping
        // This avoids module load timing issues
        const actualPhraseKey =
          phraseKeyMapping[phraseKeyForSteps] ||
          phraseKeyForSteps.replace('_MD', '')
        const rawStepText = phrases[actualPhraseKey]?.[RC.language.value] || ''

        // Debug logging
        console.log('🔍 checkDistance phrase debug:', {
          phraseKeyRequested: phraseKeyForSteps,
          actualPhraseKey: actualPhraseKey,
          language: RC.language.value,
          phraseExists: !!phrases[actualPhraseKey],
          phraseValue: phrases[actualPhraseKey],
          rawStepTextFound: !!rawStepText,
          textLength: rawStepText.length,
          textPreview: rawStepText.substring(0, 100),
        })

        const chosenStepText = String(rawStepText)
          .replace('[[N11]]', cm)
          .replace('[[UUU]]', RC.equipment?.value?.unit || '')

        try {
          const stepModel = parseInstructions(chosenStepText, {
            assetMap: test_assetMap,
          })

          // Debug: Log the parsed model structure to find duplicate videos
          console.log('🎬 stepModel structure:', {
            sectionsCount: stepModel.sections?.length,
            flatStepsCount: stepModel.flatSteps?.length,
            sections: stepModel.sections?.map((s, i) => ({
              sectionIdx: i,
              title: s.title,
              stepsCount: s.steps?.length,
              sectionMediaUrls: s.mediaUrls,
              steps: s.steps?.map((st, j) => ({
                stepIdx: j,
                textPreview: st.text?.substring(0, 50),
                mediaUrls: st.mediaUrls,
              })),
            })),
          })

          let stepIndex = 0
          const maxIdx = (stepModel.flatSteps?.length || 1) - 1

          const handlePrev = () => {
            if (stepIndex > 0) {
              stepIndex--
              doRender()
            }
          }

          const handleNext = () => {
            if (stepIndex < maxIdx) {
              stepIndex++
              doRender()
            }
          }

          const doRender = () => {
            renderStepInstructions({
              model: stepModel,
              flatIndex: stepIndex,
              elements: {
                leftText: ui.leftText,
                rightText: null,
                mediaContainer: ui.mediaContainer,
              },
              options: {
                thresholdFraction: 0.4,
                useCurrentSectionOnly: true,
                resolveMediaUrl: resolveInstructionMediaUrl,
                layout: 'leftOnly',
                stepperHistory: stepperHistory,
                onPrev: handlePrev,
                onNext: handleNext,
                bottomOffset: 40, // Account for progress bar height
              },
              lang: RC.language.value,
              langDirection: RC.LD,
              phrases: phrases,
            })

            // Debug: Check DOM for all video/img elements after render
            const allVideos = instructionBody.querySelectorAll('video')
            const allImages = instructionBody.querySelectorAll('img')
            console.log('🖼️ DOM media elements after render:', {
              stepIndex,
              videosCount: allVideos.length,
              imagesCount: allImages.length,
              videoSrcs: Array.from(allVideos).map(v =>
                v.src?.substring(0, 80),
              ),
              imageSrcs: Array.from(allImages).map(i =>
                i.src?.substring(0, 80),
              ),
              mediaContainerChildren: ui.mediaContainer.children.length,
              leftTextChildren: ui.leftText.children.length,
            })
          }
          doRender()
          const navHandler = e => {
            if (e.key === 'ArrowDown') {
              const maxIdx = (stepModel.flatSteps?.length || 1) - 1
              if (stepIndex < maxIdx) {
                stepIndex++
                doRender()
              }
              e.preventDefault()
              e.stopPropagation()
            } else if (e.key === 'ArrowUp') {
              if (stepIndex > 0) {
                stepIndex--
                doRender()
              }
              e.preventDefault()
              e.stopPropagation()
            }
          }
          navHandlerRef = navHandler
          document.addEventListener('keydown', navHandlerRef)
        } catch (e) {
          // Fallback to plain text if parsing fails
          instructionBody.innerText = instructionBodyPhrase
            .replace('[[N11]]', cm)
            .replace('[[UUU]]', RC.equipment?.value?.unit || '')
        }
      }

      //wait for return key press
      await new Promise(async resolve => {
        if (!calibrateDistanceCheckSecs) calibrateDistanceCheckSecs = 0

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
                calibrateDistancePupil,
                calibrateDistanceChecking,
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

              // Determine which distance to save based on calibrateDistanceChecking option
              let measuredDistanceCm = RC.viewingDistanceCm.value // Default to eye-to-camera

              if (
                calibrateDistanceChecking &&
                typeof calibrateDistanceChecking === 'string'
              ) {
                const optionsArray = calibrateDistanceChecking
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

              const cameraResolutionXYVpx = getCameraResolutionXY(RC)
              RC.distanceCheckJSON.cameraResolutionXYVpx.push(
                cameraResolutionXYVpx,
              )

              RC.calibrateDistanceMeasuredCm.push(distanceFromRC)
              RC.calibrateDistanceRequestedCm.push(
                Number(
                  RC.equipment?.value?.unit === 'inches'
                    ? (cm * 2.54).toFixed(1)
                    : cm.toFixed(1),
                ),
              )
              const EyeFeetXYPxLeft = faceValidation.nearestXYPx_left
              const EyeFeetXYPxRight = faceValidation.nearestXYPx_right

              // Store the averaged IPD pixels from validation test
              RC.calibrateDistanceIPDPixels.push(faceValidation.ipdPixels)
              RC.calibrateDistanceEyeFeetXYPx.push(
                EyeFeetXYPxLeft,
                EyeFeetXYPxRight,
              )
              RC.calibrateDistanceRequestedDistances.push(
                Number(
                  RC.equipment?.value?.unit === 'inches'
                    ? (cm * 2.54).toFixed(1)
                    : cm.toFixed(1),
                ),
              )
              const requestedEyesToPointCm =
                Math.round(
                  RC.equipment?.value?.unit === 'inches'
                    ? cm * 2.54 * 10
                    : cm * 10,
                ) / 10

              const rulerBasedEyesToFootCm = Math.sqrt(
                requestedEyesToPointCm ** 2 - faceValidation.footToPointCm ** 2,
              )
              try {
                const imageBasedEyesToFootCm =
                  (calibrationFVpx * RC._CONST.IPD_CM) /
                  faceValidation.ipdPixels
                RC.distanceCheckJSON.imageBasedEyesToFootCm.push(
                  Math.round(imageBasedEyesToFootCm * 10) / 10,
                )
                const imageBasedEyesToPointCm = Math.sqrt(
                  imageBasedEyesToFootCm ** 2 +
                    faceValidation.footToPointCm ** 2,
                )

                RC.distanceCheckJSON.imageBasedEyesToPointCm.push(
                  Math.round(imageBasedEyesToPointCm * 10) / 10,
                )
                RC.distanceCheckJSON.imageBasedEyesToFootCm.push(
                  Math.round(imageBasedEyesToFootCm * 10) / 10,
                )
              } catch (e) {
                RC.distanceCheckJSON.imageBasedEyesToFootCm.push(null)
                RC.distanceCheckJSON.imageBasedEyesToPointCm.push(null)
              }
              RC.distanceCheckJSON.rulerBasedEyesToFootCm.push(
                Math.round(rulerBasedEyesToFootCm * 10) / 10,
              )
              RC.distanceCheckJSON.rulerBasedEyesToPointCm.push(
                requestedEyesToPointCm,
              )
              RC.distanceCheckJSON.requestedEyesToPointCm.push(
                requestedEyesToPointCm,
              )
              RC.distanceCheckJSON.pointXYPx.push([
                faceValidation.pointXYPx[0],
                faceValidation.pointXYPx[1],
              ])
              RC.distanceCheckJSON.eyesToPointCm.push(
                faceValidation.eyeToPointCm,
              )
              RC.distanceCheckJSON.eyesToFootCm.push(faceValidation.eyeToFootCm)
              RC.distanceCheckJSON.footToPointCm.push(
                faceValidation.footToPointCm,
              )
              RC.distanceCheckJSON.ipdVpx.push(faceValidation.ipdPixels)
              RC.distanceCheckJSON.rightEyeFootXYPx.push([
                faceValidation.nearestXYPx_right[0],
                faceValidation.nearestXYPx_right[1],
              ])
              RC.distanceCheckJSON.leftEyeFootXYPx.push([
                faceValidation.nearestXYPx_left[0],
                faceValidation.nearestXYPx_left[1],
              ])
              RC.distanceCheckJSON.footXYPx.push([
                faceValidation.footXYPx[0],
                faceValidation.footXYPx[1],
              ])

              // Clean up the captured image for privacy
              lastCapturedFaceImage = null

              document.removeEventListener('keydown', keyupListener)
              removeKeypadHandler()
              if (navHandlerRef) {
                document.removeEventListener('keydown', navHandlerRef)
                navHandlerRef = null
              }
              resolve()
            }
            //check for the x key to skip
            else if (event.key === 'x' && register) {
              register = false
              skippedDistancesCount++
              //remove distance from requested list
              calibrateDistanceCheckCm.splice(i, 1)
              i--
              document.removeEventListener('keydown', keyupListener)
              removeKeypadHandler()
              if (navHandlerRef) {
                document.removeEventListener('keydown', navHandlerRef)
                navHandlerRef = null
              }
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
                  calibrateDistancePupil,
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

                // Determine which distance to save based on calibrateDistanceChecking option
                let measuredDistanceCm = RC.viewingDistanceCm.value // Default to eye-to-camera

                if (
                  calibrateDistanceChecking &&
                  typeof calibrateDistanceChecking === 'string'
                ) {
                  const optionsArray = calibrateDistanceChecking
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

                const cameraResolutionXYVpx = getCameraResolutionXY(RC)
                RC.distanceCheckJSON.cameraResolutionXYVpx.push(
                  cameraResolutionXYVpx,
                )

                RC.calibrateDistanceMeasuredCm.push(distanceFromRC)
                RC.calibrateDistanceRequestedCm.push(
                  Math.round(
                    RC.equipment?.value?.unit === 'inches'
                      ? cm * 2.54 * 10
                      : cm * 10,
                  ) / 10,
                )

                const EyeFeetXYPxLeft = faceValidation.nearestXYPx_left
                const EyeFeetXYPxRight = faceValidation.nearestXYPx_right
                RC.calibrateDistanceEyeFeetXYPx.push(
                  EyeFeetXYPxLeft,
                  EyeFeetXYPxRight,
                )

                // Store the averaged IPD pixels from validation test
                RC.calibrateDistanceIPDPixels.push(faceValidation.ipdPixels)
                RC.calibrateDistanceRequestedDistances.push(
                  Math.round(
                    RC.equipment?.value?.unit === 'inches'
                      ? cm * 2.54 * 10
                      : cm * 10,
                  ) / 10,
                )

                RC.distanceCheckJSON.pointXYPx.push([
                  faceValidation.pointXYPx[0],
                  faceValidation.pointXYPx[1],
                ])
                try {
                  const imageBasedEyesToFootCm =
                    (calibrationFVpx * RC._CONST.IPD_CM) /
                    faceValidation.ipdPixels
                  RC.distanceCheckJSON.imageBasedEyesToFootCm.push(
                    Math.round(imageBasedEyesToFootCm * 10) / 10,
                  )
                  const imageBasedEyesToPointCm = Math.sqrt(
                    imageBasedEyesToFootCm ** 2 +
                      faceValidation.footToPointCm ** 2,
                  )

                  RC.distanceCheckJSON.imageBasedEyesToPointCm.push(
                    Math.round(imageBasedEyesToPointCm * 10) / 10,
                  )
                  RC.distanceCheckJSON.imageBasedEyesToFootCm.push(
                    Math.round(imageBasedEyesToFootCm * 10) / 10,
                  )
                } catch (e) {
                  RC.distanceCheckJSON.imageBasedEyesToFootCm.push(null)
                  RC.distanceCheckJSON.imageBasedEyesToPointCm.push(null)
                }
                const requestedEyesToPointCm =
                  Math.round(
                    RC.equipment?.value?.unit === 'inches'
                      ? cm * 2.54 * 10
                      : cm * 10,
                  ) / 10
                const rulerBasedEyesToFootCm = Math.sqrt(
                  requestedEyesToPointCm ** 2 -
                    faceValidation.footToPointCm ** 2,
                )
                RC.distanceCheckJSON.rulerBasedEyesToPointCm.push(
                  requestedEyesToPointCm,
                )
                RC.distanceCheckJSON.rulerBasedEyesToFootCm.push(
                  Math.round(rulerBasedEyesToFootCm * 10) / 10,
                )
                RC.distanceCheckJSON.requestedEyesToPointCm.push(
                  requestedEyesToPointCm,
                )
                RC.distanceCheckJSON.eyesToPointCm.push(
                  faceValidation.eyeToPointCm,
                )
                RC.distanceCheckJSON.eyesToFootCm.push(
                  faceValidation.eyeToFootCm,
                )
                RC.distanceCheckJSON.footToPointCm.push(
                  faceValidation.footToPointCm,
                )
                RC.distanceCheckJSON.ipdVpx.push(faceValidation.ipdPixels)
                RC.distanceCheckJSON.rightEyeFootXYPx.push([
                  faceValidation.nearestXYPx_right[0],
                  faceValidation.nearestXYPx_right[1],
                ])
                RC.distanceCheckJSON.leftEyeFootXYPx.push([
                  faceValidation.nearestXYPx_left[0],
                  faceValidation.nearestXYPx_left[1],
                ])
                RC.distanceCheckJSON.footXYPx.push([
                  faceValidation.footXYPx[0],
                  faceValidation.footXYPx[1],
                ])

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
                calibrateDistanceCheckCm.splice(i, 1)
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
        }, calibrateDistanceCheckSecs * 1000)
      })

      // COMPLIANCE CHECK: Starting from the second setting, check for non-compliance
      // (user pressing space without actually moving to the requested distance)
      if (i >= 1 && RC.calibrateDistanceMeasuredCm.length >= 2) {
        const currentRequestedDistance = calibrateDistanceCheckCm[i]
        const previousRequestedDistance = calibrateDistanceCheckCm[i - 1]

        // Only run compliance check if the REQUESTS differ by at least 20%
        // (skip if requests are within 20% of being equal)
        const requestsDifferEnough = !areValuesWithinPercent(
          currentRequestedDistance,
          previousRequestedDistance,
          20,
        )

        if (requestsDifferEnough) {
          // Compare the MEASURED distances (what the system detected via face tracking)
          const currentMeasuredDistance =
            RC.calibrateDistanceMeasuredCm[
              RC.calibrateDistanceMeasuredCm.length - 1
            ]
          const previousMeasuredDistance =
            RC.calibrateDistanceMeasuredCm[
              RC.calibrateDistanceMeasuredCm.length - 2
            ]

          // If measured distances are within 10% of being equal, this is invalid (non-compliance)
          // The user didn't actually move despite different distance requests
          const measurementsTooSimilar = areValuesWithinPercent(
            currentMeasuredDistance,
            previousMeasuredDistance,
            10,
          )

          if (measurementsTooSimilar) {
            console.warn(
              `Distance compliance check failed: User at similar distances (${previousMeasuredDistance} vs ${currentMeasuredDistance} cm) ` +
                `despite different requests (${previousRequestedDistance} vs ${currentRequestedDistance})`,
            )

            // Discard all distance settings so far
            RC.calibrateDistanceMeasuredCm = []
            RC.calibrateDistanceRequestedCm = []
            RC.calibrateDistanceIPDPixels = []
            RC.calibrateDistanceRequestedDistances = []
            RC.calibrateDistanceEyeFeetXYPx = []

            // Reset distanceCheckJSON arrays
            RC.distanceCheckJSON.pointXYPx = []
            RC.distanceCheckJSON.imageBasedEyesToFootCm = []
            RC.distanceCheckJSON.imageBasedEyesToPointCm = []
            RC.distanceCheckJSON.rulerBasedEyesToPointCm = []
            RC.distanceCheckJSON.rulerBasedEyesToFootCm = []
            RC.distanceCheckJSON.cameraResolutionXYVpx = []
            RC.distanceCheckJSON.requestedEyesToPointCm = []
            RC.distanceCheckJSON.eyesToPointCm = []
            RC.distanceCheckJSON.eyesToFootCm = []
            RC.distanceCheckJSON.footToPointCm = []
            RC.distanceCheckJSON.ipdVpx = []
            RC.distanceCheckJSON.rightEyeFootXYPx = []
            RC.distanceCheckJSON.leftEyeFootXYPx = []
            RC.distanceCheckJSON.footXYPx = []

            // Get the error message (use same phrase as length check for consistency)
            const errorMessage =
              phrases.RC_RejectEqualDistances?.[RC.language.value] ||
              phrases.RC_RejectEqualLengths?.[RC.language.value]

            // Show popup error message and wait for OK
            await Swal.fire({
              ...swalInfoOptions(RC, { showIcon: false }),
              icon: '', //no icon
              title: '', //no title
              html: errorMessage,
              allowEnterKey: true,
              focusConfirm: true, // Focus OK button so Enter key works
              confirmButtonText: phrases.RC_ok?.[RC.L],
              didOpen: () => {
                // Prevent Space key from triggering the OK button (only allow Return/Enter)
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

            // Reset loop to start from the first setting
            // Set i to -1 so the next iteration starts at i = 0
            i = -1
          }
        }
      }
    }

    removeProgressBar(RC, calibrateDistanceChecking)
    removeViewingDistanceDiv()

    // Hide video container after all measurements are complete
    const videoContainer = document.getElementById('webgazerVideoContainer')
    if (videoContainer) {
      videoContainer.style.display = 'none'
    }

    // Log the captured IPD data for debugging
    console.log('=== IPD Data Captured During Distance Checking ===')
    console.log('Total measurements:', RC.calibrateDistanceIPDPixels.length)
    console.log('IPD Pixels Array:', RC.calibrateDistanceIPDPixels)
    console.log(
      'Requested Distances Array (cm):',
      RC.calibrateDistanceRequestedDistances,
    )
    console.log(
      'Measured Distances Array (cm):',
      RC.calibrateDistanceMeasuredCm,
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
          RC.calibrateDistanceRequestedCm.length,
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
const createViewingDistanceDiv = RC => {
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

  // Add RTL class if language is RTL
  if (RC.LD === RC._CONST.RTL) {
    distanceContainer.className += ' rtl'
  }

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
const createProgressBar = (RC, calibrateDistanceChecking = undefined) => {
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

  // Reposition video based on calibrateDistanceChecking option
  repositionVideoForCameraMonitoring(RC, calibrateDistanceChecking)
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
const removeProgressBar = (RC, calibrateDistanceChecking = undefined) => {
  const progressBarContainer = document.getElementById('custom-progress-bar')
  if (progressBarContainer) {
    document.body.removeChild(progressBarContainer)

    // Reposition video based on calibrateDistanceChecking option
    const videoContainer = document.getElementById('webgazerVideoContainer')
    if (videoContainer && RC) {
      // Check if option includes "camera" - if so, don't reposition (keep camera position)
      const checkingOptions = calibrateDistanceChecking
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
        // Remove fixation cross when not in camera mode
        removeFixationCrossFromVideo()
      }
      // If shouldPositionAtCamera is true, don't call setDefaultVideoPosition
      // The video will stay at the camera position and cross remains
    }
  } else {
    console.warn('Progress bar does not exist.')
  }

  // Global cleanup: Space bar listeners are cleaned up as each iteration completes
  // Each iteration tracks its own listeners and removes them when done
  console.log('=== CHECK DISTANCE CLEANUP COMPLETE ===')
}
