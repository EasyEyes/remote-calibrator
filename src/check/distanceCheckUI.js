import { phrases } from '../i18n/schema'
import { setDefaultVideoPosition } from '../components/video'
import {
  removeDistancePageArrowIndicators,
  removeFixationCrossFromVideo,
  repositionVideoForCameraMonitoring,
} from './videoHelpers'
import { setupDistanceCheckFontAdjustment } from './fontSizeAdjustment'

export const getLocalizedUnit = (unit, language) => {
  if (unit === 'inches') return phrases.RC_Inches?.[language] || unit
  if (unit === 'cm') return phrases.RC_Cm?.[language] || unit
  return unit || ''
}

export const median = array => {
  if (!array || array.length === 0) return 0
  const sorted = array.slice().sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

export const createViewingDistanceDiv = RC => {
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

export const removeViewingDistanceDiv = () => {
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

export const adjustFontSize = (distanceDiv, unitsDiv) => {
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

export const updateViewingDistanceDiv = (distance, units) => {
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
export const createProgressBar = (RC, calibrateDistanceChecking = undefined) => {
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

  // Remove arrow indicators from earlier distance pages (they don't belong in distance check)
  removeDistancePageArrowIndicators()

  // Reposition video based on calibrateDistanceChecking option
  repositionVideoForCameraMonitoring(RC, calibrateDistanceChecking)

  // Register resize and fullscreen listeners so video position and arrows stay correct (and cleanup on teardown)
  if (RC._distanceCheckFontCleanup) {
    RC._distanceCheckFontCleanup()
    RC._distanceCheckFontCleanup = null
  }
  RC._distanceCheckFontCleanup = setupDistanceCheckFontAdjustment(
    RC,
    calibrateDistanceChecking,
  )
}

// Function to update the progress
export const updateProgressBar = (progress, current, total) => {
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
export const removeProgressBar = (RC, calibrateDistanceChecking = undefined) => {
  // Teardown resize/fullscreen listeners from distance check
  if (RC._distanceCheckFontCleanup) {
    RC._distanceCheckFontCleanup()
    RC._distanceCheckFontCleanup = null
  }

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
      } else {
        // Leaving camera mode: clear flag so the next flow (equipment, size check, etc.) can reposition the video
        delete videoContainer.dataset.cameraMode
      }
    }
  } else {
    console.warn('Progress bar does not exist.')
  }

  // Global cleanup: Space bar listeners are cleaned up as each iteration completes
  // Each iteration tracks its own listeners and removes them when done
  console.log('=== CHECK DISTANCE CLEANUP COMPLETE ===')
}
