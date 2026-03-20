/**
 * pageController.js
 *
 * Factory function that orchestrates page navigation for the object-based
 * distance calibration test.  Faithfully reproduces the showPage (legacy
 * distance.js L6655-7171) and nextPage (L7173-7479) logic.
 *
 * Pages:
 *   0  – instructions only, video shown, tape hidden, proceed button shown
 *   1  – no lines, video shown, explanation button shown
 *   2  – tape shown (non-paper) or paper selection (paper mode)
 *   tubeCheck – tube check tape shown, all other UI hidden
 *   3  – measurement page via measurementPageRenderer
 */

import {
  TUBE_CHECK_INITIAL_LENGTH_CM,
  TUBE_CHECK_EDGE_MARGIN_PX,
  HALF_LENGTH_SCREEN_RATIO,
} from './objectTestConstants'
import { debugLog, debugWarn } from './debugLogger'

/**
 * Sentinel value for the tube-check page, matching legacy `TUBE_CHECK_PAGE`.
 * @type {string}
 */
const TUBE_CHECK_PAGE = 'tubeCheck'

/**
 * Create a page controller that manages all page transitions for the
 * object-based distance calibration flow.
 *
 * @param {object} deps - All UI elements, state managers, helpers, and config
 *   required to replicate the legacy showPage / nextPage behaviour.
 *
 * @param {object}      deps.RC                          - RemoteCalibrator instance
 * @param {object}      deps.phrases                     - i18n phrase map
 * @param {object}      deps.options                     - Calibration options bag
 * @param {HTMLElement} deps.container                   - Main calibration container
 * @param {HTMLElement} deps.title                       - Title element
 * @param {HTMLElement} deps.instructionsContainer       - Instructions wrapper
 * @param {HTMLElement} deps.buttonContainer              - Container for proceed/ok buttons
 * @param {HTMLElement} deps.proceedButton               - Proceed button
 * @param {HTMLElement} deps.explanationButton           - Explanation button
 * @param {HTMLElement} deps.rulerShiftButton             - Ruler-shift button
 * @param {HTMLElement} deps.unitRadioContainer           - Unit selection radios wrapper
 * @param {HTMLElement} deps.dontUseRulerColumn           - "Don't use ruler yet" warning
 * @param {HTMLElement} deps.dontUseYourRulerNote         - Fixed "DON'T USE RULER" note (paper mode)
 * @param {HTMLElement} deps.paperSelectionContainer      - Paper selection UI wrapper
 * @param {HTMLElement} deps.paperStepperMediaContainer   - Paper stepper media wrapper
 * @param {HTMLElement} deps.paperValidationMessage       - Paper validation message element
 * @param {object}      deps.tape                        - Diagonal tape component
 * @param {object}      deps.leftLabel                   - Left label component
 * @param {object}      deps.rightLabel                  - Right label component
 * @param {object}      deps.tubeCheckTape               - Tube check tape component
 * @param {object}      deps.measurementPageRenderer     - Measurement page renderer
 * @param {object}      deps.measurementState            - Measurement iteration state manager
 * @param {object}      deps.locationManager             - Location measurement manager
 * @param {object}      deps.objectTestCommonData        - Telemetry state manager
 * @param {object}      deps.objectLengthCmGlobal        - { value: number } shared ref
 * @param {object}      deps.globalPointXYPx             - { value: [x,y] } shared ref
 * @param {boolean}     deps.isPaperSelectionMode        - Whether paper selection mode is active
 * @param {boolean}     deps.showLength                  - Whether ruler length is shown
 * @param {number}      deps.pxPerCm                     - Pixels per centimetre
 * @param {number}      deps.pxPerMm                     - Pixels per millimetre
 * @param {number}      deps.ppi                         - Pixels per inch
 * @param {Function}    deps.setInstructionsText          - Sets plain text instructions
 * @param {Function}    deps.updateInstructions           - Updates instructions for current iteration
 * @param {Function}    deps.updateDiagonalLabels         - Recalculates tape label positions
 * @param {Function}    deps.updateRulerMarkings          - Recalculates ruler markings
 * @param {Function}    deps.computeNewIntervalCm         - Returns a randomised interval in cm
 * @param {Function}    deps.updateTubeCheckTapePosition  - Repositions the tube check tape
 * @param {Function}    deps.clearMeasurementOverlay      - Clears measurement overlay
 * @param {Function}    deps.removeBigCircle              - Removes the big circle element
 * @param {Function}    deps.hideVideoResolutionLabel     - Hides the video resolution label
 * @param {Function}    deps.showVideoResolutionLabel     - Shows the video resolution label
 * @param {Function}    deps.setDefaultVideoPosition      - Positions video at the default spot
 * @param {Function}    deps.positionVideoForLocation     - Positions video for a given location
 * @param {Function}    deps.getGlobalPointForLocation    - Returns global point for a location
 * @param {Function}    deps.getOffsetPx                  - Returns offset in px
 * @param {Function}    deps.buildMeasurementPageConfig   - Builds page config from location manager
 * @param {Function}    deps.updateMeasurementOverlayForLocation - Updates measurement overlay
 * @param {Function}    deps.resetTitleToDefault           - Resets title (no progress counter)
 * @param {Function}    deps.updateTitleWithProgress       - Updates title with progress counter
 * @param {Function}    deps.renderViewingDistanceProgressTitle - Renders "Distance N of M" title
 * @param {Function}    deps.processInlineFormatting       - Converts markdown to HTML
 * @param {Function}    deps.resetPage2ForNextMeasurement  - Resets tape & UI for next measurement
 * @param {Function}    deps.initPaperStepper              - (Re-)initialises the paper stepper
 * @param {Function}    deps.swalInfoOptions               - SweetAlert options helper
 * @param {Function}    deps.Swal                          - SweetAlert2 module
 * @param {Function}    deps.toFixedNumber                 - Rounds to N decimal places
 * @param {Function}    deps.isFullscreen                  - Returns true when fullscreen
 * @param {Function}    deps.forceFullscreen               - Forces fullscreen mode
 *
 * @param {Function}    deps.getStartX                    - Returns current startX
 * @param {Function}    deps.getStartY                    - Returns current startY
 * @param {Function}    deps.getEndX                      - Returns current endX
 * @param {Function}    deps.getEndY                      - Returns current endY
 * @param {Function}    deps.getScreenWidth               - Returns current screenWidth
 * @param {Function}    deps.getSelectedUnit               - Returns current selectedUnit
 * @param {Function}    deps.getSelectedPaperOption        - Returns selected paper option key
 * @param {Function}    deps.getSelectedPaperLengthCm      - Returns selected paper length in cm
 * @param {Function}    deps.getPaperSuggestionValue       - Returns suggestion text value
 * @param {Function}    deps.getPaperSelectionOptions      - Returns the paper selection options array
 * @param {Function}    deps.getPreferRightHandBool        - Returns hand preference boolean
 * @param {Function}    deps.setPreferRightHandBool        - Sets hand preference boolean
 *
 * @param {Function}    deps.getFirstMeasurement           - Returns firstMeasurement value
 * @param {Function}    deps.setFirstMeasurement           - Sets firstMeasurement value
 *
 * @param {Function}    deps.getStepInstructionModel       - Returns step instruction model
 * @param {Function}    deps.setStepInstructionModel       - Sets step instruction model
 * @param {Function}    deps.getCurrentStepFlatIndex       - Returns current step flat index
 * @param {Function}    deps.setCurrentStepFlatIndex       - Sets current step flat index
 * @param {Function}    deps.setCurrentStepperPhraseKey    - Sets current stepper phrase key
 * @param {Function}    deps.getLeftInstructionsText       - Returns left instructions text element
 * @param {Function}    deps.getRightInstructionsText      - Returns right instructions text element
 * @param {Function}    deps.getSectionMediaContainer      - Returns section media container element
 * @param {Function}    deps.getPaperStepperLeftText       - Returns paper stepper left text element
 * @param {Function}    deps.getPaperStepperRightText      - Returns paper stepper right text element
 * @param {Function}    deps.getPaperCurrentStepFlatIndex  - Returns paper current step flat index
 * @param {Function}    deps.setPaperCurrentStepFlatIndex  - Sets paper current step flat index
 *
 * @param {Function}    deps.getArrowIndicators            - Returns current arrow indicators ref
 * @param {Function}    deps.setArrowIndicators            - Sets arrow indicators ref
 * @param {Function}    deps.getMatchHalfLengthBool        - Returns matchHalfLengthBool
 * @param {Function}    deps.setMatchHalfLengthBool        - Sets matchHalfLengthBool
 * @param {Function}    deps.getTubeCheckLeftDistPx        - Returns tubeCheckLeftDistPx
 * @param {Function}    deps.setTubeCheckLeftDistPx        - Sets tubeCheckLeftDistPx
 * @param {Function}    deps.getTubeCheckTapeLengthPx      - Returns tubeCheckTapeLengthPx
 * @param {Function}    deps.setTubeCheckTapeLengthPx      - Sets tubeCheckTapeLengthPx
 * @param {Function}    deps.setTubeCheckTapeAdjusted      - Sets tubeCheckTapeAdjusted flag
 *
 * @param {Function}    deps.getViewingDistanceMeasurementCount - Returns counter
 * @param {Function}    deps.setViewingDistanceMeasurementCount - Sets counter
 * @param {Function}    deps.getViewingDistanceTotalExpected    - Returns expected total
 * @param {Function}    deps.setViewingDistanceTotalExpected    - Sets expected total
 *
 * @param {Function}    deps.getFaceMeshSamplesPage3       - Returns page 3 face mesh samples
 * @param {Function}    deps.getFaceMeshSamplesPage4       - Returns page 4 face mesh samples
 *
 * @param {Function}    deps.getIntervalCmCurrent          - Returns current interval in cm
 * @param {Function}    deps.setIntervalCmCurrent          - Sets current interval in cm
 *
 * @param {string}      deps.dontUseYourRulerRaw           - Raw "don't use ruler" text
 *
 * @returns {{
 *   showPage: (pageNumber: number|string) => Promise<void>,
 *   nextPage: () => Promise<boolean|void>,
 *   getCurrentPage: () => number|string,
 *   cleanup: () => void
 * }}
 */
export function createPageController(deps) {
  const {
    RC,
    phrases,
    options,
    container,
    title,
    instructionsContainer,
    buttonContainer,
    proceedButton,
    explanationButton,
    rulerShiftButton,
    unitRadioContainer,
    dontUseRulerColumn,
    dontUseYourRulerNote,
    paperSelectionContainer,
    paperStepperMediaContainer,
    paperValidationMessage,
    tape,
    leftLabel,
    rightLabel,
    tubeCheckTape,
    measurementPageRenderer,
    measurementState,
    locationManager,
    objectTestCommonData,
    objectLengthCmGlobal,
    globalPointXYPx,
    isPaperSelectionMode,
    showLength,
    pxPerCm,
    pxPerMm,
    ppi,
    setInstructionsText,
    updateInstructions,
    updateDiagonalLabels,
    updateRulerMarkings,
    computeNewIntervalCm,
    updateTubeCheckTapePosition,
    clearMeasurementOverlay,
    removeBigCircle,
    hideVideoResolutionLabel,
    showVideoResolutionLabel,
    setDefaultVideoPosition,
    positionVideoForLocation,
    getGlobalPointForLocation,
    getOffsetPx,
    buildMeasurementPageConfig,
    updateMeasurementOverlayForLocation,
    resetTitleToDefault,
    updateTitleWithProgress,
    renderViewingDistanceProgressTitle,
    processInlineFormatting,
    resetPage2ForNextMeasurement,
    initPaperStepper,
    swalInfoOptions,
    Swal,
    toFixedNumber,
    isFullscreen,
    forceFullscreen,

    getStartX,
    getStartY,
    getEndX,
    getEndY,
    getScreenWidth,
    getSelectedUnit,
    getSelectedPaperOption,
    getSelectedPaperLengthCm,
    getPaperSuggestionValue,
    getPaperSelectionOptions,
    getPreferRightHandBool,
    setPreferRightHandBool,

    getFirstMeasurement,
    setFirstMeasurement,

    getStepInstructionModel,
    setStepInstructionModel,
    getCurrentStepFlatIndex,
    setCurrentStepFlatIndex,
    setCurrentStepperPhraseKey,
    getLeftInstructionsText,
    getRightInstructionsText,
    getSectionMediaContainer,
    getPaperStepperLeftText,
    getPaperStepperRightText,
    getPaperCurrentStepFlatIndex,
    setPaperCurrentStepFlatIndex,

    getArrowIndicators,
    setArrowIndicators,
    getMatchHalfLengthBool,
    setMatchHalfLengthBool,
    getTubeCheckLeftDistPx,
    setTubeCheckLeftDistPx,
    getTubeCheckTapeLengthPx,
    setTubeCheckTapeLengthPx,
    setTubeCheckTapeAdjusted,

    getViewingDistanceMeasurementCount,
    setViewingDistanceMeasurementCount,
    getViewingDistanceTotalExpected,
    setViewingDistanceTotalExpected,

    getFaceMeshSamplesPage3,
    getFaceMeshSamplesPage4,

    getIntervalCmCurrent,
    setIntervalCmCurrent,

    dontUseYourRulerRaw,

    setCurrentPage,
  } = deps

  // ─── Page state (legacy distance.js L3507-3510) ───────────────────────
  let currentPage = 1
  let savedMeasurementData = null

  // Guard flag: prevents the finish function from firing more than once
  // (legacy distance.js L6655-6657)
  let objectTestHasFinished = false

  // ──────────────────────────────────────────────────────────────────────
  // showPage — legacy distance.js L6659-7171
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Transition to a given page, showing / hiding the appropriate UI elements.
   *
   * @param {number|string} pageNumber - The page to show (0, 1, 2, 'tubeCheck', 3).
   * @returns {Promise<void>}
   */
  const showPage = async pageNumber => {
    const previousPage = currentPage
    currentPage = pageNumber
    if (setCurrentPage) setCurrentPage(pageNumber)

    // Clear measurement overlay and big circle when navigating away from measurement pages
    if (pageNumber !== 3 && pageNumber !== 4) {
      clearMeasurementOverlay()
      removeBigCircle()
    }

    // Clear stepper media containers to prevent lingering images/videos from previous pages.
    // Both the main section media and paper stepper media are viewport-positioned fixed
    // elements on document.body. Clearing innerHTML alone is not enough -- the empty
    // container can still be visible. We also hide them; renderStepInstructions will
    // re-show the media container when it populates new content.
    const smc = getSectionMediaContainer ? getSectionMediaContainer() : null
    if (smc) {
      smc.innerHTML = ''
      smc.style.display = 'none'
    }
    if (paperStepperMediaContainer) {
      paperStepperMediaContainer.innerHTML = ''
      paperStepperMediaContainer.style.display = 'none'
    }
    // Also remove any stray .rc-stepper-media-container elements from document.body
    document
      .querySelectorAll('body > .rc-stepper-media-container')
      .forEach(el => {
        el.innerHTML = ''
        el.style.display = 'none'
      })

    // Hide tube check tape when navigating away from tube check page
    if (pageNumber !== TUBE_CHECK_PAGE) {
      tubeCheckTape.container.style.display = 'none'
    }

    // ===================== PAGE 0: INSTRUCTIONS ONLY =====================
    if (pageNumber === 0) {
      hideVideoResolutionLabel()
      debugLog('pageController', '=== SHOWING PAGE 0: INSTRUCTIONS ONLY ===')
      console.log('=== SHOWING PAGE 0: INSTRUCTIONS ONLY ===')

      resetTitleToDefault()

      RC.showVideo(true)

      const videoContainer = document.getElementById('webgazerVideoContainer')
      if (videoContainer) {
        delete videoContainer.dataset.screenCenterMode
        setDefaultVideoPosition(RC, videoContainer)
      }

      rulerShiftButton.style.display = 'none'

      tape.container.style.display = 'none'
      if (leftLabel.container.parentNode) {
        leftLabel.container.parentNode.removeChild(leftLabel.container)
      }
      if (rightLabel.container.parentNode) {
        rightLabel.container.parentNode.removeChild(rightLabel.container)
      }

      unitRadioContainer.style.display = 'none'

      proceedButton.style.display = 'block'

      explanationButton.style.display = 'none'

      setInstructionsText(phrases.RC_UseObjectToSetViewingDistancePage0q[RC.L])

      dontUseRulerColumn.style.display = 'none'
      dontUseYourRulerNote.style.display = 'none'
      paperSelectionContainer.style.display = 'none'
      paperStepperMediaContainer.style.display = 'none'
      if (paperStepperMediaContainer) paperStepperMediaContainer.innerHTML = ''
      container.style.backgroundColor = ''

      // ===================== PAGE 1: NO LINES =====================
    } else if (pageNumber === 1) {
      debugLog('pageController', '=== SHOWING PAGE 1: NO LINES ===')
      console.log('=== SHOWING PAGE 1: NO LINES ===')
      dontUseYourRulerNote.style.display = 'none'
      paperSelectionContainer.style.display = 'none'
      paperStepperMediaContainer.style.display = 'none'
      if (paperStepperMediaContainer) paperStepperMediaContainer.innerHTML = ''
      container.style.backgroundColor = ''

      RC.showVideo(true)
      showVideoResolutionLabel(RC)

      const videoContainer = document.getElementById('webgazerVideoContainer')
      if (videoContainer) {
        delete videoContainer.dataset.screenCenterMode
        setDefaultVideoPosition(RC, videoContainer)
      }

      rulerShiftButton.style.display = 'none'

      tape.container.style.display = 'none'
      if (leftLabel.container.parentNode) {
        leftLabel.container.parentNode.removeChild(leftLabel.container)
      }
      if (rightLabel.container.parentNode) {
        rightLabel.container.parentNode.removeChild(rightLabel.container)
      }

      unitRadioContainer.style.display = 'none'

      explanationButton.style.display = 'block'

      proceedButton.style.display = 'block'

      dontUseRulerColumn.style.display = 'none'

      setInstructionsText(phrases.RC_UseObjectToSetViewingDistancePage1[RC.L])

      // ===================== PAGE 2: DIAGONAL TAPE =====================
    } else if (pageNumber === 2) {
      debugLog('pageController', '=== SHOWING PAGE 2: DIAGONAL TAPE ===')
      console.log('=== SHOWING PAGE 2: DIAGONAL TAPE ===')
      hideVideoResolutionLabel()

      if (!isPaperSelectionMode) {
        paperSelectionContainer.style.display = 'none'
        paperStepperMediaContainer.style.display = 'none'
      }

      if (isPaperSelectionMode) {
        container.style.backgroundColor = ''
        title.style.display = 'block'
        setViewingDistanceMeasurementCount(1)
        renderViewingDistanceProgressTitle()
        instructionsContainer.style.margin = '0 0 0 0'

        // When returning to page 2 from pages 3/4, reset the step-by-step
        // instruction renderer so only the paper selection UI is shown.
        setStepInstructionModel(null)
        setCurrentStepFlatIndex(0)
        const leftText = getLeftInstructionsText()
        const rightText = getRightInstructionsText()
        const mediaContainer = getSectionMediaContainer()
        if (leftText) leftText.textContent = ''
        if (rightText) rightText.textContent = ''
        if (mediaContainer) mediaContainer.innerHTML = ''

        // Hide unused UI
        const arrows = getArrowIndicators()
        if (arrows) {
          arrows.remove()
          setArrowIndicators(null)
        }
        RC.showVideo(false)
        tape.container.style.display = 'none'
        if (leftLabel.container.parentNode) {
          leftLabel.container.parentNode.removeChild(leftLabel.container)
        }
        if (rightLabel.container.parentNode) {
          rightLabel.container.parentNode.removeChild(rightLabel.container)
        }
        unitRadioContainer.style.display = 'none'
        dontUseRulerColumn.style.display = 'none'
        rulerShiftButton.style.display = 'none'
        explanationButton.style.display = 'none'

        // Show the fixed "DON'T USE RULER" note in the upper right (paper mode)
        if (
          options.calibrateDistanceCheckBool === true &&
          dontUseYourRulerRaw.trim().length
        ) {
          dontUseYourRulerNote.style.display = 'block'
        }

        paperSelectionContainer.style.display = 'flex'
        paperStepperMediaContainer.style.display = 'block'
        paperValidationMessage.style.display = 'none'
        proceedButton.style.display = 'block'
        proceedButton.disabled = !getSelectedPaperLengthCm()

        // Re-initialise the paper stepper (resets to first step when returning)
        setPaperCurrentStepFlatIndex(0)
        initPaperStepper()

        // Keep proceed button fixed at bottom right of screen
        buttonContainer.style.position = 'fixed'
        buttonContainer.style.bottom = '20px'
        if (RC.LD === RC._CONST.RTL) {
          buttonContainer.style.left = '20px'
          buttonContainer.style.right = ''
        } else {
          buttonContainer.style.right = '20px'
          buttonContainer.style.left = ''
        }
        document.body.appendChild(buttonContainer)

        // Clear right column so warnings render under radios
        const rightInstr = getRightInstructionsText()
        if (rightInstr) {
          rightInstr.textContent = ''
        }
      } else {
        // ── Non-paper mode ─────────────────────────────────────────────
        container.style.backgroundColor = ''
        if (paperStepperMediaContainer)
          paperStepperMediaContainer.innerHTML = ''
        const paperStepperLeft = getPaperStepperLeftText()
        const paperStepperRight = getPaperStepperRightText()
        if (paperStepperLeft) paperStepperLeft.innerHTML = ''
        if (paperStepperRight) paperStepperRight.innerHTML = ''

        // Restore default button position (fixed at bottom right)
        buttonContainer.style.position = 'fixed'
        buttonContainer.style.bottom = '230px'
        if (RC.LD === RC._CONST.RTL) {
          buttonContainer.style.left = '20px'
          buttonContainer.style.right = ''
        } else {
          buttonContainer.style.right = '20px'
          buttonContainer.style.left = ''
        }
        document.body.appendChild(buttonContainer)
        const rightInstr = getRightInstructionsText()
        if (rightInstr) {
          rightInstr.textContent = ''
        }

        title.style.display = 'block'
        updateTitleWithProgress()
        updateTitleWithProgress()

        instructionsContainer.style.margin = '2rem 0 5rem 0'

        const arrows = getArrowIndicators()
        if (arrows) {
          arrows.remove()
          setArrowIndicators(null)
        }

        RC.showVideo(false)

        tape.container.style.display = 'block'

        if (!leftLabel.container.parentNode) {
          container.appendChild(leftLabel.container)
        }
        leftLabel.container.style.display = 'block'

        if (!rightLabel.container.parentNode) {
          container.appendChild(rightLabel.container)
        }
        rightLabel.container.style.display = 'block'

        updateDiagonalLabels()

        unitRadioContainer.style.display = showLength ? 'flex' : 'none'

        proceedButton.style.display = 'none'

        explanationButton.style.display = 'block'

        if (options.calibrateDistanceCheckBool) {
          dontUseRulerColumn.style.display = 'block'
          dontUseRulerColumn.innerHTML = processInlineFormatting(
            phrases.RC_DontUseYourRulerYet?.[RC.L] || '',
          )
          dontUseRulerColumn.style.color = '#8B0000'
          dontUseRulerColumn.style.fontWeight = 'normal'
          dontUseRulerColumn.style.userSelect = 'none'
        }

        updateDiagonalLabels()

        rulerShiftButton.style.display = 'none'

        updateInstructions()
        if (!showLength) {
          setIntervalCmCurrent(computeNewIntervalCm())
          updateRulerMarkings()
        }
      }

      // ===================== TUBE CHECK PAGE (paper mode only) =====================
    } else if (pageNumber === TUBE_CHECK_PAGE) {
      debugLog('pageController', '=== SHOWING TUBE CHECK PAGE ===')
      console.log('=== SHOWING TUBE CHECK PAGE ===')
      hideVideoResolutionLabel()

      RC.showVideo(false)
      tape.container.style.display = 'none'
      if (leftLabel.container.parentNode) {
        leftLabel.container.parentNode.removeChild(leftLabel.container)
      }
      if (rightLabel.container.parentNode) {
        rightLabel.container.parentNode.removeChild(rightLabel.container)
      }
      unitRadioContainer.style.display = 'none'
      dontUseRulerColumn.style.display = 'none'
      dontUseYourRulerNote.style.display = 'none'
      rulerShiftButton.style.display = 'none'
      explanationButton.style.display = 'none'
      proceedButton.style.display = 'none'
      paperSelectionContainer.style.display = 'none'
      paperStepperMediaContainer.style.display = 'none'
      if (paperStepperMediaContainer) paperStepperMediaContainer.innerHTML = ''
      container.style.backgroundColor = ''
      const arrows = getArrowIndicators()
      if (arrows) {
        arrows.remove()
        setArrowIndicators(null)
      }

      // Show title with progress counter: "Distance 2 of N"
      title.style.display = 'block'
      setViewingDistanceMeasurementCount(2)
      renderViewingDistanceProgressTitle()

      // Determine whether to do full-size or half-size matching
      const sw = window.innerWidth
      const sh = window.innerHeight
      const diagScreenCm = Math.sqrt(sw * sw + sh * sh) / pxPerCm
      const expectedLengthCm = getSelectedPaperLengthCm()
      const matchHalf =
        expectedLengthCm > HALF_LENGTH_SCREEN_RATIO * diagScreenCm
      setMatchHalfLengthBool(matchHalf)
      objectTestCommonData.matchHalfLengthBool = matchHalf
      console.log(
        `Tube check: expectedLengthCm=${expectedLengthCm}, diagScreenCm=${diagScreenCm.toFixed(1)}, matchHalfLengthBool=${matchHalf}`,
      )

      // Set instruction text based on full vs half matching
      const matchLengthText = matchHalf
        ? phrases.RC_MatchHalfLength?.[RC.L]
        : phrases.RC_MatchLength?.[RC.L]
      setInstructionsText(matchLengthText)

      // Reset tube check state
      setTubeCheckTapeAdjusted(false)
      const diagPxInit = Math.sqrt(sw * sw + sh * sh)
      const expectedDisplayCm = matchHalf
        ? expectedLengthCm / 2
        : expectedLengthCm
      const expectedDisplayPx = expectedDisplayCm * pxPerCm
      const centeredLeftDist = (diagPxInit - expectedDisplayPx) / 2
      const edgeMargin = TUBE_CHECK_EDGE_MARGIN_PX
      const minDiagDist = Math.max(
        (edgeMargin * diagPxInit) / sw,
        (edgeMargin * diagPxInit) / sh,
      )
      const clampedCenteredLeftDist = Math.max(minDiagDist, centeredLeftDist)
      const twInit = tubeCheckTape.dimensions.tapeWidth
      const minLeftDistInit = (twInit / 2) * Math.max(sw / sh, sh / sw)
      setTubeCheckLeftDistPx(
        Math.max(minLeftDistInit, clampedCenteredLeftDist / 2),
      )
      setTubeCheckTapeLengthPx(TUBE_CHECK_INITIAL_LENGTH_CM * pxPerCm)
      updateTubeCheckTapePosition()

      tubeCheckTape.container.style.display = 'block'

      // ===================== PAGE 3: VIDEO ONLY =====================
    } else if (pageNumber === 3) {
      dontUseYourRulerNote.style.display = 'none'
      const currentLocInfo = locationManager.getCurrentLocationInfo()
      globalPointXYPx.value = getGlobalPointForLocation(
        currentLocInfo.location,
        getOffsetPx(),
        RC,
      )
      debugLog('pageController', '=== SHOWING PAGE 3: VIDEO ONLY ===')
      console.log('=== SHOWING PAGE 3: VIDEO ONLY ===')

      const pageConfig = buildMeasurementPageConfig(
        locationManager,
        options.saveSnapshots || false,
        getPreferRightHandBool(),
        getOffsetPx(),
      )

      if (pageConfig) {
        if (previousPage !== 3) {
          setViewingDistanceMeasurementCount(
            pageConfig.locationIndex + 1 + (isPaperSelectionMode ? 2 : 0),
          )
        }
        setViewingDistanceTotalExpected(
          pageConfig.totalLocations + (isPaperSelectionMode ? 2 : 0),
        )

        const pageResult = await measurementPageRenderer.showMeasurementPage({
          ...pageConfig,
          pageNumberOffset: isPaperSelectionMode ? 2 : 0,
          onProgressUpdate: (current, total) => {
            console.log(`Progress update: ${current} of ${total}`)
          },
          setStepModel: (model, index, phraseKey) => {
            setStepInstructionModel(model)
            if (index != null) setCurrentStepFlatIndex(index)
            const maxIdx = (model?.flatSteps?.length || 1) - 1
            if (getCurrentStepFlatIndex() > maxIdx)
              setCurrentStepFlatIndex(maxIdx)
            if (phraseKey) setCurrentStepperPhraseKey(phraseKey)
          },
          onHandPreferenceChange: isRight => {
            setPreferRightHandBool(isRight)
            updateMeasurementOverlayForLocation()
          },
        })

        setArrowIndicators(pageResult.arrowIndicators)

        updateMeasurementOverlayForLocation()

        console.log(
          `Measurement page rendered for location ${pageConfig.locationIndex}: ${pageConfig.locEye}`,
        )
      } else {
        console.log('Location manager complete, using legacy page 3 behavior')
        measurementPageRenderer.hideCommonElements()
        RC.showVideo(true)
        positionVideoForLocation(RC, 'camera')
        setArrowIndicators(measurementPageRenderer.updateArrows('camera'))
        clearMeasurementOverlay()
        removeBigCircle()
      }

      console.log(
        '=== PAGE 3 READY - PRESS SPACE TO CAPTURE FACE MESH DATA ===',
      )
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // nextPage — legacy distance.js L7173-7479
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Advance to the next page according to the current page's rules.
   * Handles measurement saving, consistency checking, and page transitions.
   *
   * @returns {Promise<boolean|void>} `true` when paper mode proceeds to
   *   tube check, `false` when paper validation fails, otherwise void.
   */
  const nextPage = async () => {
    if (currentPage === 0) {
      await showPage(2) // Skip page 1, go directly to page 2
    } else if (currentPage === 1) {
      await showPage(2)
    } else if (currentPage === 2) {
      // ── Paper selection mode ───────────────────────────────────────
      if (isPaperSelectionMode) {
        const selectedPaperOption = getSelectedPaperOption()
        const selectedPaperLengthCm = getSelectedPaperLengthCm()

        if (!selectedPaperOption || selectedPaperLengthCm === null) {
          paperValidationMessage.textContent =
            phrases.RC_PleaseSelectAnOption[RC.L]
          paperValidationMessage.style.display = 'block'
          if (typeof proceedButton !== 'undefined') {
            proceedButton.disabled = true
          }
          return false
        }

        const paperTimestamp = performance.now()
        setFirstMeasurement(selectedPaperLengthCm)
        objectLengthCmGlobal.value = selectedPaperLengthCm

        const roundedLength =
          Math.round(Number(selectedPaperLengthCm) * 10) / 10
        objectTestCommonData.objectMeasuredMsg.push('ok')

        objectTestCommonData.objectRulerIntervalCm.push(null)

        measurementState.measurements.push({
          objectLengthCm: selectedPaperLengthCm,
          objectLengthPx: null,
          objectLengthMm: selectedPaperLengthCm * 10,
          timestamp: paperTimestamp,
          selectedUnit: 'paper',
          paperOption: selectedPaperOption,
          objectSuggestion: getPaperSuggestionValue() || null,
        })
        measurementState.currentIteration = measurementState.totalIterations

        const faceMeshPage3 = getFaceMeshSamplesPage3()
        const faceMeshPage4 = getFaceMeshSamplesPage4()
        savedMeasurementData = {
          value: toFixedNumber(selectedPaperLengthCm, 1),
          timestamp: paperTimestamp,
          method: 'object',
          objectSuggestion: getPaperSuggestionValue() || null,
          intraocularDistanceCm: null,
          faceMeshSamplesPage3: faceMeshPage3.map(sample =>
            isNaN(sample) ? sample : Math.round(sample),
          ),
          faceMeshSamplesPage4: faceMeshPage4.map(sample =>
            isNaN(sample) ? sample : Math.round(sample),
          ),
          raw: {
            paperOption: selectedPaperOption,
            paperLabel:
              getPaperSelectionOptions().find(
                o => o.key === selectedPaperOption,
              )?.label || '',
            paperLengthCm: selectedPaperLengthCm,
            objectSuggestion: getPaperSuggestionValue() || null,
            ppi: ppi,
          },
        }

        await showPage(TUBE_CHECK_PAGE)
        return true
      }

      // ── Save measurement data from page 2 (non-paper) ─────────────
      console.log('=== SAVING MEASUREMENT DATA FROM PAGE 2 ===')

      const startX = getStartX()
      const startY = getStartY()
      const endX = getEndX()
      const endY = getEndY()
      const screenWidth = getScreenWidth()
      const selectedUnit = getSelectedUnit()

      const objectLengthPx = tape.helpers.getDistance(
        startX,
        startY,
        endX,
        endY,
      )
      const objectLengthMm = objectLengthPx / pxPerMm
      const objectLengthCm = objectLengthMm / 10
      objectLengthCmGlobal.value = objectLengthCm

      measurementState.measurements.push({
        objectLengthCm,
        objectLengthPx,
        objectLengthMm,
        timestamp: performance.now(),
        startX,
        startY,
        endX,
        endY,
        selectedUnit,
      })

      console.log(
        `Measurement ${measurementState.currentIteration} saved:`,
        objectLengthCm.toFixed(1),
        'cm',
      )

      // Single measurement — accept immediately
      if (measurementState.totalIterations === 1) {
        const faceMeshPage3 = getFaceMeshSamplesPage3()
        const faceMeshPage4 = getFaceMeshSamplesPage4()
        savedMeasurementData = {
          value: toFixedNumber(objectLengthCm, 1),
          timestamp: performance.now(),
          method: 'object',
          intraocularDistanceCm: null,
          faceMeshSamplesPage3: faceMeshPage3.map(sample =>
            isNaN(sample) ? sample : Math.round(sample),
          ),
          faceMeshSamplesPage4: faceMeshPage4.map(sample =>
            isNaN(sample) ? sample : Math.round(sample),
          ),
          raw: {
            startX,
            startY,
            endX,
            endY,
            screenWidth,
            objectLengthPx,
            objectLengthMm,
            ppi,
            selectedUnit,
          },
        }
        console.log('Single measurement accepted:', savedMeasurementData)
        objectTestCommonData.objectMeasuredMsg.push('ok')
        await showPage(3)
        return
      }

      // Need more measurements to reach minimum count
      if (
        measurementState.currentIteration < measurementState.totalIterations
      ) {
        measurementState.currentIteration++
        console.log(
          `Need more measurements: ${measurementState.currentIteration}/${measurementState.totalIterations}`,
        )
        objectTestCommonData.objectMeasuredMsg.push(
          measurementState.lastAttemptWasTooShort ? 'short' : 'ok',
        )
        await resetPage2ForNextMeasurement()
        return
      }

      // Done minimum N measurements — check consistency of last 2
      const consistentPair = checkLastTwoObjectMeasurements(
        measurementState.measurements,
        options.calibrateDistanceAllowedRatioCm,
      )

      if (consistentPair) {
        const geoMean = Math.sqrt(
          consistentPair.values[0] * consistentPair.values[1],
        )
        measurementState.consistentPair = consistentPair
        objectTestCommonData.objectMeasuredMsg.push('ok')

        console.log(
          'Found consistent pair:',
          consistentPair.values,
          '→ geometric mean:',
          geoMean.toFixed(1),
        )

        const firstMeas =
          measurementState.measurements[consistentPair.indices[0]]

        const faceMeshPage3 = getFaceMeshSamplesPage3()
        const faceMeshPage4 = getFaceMeshSamplesPage4()
        savedMeasurementData = {
          value: toFixedNumber(geoMean, 1),
          timestamp: performance.now(),
          method: 'object',
          intraocularDistanceCm: null,
          faceMeshSamplesPage3: faceMeshPage3.map(sample =>
            isNaN(sample) ? sample : Math.round(sample),
          ),
          faceMeshSamplesPage4: faceMeshPage4.map(sample =>
            isNaN(sample) ? sample : Math.round(sample),
          ),
          raw: {
            startX: firstMeas.startX,
            startY: firstMeas.startY,
            endX: firstMeas.endX,
            endY: firstMeas.endY,
            screenWidth,
            objectLengthPx: firstMeas.objectLengthPx,
            objectLengthMm: firstMeas.objectLengthMm,
            ppi,
            selectedUnit,
          },
        }

        RC.objectMeasurements = {
          future: 'To be deleted by end of November 2025.',
          objectLengthCm: measurementState.measurements.map(m =>
            toFixedNumber(m.objectLengthCm, 1),
          ),
          chosen: consistentPair.values.map(v => toFixedNumber(v, 1)),
          mean: toFixedNumber(geoMean, 1),
        }

        console.log(
          'Proceeding to page 3 with geometric mean:',
          geoMean.toFixed(1),
        )
        await showPage(3)
      } else {
        // No consistent pair found
        console.log(
          `consistentPair is null. objectMeasurementCount=${options.objectMeasurementCount}, type=${typeof options.objectMeasurementCount}`,
        )
        console.log(
          `Number of measurements: ${measurementState.measurements.length}`,
        )

        // If objectMeasurementCount is 2, show popup with error message
        if (
          options.objectMeasurementCount === 2 &&
          measurementState.measurements.length >= 2
        ) {
          const lastIdx = measurementState.measurements.length - 1
          const secondLastIdx = measurementState.measurements.length - 2
          const M1 = measurementState.measurements[secondLastIdx].objectLengthCm
          const M2 = measurementState.measurements[lastIdx].objectLengthCm
          const ratio = M2 / M1
          const T = options.calibrateDistanceAllowedRatioCm || 1.1
          const roundedPercent = Math.round(100 * ratio)
          const lowerBound = Math.round(100 / T)
          const upperBound = Math.round(100 * T)

          console.log(
            `///Consistency check failed. Ratio: ${roundedPercent}%. Showing popup.`,
          )
          console.log(`///M1=${M1}, M2=${M2}, ratio=${ratio}`)

          const errorMessage =
            phrases.RC_objectSizeMismatch?.[RC.L]
              ?.replace('[[N1]]', roundedPercent.toString())
              .replace('[[TT1]]', lowerBound.toString())
              .replace('[[TT2]]', upperBound.toString()) ||
            `Measurements are inconsistent. Ratio: ${roundedPercent}%`

          const preventSpacebar = e => {
            if (e.key === ' ' || e.code === 'Space') {
              e.preventDefault()
              e.stopPropagation()
            }
          }

          await Swal.fire({
            ...swalInfoOptions(RC, { showIcon: false }),
            icon: undefined,
            html: processInlineFormatting(errorMessage),
            allowEnterKey: true,
            confirmButtonText:
              phrases.T_ok?.[RC.L] || phrases.RC_OK?.[RC.L] || 'OK',
            didOpen: () => {
              document.addEventListener('keydown', preventSpacebar, true)
            },
            willClose: () => {
              document.removeEventListener('keydown', preventSpacebar, true)
            },
          })

          measurementState.rejectionCount++
          console.log(
            `Rejection count (mismatch): ${measurementState.rejectionCount}`,
          )
        }

        objectTestCommonData.objectMeasuredMsg.push('mismatch')

        measurementState.currentIteration++
        console.log('No consistent measurements found yet, continuing...')
        await resetPage2ForNextMeasurement()
      }
    }
  }

  /**
   * Check whether the last two measurements in a list are consistent
   * within the given threshold ratio.  Reproduces the legacy
   * `checkLastTwoObjectMeasurements` helper.
   *
   * @param {Array<{objectLengthCm: number}>} measurements
   * @param {number} threshold - Allowed ratio (e.g. 1.1)
   * @returns {{indices: [number,number], values: [number,number]}|null}
   */
  function checkLastTwoObjectMeasurements(measurements, threshold) {
    if (measurements.length < 2) return null

    const lastIndex = measurements.length - 1
    const secondLastIndex = measurements.length - 2
    const m1Cm = measurements[secondLastIndex].objectLengthCm
    const m2Cm = measurements[lastIndex].objectLengthCm

    const ratio = Math.max(m1Cm / m2Cm, m2Cm / m1Cm)
    const roundedRatio = Math.round(ratio * 100) / 100
    const roundedMaxThreshold = Math.round(Math.max(threshold, 1 / threshold))

    if (roundedRatio <= roundedMaxThreshold) {
      return { indices: [secondLastIndex, lastIndex], values: [m1Cm, m2Cm] }
    }
    return null
  }

  // ──────────────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────────────

  return {
    /** @see showPage */
    showPage,

    /** @see nextPage */
    nextPage,

    /**
     * Returns the current page identifier.
     * @returns {number|string}
     */
    getCurrentPage() {
      return currentPage
    },

    /**
     * Returns the saved measurement data assembled during page transitions.
     * @returns {object|null}
     */
    getSavedMeasurementData() {
      return savedMeasurementData
    },

    /**
     * Sets the saved measurement data (used by external callers that
     * assemble data outside the page controller, e.g. on page 3/4).
     * @param {object|null} data
     */
    setSavedMeasurementData(data) {
      savedMeasurementData = data
    },

    /**
     * Returns whether the object test finish function has already fired.
     * @returns {boolean}
     */
    hasFinished() {
      return objectTestHasFinished
    },

    /**
     * Marks the object test as finished to prevent double-fire.
     */
    markFinished() {
      objectTestHasFinished = true
    },

    /**
     * Tears down any internal state held by the page controller.
     */
    cleanup() {
      savedMeasurementData = null
      objectTestHasFinished = false
      debugLog('pageController', 'Page controller cleaned up')
    },
  }
}
