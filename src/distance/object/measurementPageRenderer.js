/**
 * measurementPageRenderer.js
 *
 * Factory function to create a measurement page renderer and a helper to build
 * page configuration from a location manager's state.
 */

import {
  getArrowPositionForLocation,
  positionVideoForLocation,
  getLocationInstructionPhraseKey,
  buildLocationInstructions,
} from './locationUtils'

/* ============================================================================
 * MEASUREMENT PAGE RENDERER FACTORY
 * ============================================================================ */

/**
 * Factory function to create a measurement page renderer.
 * This creates a function that can render any measurement page based on location configuration,
 * replacing the hard-coded Page 3/Page 4 logic with a dynamic, configurable approach.
 *
 * @param {object} dependencies - All UI elements and utilities needed for rendering
 * @param {object} dependencies.RC - The RemoteCalibrator instance
 * @param {object} dependencies.phrases - The i18n phrases object
 * @param {HTMLElement} dependencies.container - Main container element
 * @param {HTMLElement} dependencies.title - Title element
 * @param {HTMLElement} dependencies.instructionsContainer - Instructions container
 * @param {HTMLElement} dependencies.proceedButton - Proceed button element
 * @param {HTMLElement} dependencies.explanationButton - Explanation button element
 * @param {HTMLElement} dependencies.rulerShiftButton - Ruler shift button element
 * @param {HTMLElement} dependencies.unitRadioContainer - Unit radio container element
 * @param {HTMLElement} dependencies.dontUseRulerColumn - Don't use ruler warning element
 * @param {object} dependencies.tape - Diagonal tape component
 * @param {object} dependencies.leftLabel - Left label component
 * @param {object} dependencies.rightLabel - Right label component
 * @param {HTMLElement} dependencies.paperSelectionContainer - Paper selection container
 * @param {HTMLElement} dependencies.paperStepperMediaContainer - Paper stepper media container
 * @param {function} dependencies.createArrowIndicators - Function to create arrow indicators
 * @param {function} dependencies.parseInstructions - Function to parse step instructions
 * @param {function} dependencies.renderCurrentStepView - Function to render step view
 * @param {object} dependencies.test_assetMap - Asset map for instructions
 * @param {function} dependencies.setInstructionsText - Function to set plain text instructions
 * @returns {object} Object with showMeasurementPage and updateArrows methods
 */
export function createMeasurementPageRenderer(dependencies) {
  const {
    RC,
    phrases,
    container,
    title,
    instructionsContainer,
    proceedButton,
    explanationButton,
    rulerShiftButton,
    unitRadioContainer,
    dontUseRulerColumn,
    tape,
    leftLabel,
    rightLabel,
    paperSelectionContainer,
    paperStepperMediaContainer,
    createArrowIndicators,
    parseInstructions,
    renderCurrentStepView,
    test_assetMap,
    setInstructionsText,
  } = dependencies

  // Internal state for arrow indicators
  let arrowIndicators = null

  // Track margin from video overlap
  let lastInstructionsMarginTopPx = null

  /**
   * Ensure instructions are positioned below the video (if video overlaps).
   * @param {number} gapPx - Gap in pixels between video and instructions
   */
  const ensureInstructionsBelowVideo = (gapPx = 16) => {
    const v = document.getElementById('webgazerVideoContainer')
    if (!v) return

    const apply = () => {
      try {
        // Reset to the default margin first (avoid compounding on repeated calls)
        instructionsContainer.style.marginTop = ''
        const vRect = v.getBoundingClientRect()
        const iRect = instructionsContainer.getBoundingClientRect()

        // Only adjust when the video is above the instructions (top overlap scenario)
        if (vRect.top <= iRect.top + 1) {
          const overlapPx = vRect.bottom + gapPx - iRect.top
          if (overlapPx > 0) {
            const baseTop =
              parseFloat(getComputedStyle(instructionsContainer).marginTop) || 0
            instructionsContainer.style.marginTop = `${Math.ceil(baseTop + overlapPx)}px`
          }
        }

        // Record the final marginTop for seamless transitions
        lastInstructionsMarginTopPx =
          parseFloat(getComputedStyle(instructionsContainer).marginTop) || 0
      } catch (e) {
        console.warn('Error in ensureInstructionsBelowVideo:', e)
      }
    }

    requestAnimationFrame(() => {
      apply()
      // Run again shortly after in case the video container resizes/finishes layout
      setTimeout(apply, 50)
    })
  }

  /**
   * Match the instructions margin to the previous page's offset (visual continuity).
   */
  const matchPreviousInstructionsOffset = () => {
    if (lastInstructionsMarginTopPx == null) return
    const current =
      parseFloat(getComputedStyle(instructionsContainer).marginTop) || 0
    if (current < lastInstructionsMarginTopPx) {
      instructionsContainer.style.marginTop = `${Math.ceil(lastInstructionsMarginTopPx)}px`
    }
  }

  /**
   * Update arrow indicators to point to a specific location.
   * @param {string} location - One of the VALID_LOCATIONS values
   * @param {number} [offsetPx=0] - Offset in pixels for topOffset* locations
   * @returns {HTMLElement|null} The new arrow indicators element
   */
  const updateArrows = (location, offsetPx = 0) => {
    if (arrowIndicators) {
      arrowIndicators.remove()
      arrowIndicators = null
    }

    const arrowXY = getArrowPositionForLocation(location, offsetPx, RC)
    arrowIndicators = createArrowIndicators(arrowXY)

    if (arrowIndicators && RC.background) {
      RC.background.appendChild(arrowIndicators)
    }

    return arrowIndicators
  }

  /**
   * Hide all the common UI elements that shouldn't appear on measurement pages.
   */
  const hideCommonElements = () => {
    // Hide paper selection
    if (paperSelectionContainer) paperSelectionContainer.style.display = 'none'
    if (paperStepperMediaContainer) {
      paperStepperMediaContainer.style.display = 'none'
      paperStepperMediaContainer.innerHTML = ''
    }

    // Reset container background
    if (container) container.style.backgroundColor = ''

    // Hide tape and labels
    if (tape?.container) tape.container.style.display = 'none'
    if (leftLabel?.container?.parentNode) {
      leftLabel.container.parentNode.removeChild(leftLabel.container)
    }
    if (rightLabel?.container?.parentNode) {
      rightLabel.container.parentNode.removeChild(rightLabel.container)
    }

    // Hide buttons and controls
    if (rulerShiftButton) rulerShiftButton.style.display = 'none'
    if (unitRadioContainer) unitRadioContainer.style.display = 'none'
    if (proceedButton) proceedButton.style.display = 'none'
    if (dontUseRulerColumn) dontUseRulerColumn.style.display = 'none'

    // Show explanation button
    if (explanationButton) explanationButton.style.display = 'block'
  }

  /**
   * Render the progress title "Measurement X of Y".
   * @param {number} current - Current measurement number (1-indexed)
   * @param {number} total - Total number of measurements
   */
  const renderProgressTitle = (current, total) => {
    const n1 = Math.max(0, Math.floor(current || 0))
    const n2 = Math.max(Math.floor(total || 0), n1, 1)
    const template =
      phrases?.RC_distanceTrackingN?.[RC.L] || 'Distance [[N1]] of [[N2]]'

    if (title) {
      title.style.display = 'block'
      title.innerText = template
        .replace('[[N1]]', n1.toString())
        .replace('[[N2]]', n2.toString())
    }
  }

  /**
   * Get the appropriate instruction phrase for a measurement.
   * Uses the new location-aware phrases if available, falls back to legacy.
   *
   * @param {boolean} isFirst - Whether this is the first measurement
   * @param {string} location - One of the VALID_LOCATIONS values
   * @param {boolean} saveSnapshots - Whether snapshots are saved
   * @returns {string} The instruction phrase key to use
   */
  const getInstructionPhraseKey = (isFirst, location, saveSnapshots) => {
    // Try new location-aware phrases first
    const newPhraseKey = isFirst
      ? 'RC_UseObjectToSetViewingDistanceToLocationFirstPage'
      : 'RC_UseObjectToSetViewingDistanceToLocationNextPage'

    // Check if the new phrase exists
    if (phrases?.[newPhraseKey]?.[RC.L]) {
      return newPhraseKey
    }
  }

  /**
   * Show a measurement page for a specific location.
   * This is the main function that replaces the hard-coded Page 3/Page 4 logic.
   *
   * @param {object} config - Configuration for the measurement page
   * @param {number} config.locationIndex - Index in the locations array (0-based)
   * @param {string} config.location - One of the VALID_LOCATIONS values
   * @param {string} config.locEye - The location string
   * @param {boolean} config.isFirst - Whether this is the first measurement
   * @param {number} config.totalLocations - Total number of locations to measure
   * @param {boolean} config.saveSnapshots - Whether snapshots are saved
   * @param {boolean} [config.preferRightHandBool=true] - Participant hand/eye preference
   * @param {number} [config.offsetPx=0] - Offset in px for topOffset* locations
   * @param {function} [config.onProgressUpdate] - Callback when progress updates
   * @param {object} [config.stepInstructionState] - State for step instruction renderer
   * @param {number} [config.pageNumberOffset=0] - Offset to add to page numbers
   * @returns {Promise<object>} Object with arrowIndicators and instructionText
   */
  const showMeasurementPage = async config => {
    const {
      locationIndex,
      location,
      locEye,
      isFirst,
      totalLocations,
      saveSnapshots,
      preferRightHandBool = true,
      offsetPx = 0,
      onProgressUpdate,
      stepInstructionState,
      pageNumberOffset = 0,
    } = config

    console.log(
      `=== SHOWING MEASUREMENT PAGE FOR LOCATION ${locationIndex}: ${locEye} ===`,
    )
    console.log(
      `  location: ${location}, preferRightHand: ${preferRightHandBool}, isFirst: ${isFirst}`,
    )

    // 1. Hide common elements
    hideCommonElements()

    // 2. Show and restore title/margins
    if (title) title.style.display = 'block'
    if (instructionsContainer) {
      instructionsContainer.style.display = 'block'
      instructionsContainer.style.margin = '2rem 0 5rem 0'
    }

    // 3. Update progress title
    // pageNumberOffset accounts for preceding pages (e.g. paper selection page)
    const currentMeasurement = locationIndex + 1 + pageNumberOffset // Convert to 1-indexed + offset
    const displayTotal = totalLocations + pageNumberOffset
    renderProgressTitle(currentMeasurement, displayTotal)

    if (onProgressUpdate) {
      onProgressUpdate(currentMeasurement, displayTotal)
    }

    console.log(
      `  Progress: Measurement ${currentMeasurement} of ${displayTotal}`,
    )

    // 4. Show and position video
    RC.showVideo(true)
    positionVideoForLocation(RC, location, offsetPx)

    // Re-position after layout stabilizes
    requestAnimationFrame(() => {
      positionVideoForLocation(RC, location, offsetPx)
      setTimeout(() => positionVideoForLocation(RC, location, offsetPx), 50)
    })

    // 5. Ensure instructions don't overlap video
    ensureInstructionsBelowVideo(18)

    // For non-first measurements, match previous page's offset for visual continuity
    if (!isFirst) {
      requestAnimationFrame(() => {
        matchPreviousInstructionsOffset()
        setTimeout(matchPreviousInstructionsOffset, 60)
      })
    }

    // 6. Get instruction text
    const phraseKey = getInstructionPhraseKey(isFirst, location, saveSnapshots)
    let instructionText = ''

    // Check if we should use new location-aware phrases with placeholders
    const isNewPhrase = phraseKey.includes('ToLocation')

    console.log(`  Looking for phrase key: ${phraseKey}`)
    console.log(`  Is new phrase format: ${isNewPhrase}`)

    if (isNewPhrase) {
      // Build instruction text with [[SSS]], [[EEE]], [[LLL]] replaced
      instructionText = buildLocationInstructions(
        phraseKey,
        location,
        preferRightHandBool,
        saveSnapshots,
        RC.L,
        phrases,
      )
    } else {
      // Use legacy phrase directly
      instructionText = phrases?.[phraseKey]?.[RC.L] || ''
    }

    // If no instructions found, try fallback phrases
    if (!instructionText) {
      console.warn(
        `  No instruction text found for ${phraseKey}, trying fallbacks...`,
      )
      const fallbackKeys = [
        'RC_UseObjectToSetViewingDistancePage3',
        'RC_UseObjectToSetViewingDistanceStepperPage3',
        'RC_UseObjectToSetViewingDistanceCenterPage4',
        'RC_UseObjectToSetViewingDistanceStepperPage4',
      ]
      for (const key of fallbackKeys) {
        if (phrases?.[key]?.[RC.L]) {
          instructionText = phrases[key][RC.L]
          console.log(`  Found fallback instruction with key: ${key}`)
          break
        }
      }
    }

    console.log(`  Instruction text length: ${instructionText?.length || 0}`)
    console.log(
      `  First 100 chars: ${instructionText?.substring(0, 100) || '(empty)'}`,
    )

    // 7. Render instructions
    console.log(
      `  Rendering instructions (setStepModel: ${!!config.setStepModel}, parseInstructions: ${!!parseInstructions}, setInstructionsText: ${!!setInstructionsText})`,
    )

    let renderSucceeded = false

    // Check if we have a model setter callback (new approach)
    if (config.setStepModel && parseInstructions) {
      try {
        const parsedModel = parseInstructions(instructionText, {
          assetMap: test_assetMap,
        })
        // Call the setter which updates the actual variables in distance.js
        config.setStepModel(parsedModel, 0)
        // Now render with the updated model
        if (renderCurrentStepView) {
          renderCurrentStepView()
          renderSucceeded = true
          console.log(
            '  Instructions rendered via setStepModel + renderCurrentStepView',
          )
        }
      } catch (e) {
        console.warn('Failed to parse step instructions; using plain text', e)
      }
    }

    // Fallback: try setInstructionsText
    if (!renderSucceeded && setInstructionsText) {
      try {
        setInstructionsText(instructionText)
        renderSucceeded = true
        console.log('  Instructions rendered via setInstructionsText')
      } catch (e) {
        console.warn('Failed to set instructions text', e)
      }
    }

    // Ultimate fallback: directly set innerHTML on instructions container
    if (!renderSucceeded && instructionsContainer) {
      console.warn('  Using ultimate fallback: direct DOM innerHTML')
      // Convert markdown-style formatting to HTML
      let htmlText = instructionText
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>')
      instructionsContainer.innerHTML = htmlText
      renderSucceeded = true
    }

    if (!renderSucceeded) {
      console.error('  FAILED to render instructions - no method available')
    }

    // 8. Update arrow indicators
    const newArrows = updateArrows(location, offsetPx)
    console.log(`  Arrow indicators pointing to ${location}`)

    // 9. Log ready state
    console.log(
      `=== MEASUREMENT PAGE READY - PRESS SPACE TO CAPTURE FACE MESH DATA ===`,
    )

    return {
      arrowIndicators: newArrows,
      instructionText,
      location,
      locationIndex,
    }
  }

  /**
   * Clean up resources (call when done with measurements).
   */
  const cleanup = () => {
    if (arrowIndicators) {
      arrowIndicators.remove()
      arrowIndicators = null
    }
    lastInstructionsMarginTopPx = null
  }

  /**
   * Get the current arrow indicators element.
   */
  const getArrowIndicators = () => arrowIndicators

  return {
    showMeasurementPage,
    updateArrows,
    cleanup,
    getArrowIndicators,
    renderProgressTitle,
    ensureInstructionsBelowVideo,
    hideCommonElements,
  }
}

/* ============================================================================
 * MEASUREMENT PAGE CONFIG BUILDER
 * ============================================================================ */

/**
 * Build a measurement page configuration from location manager state.
 * Helper function to create the config object needed by showMeasurementPage.
 *
 * @param {object} locationManager - The location measurement manager
 * @param {boolean} saveSnapshots - Whether snapshots are saved
 * @param {boolean} [preferRightHandBool=true] - Participant hand/eye preference
 * @param {number} [offsetPx=0] - Offset in px for topOffset* locations
 * @returns {object|null} Config object for showMeasurementPage, or null if complete
 *
 * @example
 * const manager = createLocationMeasurementManager(['camera', 'center', 'topCenter'])
 * const config = buildMeasurementPageConfig(manager, true, true, 0)
 * // { locationIndex: 0, location: 'camera', locEye: 'camera',
 * //   isFirst: true, totalLocations: 3, saveSnapshots: true, preferRightHandBool: true, offsetPx: 0 }
 */
export function buildMeasurementPageConfig(
  locationManager,
  saveSnapshots,
  preferRightHandBool = true,
  offsetPx = 0,
) {
  const info = locationManager.getCurrentLocationInfo()
  if (!info) return null

  return {
    locationIndex: info.index,
    location: info.location,
    locEye: info.locEye,
    isFirst: info.isFirst,
    totalLocations: locationManager.getTotalLocations(),
    saveSnapshots,
    preferRightHandBool,
    offsetPx,
  }
}
