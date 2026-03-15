import { fitInstructionPanelToViewport } from '../components/utils'
import {
  removeDistancePageArrowIndicators,
  repositionVideoForCameraMonitoring,
} from './videoHelpers'

export const adjustDistanceCheckFontSize = () => {
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
export const adjustSizeCheckFontSize = () => {
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

export const setupDistanceCheckFontAdjustment = (
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
    // Remove arrow indicators from earlier distance pages if they reappear (e.g. after fullscreen exit)
    removeDistancePageArrowIndicators()
    // Reposition video to maintain camera monitoring position after resize
    if (RC && calibrateDistanceChecking) {
      repositionVideoForCameraMonitoring(RC, calibrateDistanceChecking)
    }
  }

  const fullscreenChangeHandler = () => {
    // Re-apply video position on fullscreen exit so top-center persists (viewport-relative)
    if (RC && calibrateDistanceChecking) {
      repositionVideoForCameraMonitoring(RC, calibrateDistanceChecking)
      // Re-apply again after layout stabilizes (fullscreen exit can trigger multiple reflows)
      requestAnimationFrame(() => {
        repositionVideoForCameraMonitoring(RC, calibrateDistanceChecking)
        setTimeout(() => {
          repositionVideoForCameraMonitoring(RC, calibrateDistanceChecking)
        }, 50)
      })
    }
    removeDistancePageArrowIndicators()
  }

  window.addEventListener('resize', resizeHandler)
  document.addEventListener('fullscreenchange', fullscreenChangeHandler)
  document.addEventListener('webkitfullscreenchange', fullscreenChangeHandler)
  document.addEventListener('mozfullscreenchange', fullscreenChangeHandler)
  document.addEventListener('MSFullscreenChange', fullscreenChangeHandler)
  console.log('Resize and fullscreen listeners added')

  // Return cleanup function
  return () => {
    console.log('Cleaning up distance check font adjustment')
    window.removeEventListener('resize', resizeHandler)
    document.removeEventListener('fullscreenchange', fullscreenChangeHandler)
    document.removeEventListener(
      'webkitfullscreenchange',
      fullscreenChangeHandler,
    )
    document.removeEventListener('mozfullscreenchange', fullscreenChangeHandler)
    document.removeEventListener('MSFullscreenChange', fullscreenChangeHandler)
  }
}

export const setupSizeCheckFontAdjustment = () => {
  console.log('Setting up size check font adjustment')

  // Initial adjustment
  adjustSizeCheckFontSize()

  // Set up resize listener with immediate execution (no debounce for testing)
  const resizeHandler = () => {
    console.log('Resize event detected')
    adjustSizeCheckFontSize()
    fitInstructionPanelToViewport()
  }

  window.addEventListener('resize', resizeHandler)
  console.log('Resize listener added')

  // Return cleanup function
  return () => {
    console.log('Cleaning up size check font adjustment')
    window.removeEventListener('resize', resizeHandler)
  }
}
