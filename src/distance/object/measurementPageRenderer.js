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
import {
  createHandPreferenceSelector,
  fitContentToAvailableSpace,
} from '../../components/handPreference'
import { fitStepperBoxToHeight } from '../stepByStepInstructionHelps'
import { processInlineFormatting } from '../markdownInstructionParser'

// Fallback text used only if the runtime phrases table has no
// RC_TakeOffYourGlasses entry yet (the source of truth is the phrases sheet).
const RC_TAKE_OFF_YOUR_GLASSES_FALLBACK =
  '<span style="font-size: 200%;">Take off your glasses.\n</span>Contacts are ok. If you\'re wearing glasses, please take them off while measuring viewing distance. You\'ll put them back on later.'

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
   * Set top margin of instructions to at least the video height so content
   * always starts below the video feed.
   * @param {number} gapPx - Extra gap in pixels between video bottom and content
   */
  const ensureInstructionsBelowVideo = (gapPx = 15) => {
    const v = document.getElementById('webgazerVideoContainer')
    if (!v) return

    const apply = () => {
      try {
        instructionsContainer.style.marginTop = ''
        void instructionsContainer.offsetHeight
        const vH = v.getBoundingClientRect().height || 0
        const containerTop = instructionsContainer.getBoundingClientRect().top
        const needed = vH + gapPx - containerTop
        instructionsContainer.style.marginTop =
          needed > 0 ? `${Math.ceil(needed)}px` : '0'
        lastInstructionsMarginTopPx =
          parseFloat(getComputedStyle(instructionsContainer).marginTop) || 0
      } catch (e) {
        console.warn('Error in ensureInstructionsBelowVideo:', e)
      }
    }

    requestAnimationFrame(() => {
      apply()
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

    if (location === 'camera') {
      const arrowXY = getArrowPositionForLocation(location, offsetPx, RC)
      arrowIndicators = createArrowIndicators(arrowXY)

      if (arrowIndicators && RC.background) {
        RC.background.appendChild(arrowIndicators)
      }
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

    // Hide the "take off your glasses" corner text by default; it is shown
    // again explicitly on measurement pages via showMeasurementPage.
    hideTakeOffGlasses()
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

  const TAKE_OFF_GLASSES_ID = 'rc-take-off-your-glasses'

  /**
   * Write the "Take off your glasses" instruction into the corner opposite the
   * title (upper-right for LTR, upper-left for RTL), matching the point size of
   * the later "Put your glasses back on" screen (heading2 = 18pt).
   */
  const renderTakeOffGlasses = () => {
    if (!title || !title.parentNode) return

    const raw =
      phrases?.RC_TakeOffYourGlasses?.[RC.L] ||
      RC_TAKE_OFF_YOUR_GLASSES_FALLBACK
    if (!raw) return

    // Split text into a first-line title and a wrapping body at the first
    // newline or <br>.
    const splitFirstLine = text => {
      const brk = text.match(/\n|<br\s*\/?\s*>/i)
      if (!brk) return { title: text, body: '' }
      return {
        title: text.slice(0, brk.index),
        body: text.slice(brk.index + brk[0].length),
      }
    }

    let titleRaw = ''
    let bodyRaw = raw
    let titleFontSize = '200%'
    let bodyFontSize = ''
    const spanMatch = raw.match(/<span([^>]*)>([\s\S]*?)<\/span>([\s\S]*)/i)
    if (spanMatch) {
      const fontSizeMatch = spanMatch[1].match(/font-size:\s*([\d.]+%)/i)
      if (fontSizeMatch) titleFontSize = fontSizeMatch[1]
      if (spanMatch[3].trim()) {
        // Old format: the span wraps only the title; the body follows it.
        titleRaw = spanMatch[2]
        bodyRaw = spanMatch[3]
      } else {
        // New format: the span wraps the whole phrase, so its font-size
        // applies to both lines and the first line is the title.
        const parts = splitFirstLine(spanMatch[2])
        titleRaw = parts.title
        bodyRaw = parts.body
        bodyFontSize = titleFontSize
      }
    } else {
      const parts = splitFirstLine(raw)
      titleRaw = parts.title
      bodyRaw = parts.body
    }
    titleRaw = titleRaw.replace(/\s+/g, ' ').trim()
    bodyRaw = bodyRaw
      .replace(/^(\s|<br\s*\/?\s*>)+/i, '')
      .replace(/^["'""]+|["'""]+$/g, '')
      .trim()

    const isRTL = RC.LD === RC._CONST.RTL

    let el = document.getElementById(TAKE_OFF_GLASSES_ID)
    if (!el) {
      el = document.createElement('div')
      el.id = TAKE_OFF_GLASSES_ID
      el.className = 'heading2'
      title.parentNode.appendChild(el)
    }

    el.dir = RC.LD.toLowerCase()
    el.style.position = 'absolute'
    el.style.top = '0'
    el.style.margin = '0'
    el.style.padding = '0'
    el.style.width = 'auto'
    el.style.pointerEvents = 'none'
    el.style.zIndex = '5'
    el.style.display = 'block'
    el.style.textAlign = isRTL ? 'right' : 'left'
    // Corner inset: 1rem from the right (LTR) / left (RTL) edge — the same inner
    // margin the illustration container below uses, so they share an edge.
    // Cap the initial width so the body never flashes full-width before align().
    el.style.maxWidth = '40vw'
    if (isRTL) {
      el.style.left = '1rem'
      el.style.right = 'auto'
    } else {
      el.style.right = '1rem'
      el.style.left = 'auto'
    }

    // Two stacked block lines in one column, sharing the same start edge: an
    // enlarged title and a body, both wrapping within the column width that
    // align() computes from the space beside the video.
    el.innerHTML =
      `<div class="rc-take-off-your-glasses-title" style="font-size:${titleFontSize};line-height:1.1;white-space:normal;margin:0;padding:0;">${processInlineFormatting(titleRaw)}</div>` +
      `<div class="rc-take-off-your-glasses-body" style="margin:0.5rem 0 0 0;padding:0;line-height:1.3;white-space:normal;${bodyFontSize ? `font-size:${bodyFontSize};` : ''}">${processInlineFormatting(bodyRaw)}</div>`

    // Tight glyph bounding box (accounts for per-font-size side bearing).
    const textRect = elem => {
      const r = document.createRange()
      r.selectNodeContents(elem)
      return r.getBoundingClientRect()
    }

    const align = () => {
      const titleEl = el.querySelector('.rc-take-off-your-glasses-title')
      const bodyEl = el.querySelector('.rc-take-off-your-glasses-body')
      if (!titleEl || !bodyEl || !document.getElementById(TAKE_OFF_GLASSES_ID))
        return

      // Right edge (LTR) / left edge (RTL) uses a 1rem inset — the same inner
      // margin the illustration container below uses — so the text block and the
      // illustration share the same outer margin.
      if (isRTL) {
        el.style.left = '1rem'
        el.style.right = 'auto'
      } else {
        el.style.right = '1rem'
        el.style.left = 'auto'
      }

      // Keep a constant point size (heading2 base with the phrase's own
      // font-size) so it matches RC_PutYourGlassesBackOn on every screen — no
      // per-screen shrinking. Size the corner box to the full space between
      // the screen edge and the near edge of the video, so text wraps within
      // that column: with RTL right-alignment (LTR left-alignment) the lines
      // hug the video edge, and nothing spills past the screen edge.
      titleEl.style.transform = ''
      const remPx =
        parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      const videoEl = document.getElementById('webgazerVideoContainer')
      let availableWidth = Math.floor(window.innerWidth * 0.4)
      if (videoEl) {
        const vRect = videoEl.getBoundingClientRect()
        if (vRect.width > 0) {
          // 1rem corner inset (matching the illustration container) plus a
          // 1rem gap between the text block and the video.
          const space = isRTL
            ? vRect.left - 2 * remPx
            : window.innerWidth - vRect.right - 2 * remPx
          if (space > 6 * remPx) availableWidth = Math.floor(space)
        }
      }
      el.style.maxWidth = ''
      el.style.width = `${availableWidth}px`

      // Compensate the enlarged title's larger side bearing so its first glyph
      // lines up exactly with the body's first glyph (no indent).
      const tRect = textRect(titleEl)
      const bRect = textRect(bodyEl)
      if (tRect.width > 0 && bRect.width > 0) {
        const delta = isRTL
          ? bRect.right - tRect.right
          : bRect.left - tRect.left
        if (Math.abs(delta) > 0.5) {
          titleEl.style.transform = `translateX(${delta}px)`
        }
      }

      // Align the title top edge with the Distance title.
      const currentTop = parseFloat(el.style.top) || 0
      const topDelta =
        title.getBoundingClientRect().top - titleEl.getBoundingClientRect().top
      el.style.top = `${currentTop + topDelta}px`
    }

    requestAnimationFrame(() => {
      align()
      setTimeout(align, 60)
      setTimeout(align, 200)
    })
  }

  const hideTakeOffGlasses = () => {
    const el = document.getElementById(TAKE_OFF_GLASSES_ID)
    if (el) el.style.display = 'none'
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
    const newPhraseKey = 'RC_UseObjectToSetViewingDistanceToLocationFirstPage'

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

    // Ask the participant to remove their glasses during viewing-distance
    // measurement (opposite corner from the title).
    renderTakeOffGlasses()

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
        config.setStepModel(parsedModel, 0, phraseKey)
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

    // 9. Hand-preference selector (below stepper, above bottom of screen)
    const existingHandSel = document.querySelector(
      '.rc-hand-preference-selector',
    )
    if (existingHandSel) existingHandSel.remove()

    if (config.onHandPreferenceChange && instructionsContainer) {
      const handSel = createHandPreferenceSelector({
        phrases,
        lang: RC.L,
        preferRight: preferRightHandBool,
        onChange: isRight => {
          config.onHandPreferenceChange(isRight)

          // Live-refresh stepper text to reflect the new hand/eye preference
          if (isNewPhrase && config.setStepModel && parseInstructions) {
            const refreshedText = buildLocationInstructions(
              phraseKey,
              location,
              isRight,
              saveSnapshots,
              RC.L,
              phrases,
            )
            try {
              const refreshedModel = parseInstructions(refreshedText, {
                assetMap: test_assetMap,
              })
              config.setStepModel(refreshedModel, null, phraseKey)
              if (renderCurrentStepView) renderCurrentStepView()
            } catch (e) {
              console.warn('Failed to refresh stepper on hand change', e)
            }
          }
        },
        objectPhraseKey: 'RC_paperTube',
        marginStart: '3rem',
      })
      instructionsContainer.appendChild(handSel)
    }

    // 10. Fit stepper + hand selector into available vertical space
    const fitInstructions = () => {
      fitContentToAvailableSpace({
        wrapper: instructionsContainer,
        navHintEl: instructionsContainer.querySelector('.rc-stepper-nav-hint'),
        stepperBox: instructionsContainer.querySelector('.rc-stepper-box'),
        handSelector: instructionsContainer.querySelector(
          '.rc-hand-preference-selector',
        ),
        barHeight: 44,
        fillTarget: 0.95,
        fitStepper: fitStepperBoxToHeight,
      })
    }
    requestAnimationFrame(() => {
      fitInstructions()
      setTimeout(fitInstructions, 100)
    })

    // 11. Log ready state
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
    const takeOff = document.getElementById(TAKE_OFF_GLASSES_ID)
    if (takeOff && takeOff.parentNode) {
      takeOff.parentNode.removeChild(takeOff)
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
