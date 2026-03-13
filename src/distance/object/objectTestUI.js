/**
 * objectTestUI.js
 *
 * Bridge between the orchestrator (objectTestOrchestrator.js) and the
 * pageController (pageController.js).
 *
 * The orchestrator builds a `context` object with RC, options, phrases,
 * state managers, factory functions, and utility imports.  The pageController
 * expects ~60+ pre-created DOM elements and state accessors as its `deps`.
 *
 * This module creates ALL shared DOM elements, mutable state, and helper
 * functions that were previously created inline inside the legacy objectTest
 * closure (distance.js L4040-9904).  It returns a single `deps` object
 * that can be spread directly into createPageController / createKeyboardHandler.
 *
 * Faithfully reproduces every id, class, inline style, and event handler
 * from the legacy code.
 */

import { resolveInstructionMediaUrl } from '../instructionMediaCache'

/**
 * Create all UI elements, state, and helpers needed by pageController.
 *
 * @param {object} context - The shared context object built by the orchestrator.
 * @returns {object} deps - Everything pageController/keyboardHandler need.
 */
export function createObjectTestUI(context) {
  const {
    RC,
    options,
    phrases,
    ppi,
    pxPerMm,
    pxPerCm,
    getOffsetPx,
    isPaperSelectionModeBool,
    showLengthBool,
    calibrateDistanceLocations,
    paperSelectionOptions,
    usePaperOnlyChoicesBool,
    measurementState,
    calibrateDistanceOffsetCm,
    objectLengthCmGlobal,
    globalPointXYPx,
    woodSvg,
    test_assetMap,
    // Utility functions
    toFixedNumber,
    isFullscreen,
    forceFullscreen,
    fitToViewport,
    setDefaultVideoPosition,
    parseInstructions,
    processInlineFormatting,
    renderStepInstructions,
    createStepInstructionsUI,
    fitStepperBoxToHeight,
    fitContentToAvailableSpace,
    swalInfoOptions,
    Swal,
    setMeasurementOverlay,
    clearMeasurementOverlay,
    removeBigCircle,
    showVideoResolutionLabel,
    hideVideoResolutionLabel,
    createArrowIndicators: createArrowIndicatorsFn,
    removeArrowIndicatorsFromDOM,
    createLocationMeasurementManager,
    createMeasurementPageRenderer,
    buildMeasurementPageConfig,
    positionVideoForLocation,
    getGlobalPointForLocation,
    // Keyboard handler deps (passed through to deps return object)
    enforceFullscreenOnSpacePress,
    irisTrackingIsActive,
    captureVideoFrame,
    cameraShutterSound,
    stampOfApprovalSound,
    env,
    showPopup,
    callback,
    median,
    constructInstructions,
    getCameraResolutionXY,
    calculateFootXYPx,
    getMeshData,
    saveQueue,
    stateManager,
  } = context

  const isPaperSelectionMode = isPaperSelectionModeBool
  const showLength = showLengthBool
  const usePaperOnlyChoices = usePaperOnlyChoicesBool

  // ===================== MUTABLE STATE =====================

  let viewingDistanceMeasurementCount = 0
  let viewingDistanceTotalExpected = isPaperSelectionMode
    ? calibrateDistanceLocations.length + 2
    : calibrateDistanceLocations.length

  let stepInstructionModel = null
  let currentStepFlatIndex = 0
  let currentStepperPhraseKey = null

  let preferRightHandBool = true
  let selectedUnit = 'inches'

  let firstMeasurement = null
  let intraocularDistanceCm = null

  let faceMeshSamplesPage3 = []
  let cameraResolutionXYVpxPage3 = []
  let faceMeshSamplesPage4 = []
  let cameraResolutionXYVpxPage4 = []
  let meshSamplesDuringPage3 = []
  let meshSamplesDuringPage4 = []
  let page3InstructionsMarginTopPx = null

  let locationMeasurementsData = []
  let currentLocationFaceMeshSamples = []
  let currentLocationMeshSamples = []

  let arrowIndicators = null
  let matchHalfLengthBool = false
  let tubeCheckLeftDistPx = 0
  let tubeCheckTapeLengthPx = 0
  let tubeCheckTapeAdjusted = false

  let intervalCmCurrent = null

  let lastCapturedFaceImage = null

  let screenWidth = window.innerWidth
  let screenHeight = window.innerHeight

  let _showingReadFirstPopup = false
  let objectTestHasFinished = false

  // Paper selection state
  let selectedPaperOption = null
  let selectedPaperLengthCm = null
  let selectedPaperLabel = null
  let paperSuggestionValue = ''

  // Paper stepper state
  let paperStepInstructionModel = null
  let paperCurrentStepFlatIndex = 0

  // ===================== TAPE COORDINATE STATE =====================
  const bottomMarginPx = 80
  const tapeYPosition = screenHeight - bottomMarginPx
  const oneCMInPx = pxPerMm * 10
  const leftMarginPx = oneCMInPx
  const initialRulerLengthPx = screenWidth - oneCMInPx * 2

  let startX = leftMarginPx
  let startY = tapeYPosition
  let endX = leftMarginPx + initialRulerLengthPx
  let endY = tapeYPosition

  // objectTestCommonData: a mutable object matching the legacy shape exactly.
  // The pageController and spaceKeyHandler mutate it directly (push to arrays,
  // set scalar fields).  At save time, the entire object is passed to
  // saveCalibrationMeasurements.  We build the initial structure here, mirroring
  // legacy distance.js L3858-3910.
  //
  // NOTE: We intentionally use a raw mutable object (not the state manager)
  // because the pageController/spaceKeyHandler push to its arrays directly.
  let webcamMaxXYVpx = ''
  let webcamMaxHz = null
  if (RC.gazeTracker?.webgazer?.videoParamsToReport) {
    const vp = RC.gazeTracker.webgazer.videoParamsToReport
    const maxW = Math.max(vp.maxHeight || 0, vp.maxWidth || 0)
    const maxH = Math.min(vp.maxHeight || 0, vp.maxWidth || 0)
    if (maxW && maxH) webcamMaxXYVpx = `${maxW},${maxH}`
    webcamMaxHz = vp.maxFrameRate || null
  }
  const objectTestCommonData = {
    _calibrateDistance: options.calibrateDistance,
    _calibrateDistanceAllowedRangeCm: options.calibrateDistanceAllowedRangeCm,
    _calibrateDistanceAllowedRatio: options.calibrateDistanceAllowedRatio,
    _calibrateDistanceOffsetCm: calibrateDistanceOffsetCm,
    _calibrateDistancePupil: options.calibrateDistancePupil,
    _calibrateDistanceShowRulerUnitsBool:
      options.calibrateDistanceShowRulerUnitsBool,
    _calibrateDistanceTimes: options.objectMeasurementCount,
    _calibrateScreenSizeAllowedRatio: options.calibrateScreenSizeAllowedRatio,
    _calibrateScreenSizeTimes: options.calibrateScreenSizeTimes,
    _showPerpendicularFeetBool: options.showNearestPointsBool,
    _viewingDistanceWhichEye: options.viewingDistanceWhichEye,
    _viewingDistanceWhichPoint: options.viewingDistanceWhichPoint,
    webcamMaxXYVpx,
    webcamMaxHz,
    historyPreferRightHandBool: [],
    objectRulerIntervalCm: [],
    objectMeasuredMsg: [],
    acceptedFOverWidth: [],
    acceptedRatioFOverWidth: [],
    acceptedLocation: [],
    acceptedPointXYPx: [],
    rejectedFOverWidth: [],
    rejectedRatioFOverWidth: [],
    rejectedLocation: [],
    rejectedPointXYPx: [],
    historyFOverWidth: [],
    historyEyesToFootCm: [],
    acceptedLeftEyeFootXYPx: [],
    acceptedRightEyeFootXYPx: [],
    acceptedIpdOverWidth: [],
    acceptedRulerBasedEyesToFootCm: [],
    acceptedRulerBasedEyesToPointCm: [],
    acceptedImageBasedEyesToFootCm: [],
    acceptedImageBasedEyesToPointCm: [],
    acceptedPreferRightHandBool: [],
    rejectedLeftEyeFootXYPx: [],
    rejectedRightEyeFootXYPx: [],
    rejectedIpdOverWidth: [],
    rejectedRulerBasedEyesToFootCm: [],
    rejectedRulerBasedEyesToPointCm: [],
    rejectedImageBasedEyesToFootCm: [],
    rejectedImageBasedEyesToPointCm: [],
    rejectedPreferRightHandBool: [],
    matchHalfLengthBool: null,
    estimatedLengthCm: [],
    estimatedLengthRatio: [],
  }

  // ===================== CONTAINER =====================
  // Legacy distance.js L4217-4225
  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.top = '0'
  container.style.left = '0'
  container.style.width = '100vw'
  container.style.height = '100vh'
  container.style.userSelect = 'none'
  container.style.overflow = 'hidden'

  // ===================== TITLE ROW =====================
  // Legacy distance.js L4229-4236
  const titleRow = document.createElement('div')
  titleRow.style.display = 'flex'
  titleRow.style.alignItems = 'baseline'
  titleRow.style.gap = `${pxPerMm * 10}px`
  titleRow.style.paddingInlineStart = '3rem'
  titleRow.style.margin = '2rem 0 0rem 0'
  titleRow.style.position = 'relative'
  container.appendChild(titleRow)

  // ===================== TITLE =====================
  // Legacy distance.js L4239-4252
  const title = document.createElement('h1')
  const initialTitleText = (
    phrases.RC_distanceTrackingN?.[RC.L] || 'Distance [[N1]] of [[N2]]'
  )
    .replace('[[N1]]', '1')
    .replace('[[N2]]', viewingDistanceTotalExpected.toString())
  title.innerText = initialTitleText
  title.style.whiteSpace = 'pre-line'
  title.style.textAlign = 'start'
  title.style.margin = '0'
  title.dir = RC.LD.toLowerCase()
  title.id = 'distance-tracking-title'
  titleRow.appendChild(title)

  // ===================== TITLE HELPERS =====================
  // Legacy distance.js L4254-4278
  const updateTitleWithProgress = () => {
    const currentMeasurement = measurementState.currentIteration
    const totalShown = Math.max(
      currentMeasurement,
      measurementState.totalIterations,
    )
    const titleText = phrases.RC_distanceObjectLengthN?.[RC.L]
      ?.replace('[[N1]]', currentMeasurement.toString())
      ?.replace('[[N2]]', totalShown.toString())
    title.innerText = titleText
  }

  const renderViewingDistanceProgressTitle = () => {
    const n1 = Math.max(0, Math.floor(viewingDistanceMeasurementCount || 0))
    const n2 = Math.max(Math.floor(viewingDistanceTotalExpected || 0), n1, 1)
    const template =
      phrases.RC_distanceTrackingN?.[RC.L] || 'Distance [[N1]] of [[N2]]'
    title.innerText = template
      .replace('[[N1]]', n1.toString())
      .replace('[[N2]]', n2.toString())
  }

  const resetTitleToDefault = () => {
    viewingDistanceMeasurementCount = Math.max(
      1,
      viewingDistanceMeasurementCount,
    )
    renderViewingDistanceProgressTitle()
  }

  // ===================== INSTRUCTIONS TEXT STATE =====================
  // Legacy distance.js L4280-4285
  let currentInstructionText = ''
  let setInstructionsText = text => {
    currentInstructionText = text
  }

  // ===================== UNIT RADIO BUTTONS =====================
  // Legacy distance.js L4352-4425
  const unitRadioContainer = document.createElement('div')
  unitRadioContainer.style.display = 'none'
  unitRadioContainer.style.flexDirection = 'row'
  unitRadioContainer.style.gap = '1em'
  unitRadioContainer.style.alignItems = 'center'
  titleRow.appendChild(unitRadioContainer)

  const unitOptions = [
    { value: 'inches', label: phrases.RC_inches[RC.L] },
    { value: 'cm', label: phrases.RC_cm[RC.L] },
  ]

  unitOptions.forEach(option => {
    const optionContainer = document.createElement('div')
    optionContainer.style.display = 'flex'
    optionContainer.style.alignItems = 'center'
    optionContainer.style.gap = '0.4em'
    optionContainer.style.cursor = 'pointer'

    const radio = document.createElement('input')
    radio.type = 'radio'
    radio.name = 'unitSelection'
    radio.value = option.value
    radio.id = `unit-${option.value}`
    radio.style.cursor = 'pointer'
    radio.style.margin = '0'
    radio.style.padding = '0'
    radio.style.width = '16px'
    radio.style.height = '16px'
    radio.checked = option.value === selectedUnit
    radio.tabIndex = -1

    radio.addEventListener('change', () => {
      if (radio.checked) {
        selectedUnit = option.value
        updateDiagonalLabels()
      }
    })

    radio.addEventListener('keydown', e => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault()
      }
    })

    const label = document.createElement('label')
    label.htmlFor = `unit-${option.value}`
    label.textContent = option.label
    label.style.fontSize = 'clamp(0.9em, 2vw, 1.1em)'
    label.style.fontWeight = '500'
    label.style.cursor = 'pointer'
    label.style.userSelect = 'none'
    label.style.margin = '0'
    label.style.lineHeight = '1'
    label.style.display = 'flex'
    label.style.alignItems = 'center'

    optionContainer.appendChild(radio)
    optionContainer.appendChild(label)

    optionContainer.addEventListener('click', e => {
      if (e.target !== radio) {
        radio.checked = true
        radio.dispatchEvent(new Event('change'))
      }
    })

    unitRadioContainer.appendChild(optionContainer)
  })

  // ===================== INSTRUCTIONS CONTAINER =====================
  // Legacy distance.js L4427-4437
  const instructionsContainer = document.createElement('div')
  instructionsContainer.style.display = 'flex'
  instructionsContainer.style.flexDirection = 'row'
  instructionsContainer.style.width = '100%'
  instructionsContainer.style.gap = '0'
  instructionsContainer.style.margin = '2rem 0 5rem 0'
  instructionsContainer.style.position = 'relative'
  instructionsContainer.style.zIndex = '3'
  container.appendChild(instructionsContainer)

  // ===================== STEP INSTRUCTIONS UI =====================
  // Legacy distance.js L4440-4456
  const instructionsUI = createStepInstructionsUI(instructionsContainer, {
    leftWidth: '50%',
    rightWidth: '50%',
    leftPaddingStart: '3rem',
    leftPaddingEnd: '1rem',
    rightPaddingStart: '1rem',
    rightPaddingEnd: '3rem',
    fontSize: 'clamp(1.1em, 2.5vw, 1.4em)',
    lineHeight: '1.4',
    mediaAlignment: 'bottom',
    mediaPositionMode: 'viewport',
    mediaZIndex: '2147483000',
  })
  const leftInstructionsText = instructionsUI.leftText
  const rightInstructionsText = instructionsUI.rightText
  const sectionMediaContainer = instructionsUI.mediaContainer

  // ===================== RENDER CURRENT STEP VIEW =====================
  // Legacy distance.js L4523-4608
  // `currentPage` is not available here — it lives in pageController.
  // We expose a `setCurrentPage` hook so the pageController can keep
  // renderCurrentStepView aware of the active page without a circular dep.
  let _currentPage = 1

  const renderCurrentStepView = () => {
    if (!stepInstructionModel) {
      leftInstructionsText.textContent = currentInstructionText || ''
      rightInstructionsText.textContent = ''
      sectionMediaContainer.innerHTML = ''
      fitToViewport(container)
      return
    }

    const maxIdx = (stepInstructionModel?.flatSteps?.length || 1) - 1

    if (
      (_currentPage === 3 || _currentPage === 4) &&
      currentStepFlatIndex >= maxIdx &&
      currentStepperPhraseKey
    ) {
      RC._readInstructionPhraseKeys.add(currentStepperPhraseKey)
    }

    const handlePrev = () => {
      if (currentStepFlatIndex > 0) {
        currentStepFlatIndex--
        renderCurrentStepView()
      }
    }

    const handleNext = () => {
      if (currentStepFlatIndex < maxIdx) {
        currentStepFlatIndex++
        renderCurrentStepView()
      }
    }

    renderStepInstructions({
      model: stepInstructionModel,
      flatIndex: currentStepFlatIndex,
      elements: {
        leftText: leftInstructionsText,
        rightText: rightInstructionsText,
        mediaContainer: sectionMediaContainer,
      },
      options: {
        calibrateDistanceCheckBool: options.calibrateDistanceCheckBool,
        thresholdFraction: 0.6,
        useCurrentSectionOnly: true,
        resolveMediaUrl: resolveInstructionMediaUrl,
        stepperHistory: options.stepperHistory,
        readFirstPhraseKey:
          _currentPage === 3 || _currentPage === 4
            ? currentStepperPhraseKey
            : null,
        readPhraseKeys: RC._readInstructionPhraseKeys,
        onPrev: handlePrev,
        onNext: handleNext,
      },
      lang: RC.language.value,
      langDirection: RC.LD,
      phrases: phrases,
    })

    // Re-show the media container if renderStepInstructions populated it
    // (it may have been hidden by showPage's transition cleanup)
    if (sectionMediaContainer.children.length > 0) {
      sectionMediaContainer.style.display = 'block'
    }

    if (_currentPage === 2 && stepInstructionModel) {
      if (typeof rulerShiftButton !== 'undefined' && rulerShiftButton) {
        const isFirstMeasurement = measurementState.currentIteration === 1
        const showAtIndex = isFirstMeasurement ? 5 : 4

        if (currentStepFlatIndex === showAtIndex) {
          rulerShiftButton.style.display = 'flex'
        } else {
          rulerShiftButton.style.display = 'none'
        }
      }
    }

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
    fitToViewport(container)
  }

  // Reassign setInstructionsText after UI elements exist
  // Legacy distance.js L4611-4617
  setInstructionsText = text => {
    currentInstructionText = text
    leftInstructionsText.innerHTML = processInlineFormatting(
      currentInstructionText || '',
    )
    rightInstructionsText.textContent = ''
    sectionMediaContainer.innerHTML = ''
    fitToViewport(container)
  }
  setInstructionsText(currentInstructionText)

  // Reflow on viewport changes
  const reflowInstructionsOnResize = () => renderCurrentStepView()
  window.addEventListener('resize', reflowInstructionsOnResize)

  // Up/Down navigation for step-by-step instructions
  // Legacy distance.js L4624-4645
  const handleInstructionNav = e => {
    if (![2, 3, 4].includes(_currentPage) || !stepInstructionModel) return
    if (e.key === 'ArrowDown') {
      const maxIdx = (stepInstructionModel.flatSteps?.length || 1) - 1
      if (currentStepFlatIndex < maxIdx) {
        currentStepFlatIndex++
      }
      renderCurrentStepView()
      e.preventDefault()
      e.stopPropagation()
    } else if (e.key === 'ArrowUp') {
      if (currentStepFlatIndex > 0) {
        currentStepFlatIndex--
      }
      renderCurrentStepView()
      e.preventDefault()
      e.stopPropagation()
    }
  }
  document.addEventListener('keydown', handleInstructionNav)

  // ===================== RADIO OVERLAY =====================
  // Legacy distance.js L4648-4657
  const radioOverlay = document.createElement('div')
  radioOverlay.style.position = 'fixed'
  radioOverlay.style.top = '0'
  radioOverlay.style.left = '0'
  radioOverlay.style.width = '100%'
  radioOverlay.style.height = '100%'
  radioOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.4)'
  radioOverlay.style.zIndex = '9998'
  radioOverlay.style.display = 'none'
  container.appendChild(radioOverlay)

  // ===================== UPDATE INSTRUCTIONS =====================
  // Legacy distance.js L4288-4350
  const updateInstructions = () => {
    const minCm = options.calibrateDistanceObjectMinMaxCm[0]
    const maxCm = options.calibrateDistanceObjectMinMaxCm[1]
    const minInch = minCm / 2.54
    const maxInch = maxCm / 2.54

    const phraseKeyMapping = {
      RC_UseObjectToSetViewingDistanceTapePage1_MD:
        'RC_UseObjectToSetViewingDistanceTapeStepperPage1',
      RC_UseObjectToSetViewingDistanceRulerPage1_MD:
        'RC_UseObjectToSetViewingDistanceRulerStepperPage1',
      RC_UseObjectToSetViewingDistanceTapePage2_MD:
        'RC_UseObjectToSetViewingDistanceTapeStepperPage2',
      RC_UseObjectToSetViewingDistanceRulerPage2_MD:
        'RC_UseObjectToSetViewingDistanceRulerStepperPage2',
    }

    const phraseKey =
      measurementState.currentIteration === 1
        ? showLength
          ? 'RC_UseObjectToSetViewingDistanceTapePage1_MD'
          : 'RC_UseObjectToSetViewingDistanceRulerPage1_MD'
        : showLength
          ? 'RC_UseObjectToSetViewingDistanceTapePage2_MD'
          : 'RC_UseObjectToSetViewingDistanceRulerPage2_MD'

    const actualPhraseKey = phraseKeyMapping[phraseKey]
    currentStepperPhraseKey = actualPhraseKey
    const chosenText = (phrases[actualPhraseKey]?.[RC.L] || '')
      .replace('[[IN1]]', minInch.toFixed(0))
      .replace('[[IN2]]', maxInch.toFixed(0))
      .replace('[[CM1]]', minCm.toFixed(0))
      .replace('[[CM2]]', maxCm.toFixed(0))

    try {
      stepInstructionModel = parseInstructions(chosenText, {
        assetMap: test_assetMap,
      })
      currentStepFlatIndex = 0
      currentInstructionText = chosenText

      if (typeof rulerShiftButton !== 'undefined' && rulerShiftButton) {
        rulerShiftButton.style.display = 'none'
      }

      renderCurrentStepView()
    } catch (e) {
      console.warn('Failed to parse step instructions; using plain text', e)
      currentInstructionText = chosenText
      leftInstructionsText.textContent = currentInstructionText || ''
      rightInstructionsText.textContent = ''
      sectionMediaContainer.innerHTML = ''
    }
    console.log(
      `Updated instructions (${phraseKey}) for iteration ${measurementState.currentIteration}`,
    )
  }

  // ===================== DONT-USE-RULER COLUMN =====================
  // Legacy distance.js L4488-4514
  const dontUseRulerColumn = document.createElement('div')
  dontUseRulerColumn.id = 'dont-use-ruler-column'
  dontUseRulerColumn.style.position = 'fixed'
  dontUseRulerColumn.style.top = '12px'
  dontUseRulerColumn.style.zIndex = '999999999'
  dontUseRulerColumn.style.whiteSpace = 'pre-line'
  dontUseRulerColumn.style.fontSize = '16pt'
  dontUseRulerColumn.style.lineHeight = '1.4'
  dontUseRulerColumn.style.display = 'none'
  dontUseRulerColumn.style.width = '50vw'
  dontUseRulerColumn.style.maxWidth = '50vw'

  if (RC.LD === RC._CONST.RTL) {
    dontUseRulerColumn.style.left = '12px'
    dontUseRulerColumn.style.right = 'auto'
    dontUseRulerColumn.style.textAlign = 'left'
  } else {
    dontUseRulerColumn.style.right = '12px'
    dontUseRulerColumn.style.left = 'auto'
    dontUseRulerColumn.style.textAlign = 'right'
  }
  document.body.appendChild(dontUseRulerColumn)

  // ===================== PAPER SELECTION CONTAINER =====================
  // Legacy distance.js L4659-5042
  const paperSelectionContainer = document.createElement('div')
  paperSelectionContainer.id = 'paper-selection-container'
  paperSelectionContainer.style.position = 'relative'
  paperSelectionContainer.style.display = 'none'
  paperSelectionContainer.style.flexDirection = 'column'
  paperSelectionContainer.style.alignItems = 'flex-start'
  paperSelectionContainer.style.justifyContent = 'flex-start'
  paperSelectionContainer.style.backgroundColor = 'transparent'
  paperSelectionContainer.style.zIndex = '10000000000'
  paperSelectionContainer.style.color = '#111'
  paperSelectionContainer.style.padding = '0'
  paperSelectionContainer.style.paddingLeft = 'clamp(1rem, 5vw, 3rem)'
  paperSelectionContainer.style.paddingRight = '1rem'
  paperSelectionContainer.style.paddingTop = '0.1rem'
  paperSelectionContainer.style.paddingBottom = '1rem'
  paperSelectionContainer.style.boxSizing = 'border-box'
  paperSelectionContainer.style.width = '50vw'
  paperSelectionContainer.style.maxWidth = '50vw'
  paperSelectionContainer.style.maxHeight = 'calc(100vh - 5rem)'
  paperSelectionContainer.style.overflowY = 'auto'
  paperSelectionContainer.style.overflowX = 'hidden'
  paperSelectionContainer.style.pointerEvents = 'auto'
  paperSelectionContainer.style.userSelect = 'auto'

  const paperSelectionCard = document.createElement('div')
  paperSelectionCard.style.maxWidth = '100%'
  paperSelectionCard.style.width = '100%'
  paperSelectionCard.style.background = 'transparent'
  paperSelectionCard.style.border = 'none'
  paperSelectionCard.style.borderRadius = '0'
  paperSelectionCard.style.padding = '0'
  paperSelectionCard.style.boxSizing = 'border-box'
  paperSelectionCard.style.boxShadow = 'none'
  paperSelectionCard.style.display = 'flex'
  paperSelectionCard.style.flexDirection = 'column'
  paperSelectionCard.style.minHeight = '0'
  paperSelectionCard.style.flexGrow = '1'

  const paperInstructionsPhraseKey = usePaperOnlyChoices
    ? 'RC_PaperChoicesInstructions'
    : 'RC_PaperAndRulerChoicesInstructions'

  const paperSelectionTitle = document.createElement('div')
  paperSelectionTitle.innerHTML = processInlineFormatting(
    phrases[paperInstructionsPhraseKey]?.[RC.L] || '',
  )
  paperSelectionTitle.style.fontSize = 'clamp(1rem, 3vmin, 1.4rem)'
  paperSelectionTitle.style.fontWeight = '600'
  paperSelectionTitle.style.color = '#111'
  paperSelectionTitle.style.textAlign = 'left'
  paperSelectionTitle.style.margin =
    'clamp(0.5rem, 3vmin, 2rem) 0px clamp(0.5rem, 2vmin, 1rem) 0px'

  const paperOptionsList = document.createElement('div')
  paperOptionsList.style.display = 'flex'
  paperOptionsList.style.flexDirection = 'column'
  paperOptionsList.style.gap = 'clamp(0.3rem, 1.5vmin, 0.7rem)'
  paperOptionsList.style.alignItems = 'flex-start'

  // Paper stepper container
  const paperStepperContainer = document.createElement('div')
  paperStepperContainer.style.marginTop = 'clamp(0.75rem, 4vmin, 3rem)'
  paperStepperContainer.style.fontSize = 'clamp(0.85rem, 2.5vmin, 1.3rem)'
  paperStepperContainer.style.lineHeight = '1.4'
  paperStepperContainer.style.color = '#555'
  paperStepperContainer.style.width = '100%'
  paperStepperContainer.style.maxWidth = '100%'
  paperStepperContainer.style.pointerEvents = 'auto'

  const paperStepperLeftText = document.createElement('div')
  paperStepperLeftText.style.pointerEvents = 'auto'
  paperStepperLeftText.style.textAlign =
    RC.LD === RC._CONST.RTL ? 'right' : 'left'
  const paperStepperRightText = document.createElement('div')
  paperStepperRightText.style.pointerEvents = 'auto'

  // Paper stepper media container (outside paperSelectionContainer so it can be on the right half)
  const paperStepperMediaContainer = document.createElement('div')
  paperStepperMediaContainer.id = 'paper-stepper-media-container'
  paperStepperMediaContainer.style.position = 'fixed'
  paperStepperMediaContainer.style.top = '50%'
  paperStepperMediaContainer.style.transform = 'translateY(-50%)'
  if (RC.LD === RC._CONST.RTL) {
    paperStepperMediaContainer.style.left = '0'
    paperStepperMediaContainer.style.right = 'auto'
  } else {
    paperStepperMediaContainer.style.right = '0'
    paperStepperMediaContainer.style.left = 'auto'
  }
  paperStepperMediaContainer.style.width = '50vw'
  paperStepperMediaContainer.style.height = 'auto'
  paperStepperMediaContainer.style.maxHeight = '80vh'
  paperStepperMediaContainer.style.display = 'none'
  paperStepperMediaContainer.style.zIndex = '2147483600'
  paperStepperMediaContainer.style.padding = '1rem'
  paperStepperMediaContainer.style.boxSizing = 'border-box'
  paperStepperMediaContainer.style.pointerEvents = 'none'
  container.appendChild(paperStepperMediaContainer)

  paperStepperContainer.appendChild(paperStepperLeftText)
  paperStepperContainer.appendChild(paperStepperRightText)

  // ===================== PAPER STEPPER RENDER =====================
  // Legacy distance.js L4774-4852
  const renderPaperStepperView = () => {
    if (!paperStepInstructionModel) {
      paperStepperLeftText.innerHTML = ''
      paperStepperRightText.innerHTML = ''
      paperStepperMediaContainer.innerHTML = ''
      return
    }

    const maxIdx = (paperStepInstructionModel?.flatSteps?.length || 1) - 1

    const handlePaperPrev = () => {
      if (paperCurrentStepFlatIndex > 0) {
        paperCurrentStepFlatIndex--
      }
      renderPaperStepperView()
    }

    const handlePaperNext = () => {
      if (paperCurrentStepFlatIndex < maxIdx) {
        paperCurrentStepFlatIndex++
      }
      renderPaperStepperView()
    }

    renderStepInstructions({
      model: paperStepInstructionModel,
      flatIndex: paperCurrentStepFlatIndex,
      elements: {
        leftText: paperStepperLeftText,
        rightText: paperStepperRightText,
        mediaContainer: paperStepperMediaContainer,
      },
      options: {
        calibrateDistanceCheckBool: options.calibrateDistanceCheckBool,
        thresholdFraction: 0.6,
        useCurrentSectionOnly: true,
        resolveMediaUrl: resolveInstructionMediaUrl,
        stepperHistory: options.stepperHistory,
        onPrev: handlePaperPrev,
        onNext: handlePaperNext,
        layout: 'twoColumn',
      },
      lang: RC.language.value,
      langDirection: RC.LD,
      phrases: phrases,
    })
  }

  // ===================== INIT PAPER STEPPER =====================
  // Legacy distance.js L4825-4852
  const initPaperStepper = () => {
    try {
      const useLongEdgeRaw = phrases.RC_UseLongEdge?.[RC.L] || ''
      const normalizedText = useLongEdgeRaw
        .replaceAll('/n', '\n')
        .replaceAll('\\n', '\n')

      paperStepInstructionModel = parseInstructions(normalizedText, {
        format: 'markdown',
        assetMap: test_assetMap,
      })
      paperCurrentStepFlatIndex = 0
      renderPaperStepperView()
    } catch (e) {
      console.warn(
        'Failed to parse RC_UseLongEdge as step instructions; using plain text',
        e,
      )
      paperStepInstructionModel = null
      const useLongEdgeRaw = phrases.RC_UseLongEdge?.[RC.L] || ''
      paperStepperLeftText.innerHTML = processInlineFormatting(
        useLongEdgeRaw.replaceAll('/n', '<br>').replaceAll('\\n', '<br>'),
      )
      paperStepperLeftText.style.whiteSpace = 'pre-line'
    }
  }

  initPaperStepper()

  // Up/Down navigation for paper selection stepper
  // Legacy distance.js L4858-4895
  const handlePaperStepperNav = e => {
    if (
      _currentPage !== 2 ||
      !isPaperSelectionMode ||
      !paperStepInstructionModel
    )
      return
    if (document.activeElement && document.activeElement.tagName === 'TEXTAREA')
      return
    if (
      document.activeElement &&
      document.activeElement.tagName === 'INPUT' &&
      !['radio', 'checkbox'].includes(document.activeElement.type)
    )
      return

    if (e.key === 'ArrowDown') {
      const maxIdx = (paperStepInstructionModel.flatSteps?.length || 1) - 1
      if (paperCurrentStepFlatIndex < maxIdx) {
        paperCurrentStepFlatIndex++
      }
      renderPaperStepperView()
      e.preventDefault()
      e.stopPropagation()
    } else if (e.key === 'ArrowUp') {
      if (paperCurrentStepFlatIndex > 0) {
        paperCurrentStepFlatIndex--
      }
      renderPaperStepperView()
      e.preventDefault()
      e.stopPropagation()
    }
  }
  document.addEventListener('keydown', handlePaperStepperNav)

  // ===================== PAPER SUGGESTION INPUT =====================
  // Legacy distance.js L4897-4935
  const paperSuggestionWrapper = document.createElement('div')
  paperSuggestionWrapper.style.display = 'flex'
  paperSuggestionWrapper.style.flexDirection = 'column'
  paperSuggestionWrapper.style.gap = 'clamp(0.2rem, 1vmin, 0.35rem)'
  paperSuggestionWrapper.style.marginTop = 'clamp(0.5rem, 2vmin, 1rem)'

  const paperSuggestionLabel = document.createElement('div')
  paperSuggestionLabel.innerHTML = processInlineFormatting(
    phrases.RC_SuggestObject?.[RC.L] || '',
  )
  paperSuggestionLabel.style.fontSize = 'clamp(0.85rem, 2.5vmin, 1.3rem)'
  paperSuggestionLabel.style.lineHeight = '1.3'
  paperSuggestionLabel.style.color = '#555'

  const paperSuggestionInput = document.createElement('input')
  paperSuggestionInput.type = 'text'
  paperSuggestionInput.placeholder = phrases.RC_SuggestObjectHere[RC.L]
  paperSuggestionInput.style.fontSize = '1rem'
  paperSuggestionInput.style.padding = '10px 12px'
  paperSuggestionInput.style.border = '1px solid rgba(85, 85, 85, 0.9)'
  paperSuggestionInput.style.borderRadius = '10px'
  paperSuggestionInput.style.width = '320px'
  paperSuggestionInput.style.maxWidth = '90vw'
  paperSuggestionInput.style.outline = 'none'
  paperSuggestionInput.style.background = 'transparent'
  paperSuggestionInput.style.pointerEvents = 'auto'
  paperSuggestionInput.style.userSelect = 'text'
  paperSuggestionInput.oninput = e => {
    paperSuggestionValue = e.target.value || ''
  }
  paperSuggestionInput.addEventListener('keydown', e => {
    e.stopPropagation()
  })
  paperSuggestionInput.addEventListener('click', e => e.stopPropagation())

  paperSuggestionWrapper.appendChild(paperSuggestionLabel)
  paperSuggestionWrapper.appendChild(paperSuggestionInput)

  // ===================== DONT-USE-YOUR-RULER NOTE =====================
  // Legacy distance.js L4940-4972
  const dontUseYourRulerNote = document.createElement('div')
  dontUseYourRulerNote.id = 'paper-dont-use-ruler-note'
  const dontUseYourRulerRaw = phrases.RC_DontUseYourRulerYet?.[RC.L] || ''
  dontUseYourRulerNote.innerHTML = processInlineFormatting(
    dontUseYourRulerRaw.replaceAll('/n', '<br>').replaceAll('\\n', '<br>'),
  )
  dontUseYourRulerNote.style.position = 'fixed'
  dontUseYourRulerNote.style.top = '12px'
  dontUseYourRulerNote.style.zIndex = '999999999'
  dontUseYourRulerNote.style.fontSize = 'clamp(0.85rem, 2.5vmin, 1.3rem)'
  dontUseYourRulerNote.style.lineHeight = '1.4'
  dontUseYourRulerNote.style.color = '#555'
  dontUseYourRulerNote.style.whiteSpace = 'pre-line'
  dontUseYourRulerNote.style.maxWidth = '45vw'
  dontUseYourRulerNote.style.pointerEvents = 'none'
  dontUseYourRulerNote.style.userSelect = 'none'
  if (RC.LD === RC._CONST.RTL) {
    dontUseYourRulerNote.style.left = '12px'
    dontUseYourRulerNote.style.right = 'auto'
    dontUseYourRulerNote.style.textAlign = 'left'
  } else {
    dontUseYourRulerNote.style.right = '12px'
    dontUseYourRulerNote.style.left = 'auto'
    dontUseYourRulerNote.style.textAlign = 'right'
  }
  dontUseYourRulerNote.style.display =
    options.calibrateDistanceCheckBool === true &&
    dontUseYourRulerRaw.trim().length
      ? 'block'
      : 'none'
  document.body.appendChild(dontUseYourRulerNote)

  // ===================== PAPER IMPORTANT WARNING & VALIDATION =====================
  // Legacy distance.js L4974-4986
  const paperImportantWarning = document.createElement('div')
  paperImportantWarning.textContent = ''
  paperImportantWarning.style.marginTop = 'clamp(0.5rem, 2vmin, 1rem)'
  paperImportantWarning.style.fontSize = 'clamp(0.9rem, 2.5vmin, 1.3rem)'
  paperImportantWarning.style.lineHeight = '1.4'
  paperImportantWarning.style.color = '#111'

  const paperValidationMessage = document.createElement('div')
  paperValidationMessage.style.color = '#ff9f43'
  paperValidationMessage.style.marginTop = 'clamp(0.5rem, 2vmin, 1rem)'
  paperValidationMessage.style.display = 'none'
  paperValidationMessage.style.fontSize = 'clamp(0.8rem, 2vmin, 0.95rem)'

  // ===================== PAPER OPTION ROWS =====================
  // Legacy distance.js L4988-5042
  const createPaperOptionRow = option => {
    const row = document.createElement('label')
    row.style.display = 'flex'
    row.style.alignItems = 'center'
    row.style.gap = '1px'
    row.style.cursor = 'pointer'
    row.style.fontSize = 'clamp(1rem, 2.5vmin, 1.3rem)'
    row.style.lineHeight = '1.2'
    row.style.color = '#111'
    row.style.textAlign = 'left'
    row.style.padding = '0'

    const radio = document.createElement('input')
    radio.type = 'radio'
    radio.name = 'paper-selection'
    radio.value = option.key
    radio.style.cursor = 'pointer'
    radio.style.marginRight = '0.5rem'
    radio.style.padding = '0'
    radio.style.width = 'clamp(14px, 3vmin, 16px)'
    radio.style.height = 'clamp(14px, 3vmin, 16px)'
    radio.style.flexShrink = '0'
    radio.onchange = () => {
      selectedPaperOption = option.key
      selectedPaperLengthCm = option.lengthCm
      selectedPaperLabel = option.label
      paperValidationMessage.style.display = 'none'
      if (isPaperSelectionMode && typeof proceedButton !== 'undefined') {
        proceedButton.disabled = !selectedPaperLengthCm
      }
    }

    const labelSpan = document.createElement('span')
    labelSpan.textContent = option.label
    labelSpan.style.fontSize = 'clamp(1rem, 2.5vmin, 1.3rem)'

    row.appendChild(radio)
    row.appendChild(labelSpan)

    return row
  }

  paperSelectionOptions.forEach(opt => {
    const row = createPaperOptionRow(opt)
    paperOptionsList.appendChild(row)
  })

  paperSelectionCard.appendChild(paperSelectionTitle)
  paperSelectionCard.appendChild(paperOptionsList)
  paperSelectionCard.appendChild(paperStepperContainer)
  paperSelectionCard.appendChild(paperSuggestionWrapper)
  paperSelectionCard.appendChild(paperImportantWarning)
  paperSelectionCard.appendChild(paperValidationMessage)
  paperSelectionContainer.appendChild(paperSelectionCard)
  container.appendChild(paperSelectionContainer)

  // ===================== DIAGONAL TAPE COMPONENT =====================
  // Legacy distance.js L5044-5285
  const createDiagonalTapeComponent = () => {
    const tapeWidth = Math.round(0.75 * ppi)
    const lineThickness = 3
    const handleHotspotWidth = Math.round(ppi / 4)

    const getDistance = (x1, y1, x2, y2) =>
      Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)

    const getAngle = (x1, y1, x2, y2) =>
      Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI)

    const tapeContainer = document.createElement('div')
    tapeContainer.id = 'diagonal-tape-measurement-component'
    tapeContainer.className += ' rc-lang-ltr'
    tapeContainer.style.position = 'absolute'
    tapeContainer.style.left = '0px'
    tapeContainer.style.top = '0px'
    tapeContainer.style.width = '100vw'
    tapeContainer.style.height = '100vh'
    tapeContainer.style.pointerEvents = 'none'
    tapeContainer.style.zIndex = '10'

    const diagonalTape = document.createElement('div')
    diagonalTape.style.position = 'absolute'
    diagonalTape.style.background = 'rgba(255, 221, 51, 0.95)'
    diagonalTape.style.border = '2px solid rgb(0, 0, 0)'
    diagonalTape.style.borderRadius = '2px'
    diagonalTape.style.zIndex = '1'
    diagonalTape.style.transformOrigin = 'left center'
    tapeContainer.appendChild(diagonalTape)

    if (!showLength) {
      let sourceSvg = woodSvg
      try {
        const pngMatch =
          woodSvg.match(/xlink:href="([^"]+)"/) ||
          woodSvg.match(/href="([^"]+)"/)
        const widthMatch = woodSvg.match(/width="([\\d.]+)px"/)
        const heightMatch = woodSvg.match(/height="([\\d.]+)px"/)
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

    const leftHandle = document.createElement('div')
    leftHandle.style.position = 'absolute'
    leftHandle.style.width = `${handleHotspotWidth}px`
    leftHandle.style.height = `${tapeWidth}px`
    leftHandle.style.background = 'transparent'
    leftHandle.style.borderRadius = '1px'
    leftHandle.style.boxShadow = 'none'
    leftHandle.style.cursor = 'move'
    leftHandle.style.pointerEvents = 'auto'
    leftHandle.style.zIndex = '3'
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
    leftVisualLine.style.zIndex = '4'
    leftHandle.appendChild(leftVisualLine)

    const rightHandle = document.createElement('div')
    rightHandle.style.position = 'absolute'
    rightHandle.style.width = `${handleHotspotWidth}px`
    rightHandle.style.height = `${tapeWidth}px`
    rightHandle.style.background = 'transparent'
    rightHandle.style.borderRadius = '1px'
    rightHandle.style.boxShadow = 'none'
    rightHandle.style.cursor = 'move'
    rightHandle.style.pointerEvents = 'auto'
    rightHandle.style.zIndex = '3'
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
    rightVisualLine.style.zIndex = '4'
    rightHandle.appendChild(rightVisualLine)

    const dynamicLengthLabel = document.createElement('div')
    dynamicLengthLabel.style.position = 'absolute'
    dynamicLengthLabel.style.color = 'rgb(0, 0, 0)'
    dynamicLengthLabel.style.fontWeight = 'bold'
    dynamicLengthLabel.style.fontSize = '1.4rem'
    dynamicLengthLabel.style.background = '#eee'
    dynamicLengthLabel.style.padding = '2px 6px'
    dynamicLengthLabel.style.whiteSpace = 'nowrap'
    dynamicLengthLabel.style.zIndex = '20'
    dynamicLengthLabel.style.transform = 'translate(-50%, -50%)'
    tapeContainer.appendChild(dynamicLengthLabel)
    if (!showLength) {
      dynamicLengthLabel.style.display = 'none'
    }

    const rulerMarkingsContainer = document.createElement('div')
    rulerMarkingsContainer.style.position = 'absolute'
    rulerMarkingsContainer.style.zIndex = '17'
    rulerMarkingsContainer.style.pointerEvents = 'none'
    tapeContainer.appendChild(rulerMarkingsContainer)

    const arrowContainer = document.createElement('div')
    arrowContainer.style.position = 'absolute'
    arrowContainer.style.zIndex = '18'
    arrowContainer.style.pointerEvents = 'none'
    tapeContainer.appendChild(arrowContainer)
    if (!showLength) {
      arrowContainer.style.display = 'none'
    }

    const arrowLine = document.createElement('div')
    arrowLine.style.position = 'absolute'
    arrowLine.style.background = 'rgb(0, 0, 0)'
    arrowLine.style.transformOrigin = 'left center'
    arrowLine.style.height = '2px'
    arrowContainer.appendChild(arrowLine)

    const createArrowheadLine = () => {
      const line = document.createElement('div')
      line.style.position = 'absolute'
      line.style.background = 'rgb(0, 0, 0)'
      line.style.width = '24px'
      line.style.height = '2px'
      line.style.transformOrigin = 'left center'
      arrowContainer.appendChild(line)
      return line
    }

    const leftArrowLine1 = createArrowheadLine()
    const leftArrowLine2 = createArrowheadLine()
    const rightArrowLine1 = createArrowheadLine()
    const rightArrowLine2 = createArrowheadLine()

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
      dimensions: {
        tapeWidth,
        lineThickness,
      },
      helpers: {
        getDistance,
        getAngle,
      },
    }
  }

  const tape = createDiagonalTapeComponent()
  container.appendChild(tape.container)

  // ===================== TUBE CHECK TAPE COMPONENT =====================
  // Legacy distance.js L5291-5382
  const createTubeCheckTapeComponent = () => {
    const tcTapeWidth = Math.round(
      (options.calibrateDistanceTubeDiameterCm ?? 3.5) * pxPerCm,
    )
    const tcLineThickness = 3

    const tcContainer = document.createElement('div')
    tcContainer.id = 'tube-check-tape-container'
    tcContainer.style.position = 'fixed'
    tcContainer.style.top = '0'
    tcContainer.style.left = '0'
    tcContainer.style.width = '100vw'
    tcContainer.style.height = '100vh'
    tcContainer.style.pointerEvents = 'none'
    tcContainer.style.zIndex = '10'
    tcContainer.style.display = 'none'

    const tcTapeBody = document.createElement('div')
    tcTapeBody.style.position = 'absolute'
    tcTapeBody.style.background = [
      'linear-gradient(to bottom,',
      'rgba(190, 185, 180, 0.92) 0%,',
      'rgba(215, 212, 208, 0.95) 3%,',
      'rgba(235, 233, 230, 0.97) 7%,',
      'rgba(246, 245, 243, 0.99) 13%,',
      'rgba(253, 252, 251, 1) 22%,',
      'rgba(255, 255, 255, 1) 38%,',
      'rgba(254, 254, 253, 1) 50%,',
      'rgba(255, 255, 255, 1) 62%,',
      'rgba(253, 252, 251, 1) 78%,',
      'rgba(246, 245, 243, 0.99) 87%,',
      'rgba(235, 233, 230, 0.97) 93%,',
      'rgba(215, 212, 208, 0.95) 97%,',
      'rgba(190, 185, 180, 0.92) 100%)',
    ].join(' ')
    tcTapeBody.style.border = '1px solid rgba(175, 170, 165, 0.45)'
    tcTapeBody.style.borderRadius = '5px'
    tcTapeBody.style.boxShadow = [
      '0 4px 12px rgba(0, 0, 0, 0.16)',
      '0 1px 4px rgba(0, 0, 0, 0.10)',
      'inset 0 1px 1px rgba(255, 255, 255, 0.6)',
      'inset 0 -1px 1px rgba(0, 0, 0, 0.04)',
    ].join(', ')
    tcTapeBody.style.transformOrigin = 'left center'
    tcTapeBody.style.height = `${tcTapeWidth}px`
    tcTapeBody.style.pointerEvents = 'auto'
    tcTapeBody.style.cursor = 'pointer'
    tcContainer.appendChild(tcTapeBody)

    const createEndpointLine = () => {
      const line = document.createElement('div')
      line.style.position = 'absolute'
      line.style.width = `${tcLineThickness}px`
      line.style.height = `${tcTapeWidth}px`
      line.style.background =
        'linear-gradient(to bottom, rgba(140,135,130,0.7), rgba(90,85,80,0.85) 30%, rgba(70,65,60,0.9) 50%, rgba(90,85,80,0.85) 70%, rgba(140,135,130,0.7))'
      line.style.borderRadius = '1px'
      line.style.transformOrigin = 'center center'
      line.style.pointerEvents = 'auto'
      line.style.cursor = 'pointer'
      line.style.zIndex = '3'
      tcContainer.appendChild(line)
      return line
    }

    const tcLeftLine = createEndpointLine()
    const tcRightLine = createEndpointLine()

    return {
      container: tcContainer,
      elements: {
        tapeBody: tcTapeBody,
        leftLine: tcLeftLine,
        rightLine: tcRightLine,
      },
      dimensions: { tapeWidth: tcTapeWidth, lineThickness: tcLineThickness },
    }
  }

  const tubeCheckTape = createTubeCheckTapeComponent()
  container.appendChild(tubeCheckTape.container)

  // ===================== UPDATE TUBE CHECK TAPE POSITION =====================
  // Legacy distance.js L5388-5433
  const updateTubeCheckTapePosition = () => {
    const sw = window.innerWidth
    const sh = window.innerHeight
    const diagPx = Math.sqrt(sw * sw + sh * sh)
    const ux = sw / diagPx
    const uy = -sh / diagPx

    const leftX = tubeCheckLeftDistPx * ux
    const leftY = sh + tubeCheckLeftDistPx * uy
    const rightX = leftX + tubeCheckTapeLengthPx * ux
    const rightY = leftY + tubeCheckTapeLengthPx * uy

    const angleDeg =
      Math.atan2(rightY - leftY, rightX - leftX) * (180 / Math.PI)

    const tw = tubeCheckTape.dimensions.tapeWidth

    tubeCheckTape.elements.tapeBody.style.left = `${leftX}px`
    tubeCheckTape.elements.tapeBody.style.top = `${leftY - tw / 2}px`
    tubeCheckTape.elements.tapeBody.style.width = `${tubeCheckTapeLengthPx}px`
    tubeCheckTape.elements.tapeBody.style.transform = `rotate(${angleDeg}deg)`

    const lineHeight = tw

    tubeCheckTape.elements.leftLine.style.left = `${leftX}px`
    tubeCheckTape.elements.leftLine.style.top = `${leftY}px`
    tubeCheckTape.elements.leftLine.style.transform = `translate(-50%, -50%) rotate(${angleDeg}deg)`
    tubeCheckTape.elements.leftLine.style.height = `${lineHeight}px`

    tubeCheckTape.elements.rightLine.style.left = `${rightX}px`
    tubeCheckTape.elements.rightLine.style.top = `${rightY}px`
    tubeCheckTape.elements.rightLine.style.transform = `translate(-50%, -50%) rotate(${angleDeg}deg)`
    tubeCheckTape.elements.rightLine.style.height = `${lineHeight}px`
  }

  // ===================== TUBE CHECK & RESIZE CONSTANTS =====================
  const TUBE_CHECK_PAGE = 'tubeCheck'

  // ===================== TUBE CHECK DRAG HANDLERS =====================
  // Legacy distance.js L5441-5523
  let tcDragging = false
  let tcDragTarget = null

  const handleTubeCheckDragStart = e => {
    if (_currentPage !== TUBE_CHECK_PAGE) return
    if (!isFullscreen()) {
      e.preventDefault()
      forceFullscreen(RC.L, RC)
      return
    }
    const sw = window.innerWidth
    const sh = window.innerHeight
    const diagPx = Math.sqrt(sw * sw + sh * sh)
    const ux = sw / diagPx
    const uy = -sh / diagPx
    const clickDist = e.clientX * ux + (e.clientY - sh) * uy
    const midDist = tubeCheckLeftDistPx + tubeCheckTapeLengthPx / 2
    tcDragTarget = clickDist < midDist ? 'left' : 'right'
    tcDragging = true
    document.body.style.cursor = 'pointer'
    e.preventDefault()
  }

  tubeCheckTape.elements.leftLine.addEventListener(
    'mousedown',
    handleTubeCheckDragStart,
  )
  tubeCheckTape.elements.rightLine.addEventListener(
    'mousedown',
    handleTubeCheckDragStart,
  )
  tubeCheckTape.elements.tapeBody.addEventListener(
    'mousedown',
    handleTubeCheckDragStart,
  )

  window.addEventListener('mousemove', e => {
    if (!tcDragging || _currentPage !== TUBE_CHECK_PAGE) return
    if (!isFullscreen()) {
      tcDragging = false
      document.body.style.cursor = ''
      forceFullscreen(RC.L, RC)
      return
    }
    const sw = window.innerWidth
    const sh = window.innerHeight
    const diagPx = Math.sqrt(sw * sw + sh * sh)
    const ux = sw / diagPx
    const uy = -sh / diagPx
    const mouseDist = e.clientX * ux + (e.clientY - sh) * uy
    const minLengthPx = 2 * pxPerCm

    if (tcDragTarget === 'left') {
      const tw = tubeCheckTape.dimensions.tapeWidth
      const minLeftDist = (tw / 2) * Math.max(sw / sh, sh / sw)
      const rightDist = tubeCheckLeftDistPx + tubeCheckTapeLengthPx
      const newLeftDist = Math.max(
        minLeftDist,
        Math.min(rightDist - minLengthPx, mouseDist),
      )
      tubeCheckTapeLengthPx = rightDist - newLeftDist
      tubeCheckLeftDistPx = newLeftDist
    } else {
      const newRightDist = Math.max(
        tubeCheckLeftDistPx + minLengthPx,
        Math.min(diagPx, mouseDist),
      )
      tubeCheckTapeLengthPx = newRightDist - tubeCheckLeftDistPx
    }

    tubeCheckTapeAdjusted = true
    updateTubeCheckTapePosition()
  })

  window.addEventListener('mouseup', () => {
    if (tcDragging) {
      tcDragging = false
      document.body.style.cursor = ''
    }
  })

  // ===================== WINDOW RESIZE HANDLERS =====================
  // Legacy distance.js L5526-5557

  function updateDiagonalTapeOnResize() {
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

  window.addEventListener('resize', updateDiagonalTapeOnResize)

  window.addEventListener('resize', () => {
    if (_currentPage === TUBE_CHECK_PAGE) {
      updateTubeCheckTapePosition()
    }
  })

  // ===================== RULER-SHIFT BUTTON =====================
  // Legacy distance.js L5559-5813
  const rulerShiftButton = document.createElement('button')
  rulerShiftButton.id = 'ruler-shift-button'
  rulerShiftButton.innerHTML = '⬅'
  rulerShiftButton.style.position = 'fixed'
  rulerShiftButton.style.fontSize = '60pt'
  rulerShiftButton.style.width = '100px'
  rulerShiftButton.style.height = '100px'
  rulerShiftButton.style.backgroundColor = '#FFD700'
  rulerShiftButton.style.border = 'none'
  rulerShiftButton.style.borderRadius = '50%'
  rulerShiftButton.style.cursor = 'pointer'
  rulerShiftButton.style.zIndex = '100'
  rulerShiftButton.style.display = 'flex'
  rulerShiftButton.style.alignItems = 'center'
  rulerShiftButton.style.justifyContent = 'center'
  rulerShiftButton.style.boxShadow =
    '0 6px 16px rgba(255, 140, 0, 0.6), 0 0 20px rgba(255, 215, 0, 0.4)'
  rulerShiftButton.style.transition =
    'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
  rulerShiftButton.style.fontWeight = 'bold'
  rulerShiftButton.style.lineHeight = '1'
  rulerShiftButton.style.padding = '0'
  rulerShiftButton.style.outline = 'none'
  rulerShiftButton.title = 'Click to shift ruler left and extend to fit screen'

  const pulseKeyframes = `
    @keyframes ruler-shift-pulse {
      0%, 100% { transform: translate(-50%, 0) scale(1); }
      50% { transform: translate(-50%, 0) scale(1.08); }
    }
  `
  if (!document.getElementById('ruler-shift-pulse-style')) {
    const style = document.createElement('style')
    style.id = 'ruler-shift-pulse-style'
    style.textContent = pulseKeyframes
    document.head.appendChild(style)
  }
  rulerShiftButton.style.animation = 'ruler-shift-pulse 2s ease-in-out infinite'

  const positionRulerShiftButton = () => {
    const buttonX = screenWidth / 2
    const rulerY = (startY + endY) / 2
    const rulerTopEdge = rulerY - tape.dimensions.tapeWidth / 2
    const buttonBottomEdge = rulerTopEdge - 25
    const buttonY = buttonBottomEdge - 100
    rulerShiftButton.style.left = `${buttonX}px`
    rulerShiftButton.style.top = `${buttonY}px`
    rulerShiftButton.style.transform = 'translate(-50%, 0)'
  }
  positionRulerShiftButton()

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

  // Active state (when pressed) - Legacy distance.js L5642-5647
  rulerShiftButton.addEventListener('mousedown', () => {
    if (!isAnimating) {
      rulerShiftButton.style.transform = 'translate(-50%, 2px) scale(1.05)'
      rulerShiftButton.style.boxShadow = '0 2px 8px rgba(255, 140, 0, 0.8)'
    }
  })

  // ===================== RULER-SHIFT ANIMATION =====================
  // Legacy distance.js L5649-5809
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
    const distance = tape.helpers.getDistance(startX, startY, endX, endY)
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

    const ANIMATION_SPEED = 200
    const TARGET_MARGIN = 25

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
  container.appendChild(rulerShiftButton)

  // ===================== TEXT BOX LABELS =====================
  // Legacy distance.js L5815-5920
  const createSimpleTextBox = (text, isLeft = true) => {
    const textContainer = document.createElement('div')
    textContainer.style.position = 'absolute'
    textContainer.style.zIndex = '15'

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
        textContainer.dimensions = {
          width: rect.width,
          height: rect.height,
        }
        if (typeof updateDiagonalLabels === 'function') {
          updateDiagonalLabels()
        }
      }, 0)
      return maxWidth
    }

    setTimeout(() => {
      const rect = textBox.getBoundingClientRect()
      textContainer.dimensions = {
        width: rect.width,
        height: rect.height,
      }
    }, 0)

    return {
      container: textContainer,
      textElement: textElement,
      updateText: updateText,
      dimensions: { width: maxWidth, height: 50 },
    }
  }

  const leftLabel = createSimpleTextBox(phrases.RC_LeftEdge[RC.L], true)
  container.appendChild(leftLabel.container)

  const rightLabel = createSimpleTextBox(phrases.RC_RightEdge[RC.L], false)
  rightLabel.container.id = 'right-line-label'
  container.appendChild(rightLabel.container)

  setTimeout(() => {
    const leftRect = leftLabel.container
      .querySelector('div')
      .getBoundingClientRect()
    leftLabel.dimensions = {
      width: leftRect.width,
      height: leftRect.height,
    }
    const rightRect = rightLabel.container
      .querySelector('div')
      .getBoundingClientRect()
    rightLabel.dimensions = {
      width: rightRect.width,
      height: rightRect.height,
    }
    updateDiagonalLabels()
  }, 10)

  // ===================== computeNewIntervalCm =====================
  // Legacy distance.js L4202-4215
  const computeNewIntervalCm = () => {
    const currentDistancePx = tape.helpers.getDistance(
      startX,
      startY,
      endX,
      endY,
    )
    const currentLengthCm = currentDistancePx / pxPerCm
    const r = 0.6 + 0.4 * Math.random()
    return Math.max(0.1, Math.max(0, currentLengthCm - 1) * r)
  }

  // ===================== RULER MARKINGS =====================
  // Legacy distance.js L6024-6121
  const updateRulerMarkings = () => {
    tape.elements.rulerMarkingsContainer.innerHTML = ''

    const distance = tape.helpers.getDistance(startX, startY, endX, endY)

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

      const tickLength = tape.dimensions.tapeWidth * 0.2
      const upperEdgeOffset = tape.dimensions.tapeWidth / 2

      const tickTop = document.createElement('div')
      tickTop.style.position = 'absolute'
      tickTop.style.left = `${markX}px`
      tickTop.style.top = `${markY - upperEdgeOffset}px`
      tickTop.style.width = '2px'
      tickTop.style.height = `${tickLength}px`
      tickTop.style.background = 'rgb(0, 0, 0)'
      tickTop.style.transformOrigin = 'center top'
      tickTop.style.transform = 'rotate(0deg)'
      tape.elements.rulerMarkingsContainer.appendChild(tickTop)

      const tickBottom = document.createElement('div')
      tickBottom.style.position = 'absolute'
      tickBottom.style.left = `${markX}px`
      tickBottom.style.top = `${markY + upperEdgeOffset - tickLength}px`
      tickBottom.style.width = '2px'
      tickBottom.style.height = `${tickLength}px`
      tickBottom.style.background = 'rgb(0, 0, 0)'
      tickBottom.style.transformOrigin = 'center top'
      tickBottom.style.transform = 'rotate(0deg)'
      tape.elements.rulerMarkingsContainer.appendChild(tickBottom)

      const label = document.createElement('div')
      label.style.position = 'absolute'
      label.style.left = `${markX}px`
      label.style.top = `${markY}px`
      label.textContent = i.toString()
      label.style.color = 'rgb(0, 0, 0)'
      label.style.fontSize = '1.8rem'
      label.style.fontWeight = 'bold'
      label.style.whiteSpace = 'nowrap'
      label.style.userSelect = 'none'
      label.style.transform = 'translate(-50%, -50%)'
      tape.elements.rulerMarkingsContainer.appendChild(label)
    }
  }

  // ===================== UPDATE DIAGONAL TAPE COMPONENT =====================
  // Legacy distance.js L5925-6022
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
      const visibleCenterY = startY + tape.dimensions.tapeWidth / 2 + 15

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
      if (estimatedLabelWidth > visibleDistance * 0.4) {
        const scaleFactor = (visibleDistance * 0.4) / estimatedLabelWidth
        const newFontSize = Math.max(0.5, scaleFactor) * 1.0
        tape.elements.dynamicLengthLabel.style.fontSize = `${newFontSize}rem`
      } else {
        tape.elements.dynamicLengthLabel.style.fontSize = '1.0rem'
      }

      const arrowLength = distance
      const arrowOffsetBelow = tape.dimensions.tapeWidth / 2 + 15
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

  // ===================== UPDATE DIAGONAL COLORS =====================
  // Legacy distance.js L6123-6156
  const updateDiagonalColors = () => {
    const distance = tape.helpers.getDistance(startX, startY, endX, endY)
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

  // Hover effects for handle visual lines
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

  // ===================== UPDATE DIAGONAL LABELS =====================
  // Legacy distance.js L6174-6240
  function updateDiagonalLabels() {
    if (isPaperSelectionMode) {
      objectLengthCmGlobal.value = 27.94
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

  // ===================== HORIZONTAL TAPE INTERACTION HANDLERS =====================
  // Legacy distance.js L6242-6425

  let leftDragging = false
  let rightDragging = false
  let bodyDragging = false
  let dragStartMouseX = 0
  let dragStartMouseY = 0
  let dragStartTapeStartX = 0
  let dragStartTapeStartY = 0
  let dragStartTapeEndX = 0
  let dragStartTapeEndY = 0

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

  // Legacy distance.js L6272-6273
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

  // ===================== updateRulerEndpoints =====================
  // Legacy distance.js L6288-6343
  const updateRulerEndpoints = (
    newStartX,
    newStartY,
    newEndX,
    newEndY,
    allowStartOffScreen = false,
  ) => {
    const minY = tape.dimensions.tapeWidth
    const maxY = screenHeight - 30

    const constrainYToScreen = y => {
      return Math.max(minY, Math.min(maxY, y))
    }

    const constrainXToScreen = x => {
      return Math.max(0, Math.min(screenWidth, x))
    }

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

    if (!allowStartOffScreen && distance < 50) {
      return
    }

    startX = constrainedStartX
    startY = constrainedStartY
    endX = constrainedEndX
    endY = constrainedEndY

    positionRulerShiftButton()

    updateDiagonalLabels()
  }

  // Mouse move handler for horizontal tape handles and body
  // Legacy distance.js L6346-6414
  window.addEventListener('mousemove', e => {
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

      if (constrainedEndX !== newEndX) {
        const allowedDeltaX = constrainedEndX - dragStartTapeEndX
        const adjustedStartX = dragStartTapeStartX + allowedDeltaX
        const adjustedEndX = dragStartTapeEndX + allowedDeltaX

        const minY = tape.dimensions.tapeWidth
        const maxY = screenHeight - 30
        const constrainedNewStartY = Math.max(minY, Math.min(maxY, newStartY))
        const constrainedNewEndY = Math.max(minY, Math.min(maxY, newEndY))
        const newRulerY = (constrainedNewStartY + constrainedNewEndY) / 2
        const newRulerTopEdge = newRulerY - tape.dimensions.tapeWidth / 2
        const newButtonBottomEdge = newRulerTopEdge - 25
        const newButtonY = newButtonBottomEdge - 100
        rulerShiftButton.style.top = `${newButtonY}px`

        updateRulerEndpoints(
          adjustedStartX,
          newStartY,
          adjustedEndX,
          newEndY,
          true,
        )
      } else {
        const minY = tape.dimensions.tapeWidth
        const maxY = screenHeight - 30
        const constrainedNewStartY = Math.max(minY, Math.min(maxY, newStartY))
        const constrainedNewEndY = Math.max(minY, Math.min(maxY, newEndY))
        const newRulerY = (constrainedNewStartY + constrainedNewEndY) / 2
        const newRulerTopEdge = newRulerY - tape.dimensions.tapeWidth / 2
        const newButtonBottomEdge = newRulerTopEdge - 25
        const newButtonY = newButtonBottomEdge - 100
        rulerShiftButton.style.top = `${newButtonY}px`

        updateRulerEndpoints(newStartX, newStartY, newEndX, newEndY, true)
      }
    }
  })

  // Mouse up handler - Legacy distance.js L6417-6425
  window.addEventListener('mouseup', () => {
    if (leftDragging || rightDragging || bodyDragging) {
      leftDragging = false
      rightDragging = false
      bodyDragging = false
      document.body.style.cursor = ''
    }
  })

  // ===================== KEYBOARD HANDLING FOR HORIZONTAL TAPE =====================
  // Legacy distance.js L6427-6601
  let arrowKeyDown = false
  let arrowIntervalFunction = null
  let currentArrowKey = null
  let intervalCount = 0

  const arrowDownFunction = e => {
    if (_currentPage !== 2 && _currentPage !== TUBE_CHECK_PAGE) return

    e.preventDefault()

    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key))
      return

    // ── Tube check page arrow keys ──
    if (_currentPage === TUBE_CHECK_PAGE) {
      if (!isFullscreen()) {
        forceFullscreen(RC.L, RC)
        return
      }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return

      if (arrowKeyDown) return
      arrowKeyDown = true
      currentArrowKey = e.key
      intervalCount = 0

      if (arrowIntervalFunction) {
        clearInterval(arrowIntervalFunction)
      }

      const tcCalculateStepSize = () => {
        if (intervalCount > 3) {
          return 5 * pxPerMm
        }
        return 0.5 * pxPerMm
      }

      const sw = window.innerWidth
      const sh = window.innerHeight
      const diagPx = Math.sqrt(sw * sw + sh * sh)

      arrowIntervalFunction = setInterval(() => {
        intervalCount++
        const moveAmount = tcCalculateStepSize()

        if (currentArrowKey === 'ArrowLeft') {
          const minLengthPx = 2 * pxPerCm
          tubeCheckTapeLengthPx = Math.max(
            minLengthPx,
            tubeCheckTapeLengthPx - moveAmount,
          )
        } else if (currentArrowKey === 'ArrowRight') {
          const rightDist = tubeCheckLeftDistPx + tubeCheckTapeLengthPx
          const newRightDist = Math.min(diagPx, rightDist + moveAmount)
          tubeCheckTapeLengthPx = newRightDist - tubeCheckLeftDistPx
        }
        tubeCheckTapeAdjusted = true
        updateTubeCheckTapePosition()
      }, 50)
      return
    }

    // ── Page 2 arrow keys ──
    cancelRulerShiftAnimation()

    if (arrowKeyDown) return

    arrowKeyDown = true
    currentArrowKey = e.key
    intervalCount = 0

    if (arrowIntervalFunction) {
      clearInterval(arrowIntervalFunction)
    }

    const calculateStepSize = () => {
      if (intervalCount > 3) {
        return 5 * pxPerMm
      }
      return 0.5 * pxPerMm
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
    }, 50)
  }

  const arrowUpFunction = e => {
    if (_currentPage !== 2 && _currentPage !== TUBE_CHECK_PAGE) return

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

  document.addEventListener('keydown', arrowDownFunction)
  document.addEventListener('keyup', arrowUpFunction)

  // ===================== BUTTON CONTAINER =====================
  // Legacy distance.js L9703-9716
  const buttonContainer = document.createElement('div')
  buttonContainer.className = 'rc-button-container'
  buttonContainer.style.position = 'fixed'
  buttonContainer.style.bottom = '230px'
  if (RC.LD === RC._CONST.RTL) {
    buttonContainer.style.left = '20px'
  } else {
    buttonContainer.style.right = '20px'
  }
  buttonContainer.style.zIndex = '2147483647'
  buttonContainer.style.display = 'flex'
  buttonContainer.style.gap = '10px'
  document.body.appendChild(buttonContainer)

  // ===================== PROCEED BUTTON =====================
  // Legacy distance.js L9718-9875
  const proceedButton = document.createElement('button')
  proceedButton.className = 'rc-button'
  proceedButton.textContent = phrases.T_proceed[RC.L]
  proceedButton.style.border = '2px solid #019267'
  proceedButton.style.backgroundColor = '#019267'
  proceedButton.style.color = 'white'
  proceedButton.style.fontSize = '1.2rem'
  proceedButton.style.padding = '8px 16px'
  proceedButton.style.borderRadius = '4px'
  proceedButton.style.cursor = 'pointer'

  // ===================== PROCEED BUTTON ONCLICK =====================
  // Legacy distance.js L9734-9873
  // The onclick delegates to nextPage for pages 0/1, and handles
  // page 2 measurement/validation inline.  The `nextPage` function
  // is provided by pageController, which is not yet created at this
  // point.  We use a deferred reference that the orchestrator patches
  // after creating pageController.
  let _nextPageFn = null

  proceedButton.onclick = async () => {
    console.log('Proceed button clicked')

    if (_currentPage === 0) {
      if (_nextPageFn) await _nextPageFn()
    } else if (_currentPage === 1) {
      if (_nextPageFn) await _nextPageFn()
    } else if (_currentPage === 2) {
      if (isPaperSelectionMode) {
        const advanced = _nextPageFn ? await _nextPageFn() : false
        if (advanced && !RC.gazeTracker.checkInitialized('distance')) {
          RC.gazeTracker._init(
            {
              toFixedN: 1,
              showVideo: true,
              showFaceOverlay: false,
            },
            'distance',
          )
        }
        return
      }
      const diagonalDistancePx = tape.helpers.getDistance(
        startX,
        startY,
        endX,
        endY,
      )
      firstMeasurement = diagonalDistancePx / pxPerMm / 10
      console.log('First measurement:', firstMeasurement)

      const minCm = options.calibrateDistanceObjectMinMaxCm?.[0] || 10
      const isFirstMeasurement = measurementState.measurements.length === 0
      const shouldEnforceMinimum =
        isFirstMeasurement || measurementState.lastAttemptWasTooShort

      objectTestCommonData.objectRulerIntervalCm.push(
        Math.round(Number(intervalCmCurrent) * 10) / 10,
      )

      if (shouldEnforceMinimum) {
        if (Math.round(firstMeasurement) < Math.round(minCm)) {
          console.log(
            `Object too short: ${Math.round(firstMeasurement)}cm < ${Math.round(minCm)}cm (isFirst: ${isFirstMeasurement}, prevWasShort: ${measurementState.lastAttemptWasTooShort})`,
          )

          measurementState.lastAttemptWasTooShort = true
          objectTestCommonData.objectMeasuredMsg.push('short')

          measurementState.tooShortRejectionCount++
          console.log(
            `Rejection count: ${measurementState.tooShortRejectionCount}`,
          )

          const objectCm = firstMeasurement
          const errorMessage =
            phrases.RC_YourObjectIsTooShort?.[RC.L]
              ?.replace('[[IN1]]', Math.round(objectCm / 2.54).toString())
              ?.replace('[[CM1]]', Math.round(objectCm).toString())
              ?.replace('[[IN2]]', Math.round(minCm / 2.54).toString())
              ?.replace('[[CM2]]', Math.round(minCm).toString()) ||
            `Your object (${Math.round(objectCm)}cm) is too short. Minimum: ${Math.round(minCm)}cm`

          await Swal.fire({
            ...swalInfoOptions(RC, { showIcon: false }),
            icon: undefined,
            html: processInlineFormatting(errorMessage),
            allowEnterKey: true,
            confirmButtonText: phrases.T_ok?.[RC.L] || 'OK',
          })

          await resetPage2ForNextMeasurement()

          return
        } else {
          console.log(
            `Measurement passed minimum length enforcement: ${Math.round(firstMeasurement)}cm >= ${Math.round(minCm)}cm`,
          )
          measurementState.lastAttemptWasTooShort = false
        }
      } else {
        console.log(
          `Not enforcing minimum length for measurement #${measurementState.measurements.length + 1}: ${Math.round(firstMeasurement)}cm`,
        )
        if (Math.round(firstMeasurement) < Math.round(minCm)) {
          console.log(
            `Current measurement is too short (${Math.round(firstMeasurement)}cm < ${Math.round(minCm)}cm) - will enforce on NEXT measurement`,
          )
          measurementState.lastAttemptWasTooShort = true
          objectTestCommonData.objectMeasuredMsg.push('short')
        } else {
          measurementState.lastAttemptWasTooShort = false
        }
      }

      const originalMeasurementData = {
        startX: startX,
        startY: startY,
        endX: endX,
        endY: endY,
        objectLengthPx: diagonalDistancePx,
        objectLengthMm: diagonalDistancePx / pxPerMm,
        objectLengthCm: firstMeasurement,
      }

      if (_nextPageFn) await _nextPageFn()

      if (!RC.gazeTracker.checkInitialized('distance')) {
        RC.gazeTracker._init(
          {
            toFixedN: 1,
            showVideo: true,
            showFaceOverlay: false,
          },
          'distance',
        )
      }
    }
  }
  buttonContainer.appendChild(proceedButton)

  // ===================== EXPLANATION BUTTON =====================
  // Legacy distance.js L9877-9904
  const explanationButton = document.createElement('button')
  explanationButton.className = 'rc-button'
  explanationButton.textContent = phrases.RC_viewingDistanceIntroTitle[RC.L]
  explanationButton.style.border = '2px solid #999'
  explanationButton.style.backgroundColor = '#999'
  explanationButton.style.color = 'white'
  explanationButton.style.fontSize = '0.9rem'
  explanationButton.style.padding = '8px 16px'
  explanationButton.style.borderRadius = '4px'
  explanationButton.style.cursor = 'pointer'
  explanationButton.onclick = () => {
    const rawText = isPaperSelectionMode
      ? phrases.RC_viewingDistanceIntroPaperTubeMethod[RC.L]
      : phrases.RC_viewingDistanceIntroPelliMethod[RC.L]
    const explanationHtml = processInlineFormatting(rawText).replace(
      /\n/g,
      '<br>',
    )
    Swal.fire({
      ...swalInfoOptions(RC, { showIcon: false }),
      icon: undefined,
      html: `<div style="text-align: left;">${explanationHtml}</div>`,
      allowEnterKey: true,
      confirmButtonText: phrases.T_ok ? phrases.T_ok[RC.L] : 'OK',
    })
  }
  buttonContainer.appendChild(explanationButton)

  // ===================== CLEANUP BEFORE CHECK DISTANCE =====================
  // Legacy distance.js L4458-4486
  const cleanupBeforeCheckDistance = () => {
    removeArrowIndicatorsFromDOM()
    cancelRulerShiftAnimation()
    if (instructionsUI?.destroy) {
      instructionsUI.destroy()
    }
    // Remove ALL viewport-positioned stepper media containers from document.body.
    // These are created by createStepInstructionsUI with class 'rc-stepper-media-container'
    // and persist outside the objectTest container.
    document
      .querySelectorAll('body > .rc-stepper-media-container')
      .forEach(el => {
        el.parentNode.removeChild(el)
      })
    if (
      typeof buttonContainer !== 'undefined' &&
      buttonContainer &&
      buttonContainer.parentNode
    ) {
      buttonContainer.parentNode.removeChild(buttonContainer)
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container)
    }
    const rulerNote = document.getElementById('paper-dont-use-ruler-note')
    if (rulerNote && rulerNote.parentNode) {
      rulerNote.parentNode.removeChild(rulerNote)
    }
    const rulerColumn = document.getElementById('dont-use-ruler-column')
    if (rulerColumn && rulerColumn.parentNode) {
      rulerColumn.parentNode.removeChild(rulerColumn)
    }
    document.removeEventListener('keydown', handlePaperStepperNav)
    document.removeEventListener('keydown', arrowDownFunction)
    document.removeEventListener('keyup', arrowUpFunction)
    document.removeEventListener('keydown', handleInstructionNav)
    window.removeEventListener('resize', reflowInstructionsOnResize)
    if (arrowIntervalFunction) {
      clearInterval(arrowIntervalFunction)
      arrowIntervalFunction = null
    }
  }

  // ===================== RESET PAGE 2 FOR NEXT MEASUREMENT =====================
  // Legacy distance.js L6629-6652
  const resetPage2ForNextMeasurement = async () => {
    console.log(
      `=== RESETTING PAGE 2 FOR MEASUREMENT ${measurementState.currentIteration}/${measurementState.totalIterations} ===`,
    )

    startX = leftMarginPx
    endX = leftMarginPx + initialRulerLengthPx

    updateDiagonalLabels()
    updateTitleWithProgress()
    updateInstructions()

    if (!showLength) {
      intervalCmCurrent = computeNewIntervalCm()
      updateRulerMarkings()
    }
  }

  // ===================== MEASUREMENT OVERLAY HELPER =====================
  // Legacy distance.js L9950-9973
  const updateMeasurementOverlayForLocation = () => {
    const splitPhraseToWords = phraseKey => {
      const text = phrases?.[phraseKey]?.[RC.L] || ''
      return text.split(/\s+/).filter(w => w.length > 0)
    }

    if (preferRightHandBool) {
      setMeasurementOverlay({
        isPaperMode: isPaperSelectionMode,
        eye: 'right',
        leftTextWords: null,
        rightTextWords: splitPhraseToWords('RC_UseRightEye'),
      })
    } else {
      setMeasurementOverlay({
        isPaperMode: isPaperSelectionMode,
        eye: 'left',
        leftTextWords: splitPhraseToWords('RC_UseLeftEye'),
        rightTextWords: null,
      })
    }
  }

  // ===================== INITIALIZE RENDERER & LOCATION MANAGER =====================
  // Legacy distance.js L9914-9935
  const measurementPageRenderer = createMeasurementPageRenderer({
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
    createArrowIndicators: targetXYPx => {
      if (!targetXYPx || isNaN(targetXYPx[0]) || isNaN(targetXYPx[1])) {
        console.warn(
          'createArrowIndicators: invalid target coordinates',
          targetXYPx,
        )
        const container = document.createElement('div')
        container.id = 'object-test-arrow-indicators'
        return container
      }
      return createArrowIndicatorsFn(targetXYPx, pxPerCm)
    },
    parseInstructions,
    renderCurrentStepView: () => renderCurrentStepView(),
    test_assetMap,
    setInstructionsText,
  })

  const locationManager = createLocationMeasurementManager(
    calibrateDistanceLocations,
  )

  // ===================== MOUNT CONTAINER TO DOM =====================
  // Legacy distance.js L6611-6612
  // Clear any previous background content and append the main container.
  RC._replaceBackground('')
  RC.background.appendChild(container)

  // ===================== INITIAL LABEL POSITIONING =====================
  // Legacy distance.js L6606 — position tape labels after elements are in the DOM.
  // Only call if not in paper-selection mode (paper mode skips the tape).
  if (!isPaperSelectionMode) {
    updateDiagonalLabels()
  }

  // ===================== RETURN DEPS OBJECT =====================
  return {
    // DOM elements
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

    // Initialized managers
    measurementPageRenderer,
    locationManager,
    measurementState,
    objectTestCommonData,
    objectLengthCmGlobal,
    globalPointXYPx,

    // Scalar config (from context, passed through to pageController)
    RC,
    phrases,
    options,
    isPaperSelectionMode,
    showLength,
    pxPerCm,
    pxPerMm,
    ppi,

    // Utility functions (from context, passed through)
    toFixedNumber,
    isFullscreen,
    forceFullscreen,
    Swal,
    swalInfoOptions,
    processInlineFormatting,
    setDefaultVideoPosition,
    showVideoResolutionLabel,
    hideVideoResolutionLabel,
    clearMeasurementOverlay,
    removeBigCircle,
    buildMeasurementPageConfig,
    positionVideoForLocation,
    getGlobalPointForLocation,
    getOffsetPx,

    // Helper functions created here
    setInstructionsText,
    updateInstructions,
    updateDiagonalLabels,
    updateRulerMarkings,
    computeNewIntervalCm,
    updateTubeCheckTapePosition,
    updateMeasurementOverlayForLocation,
    resetTitleToDefault,
    updateTitleWithProgress,
    renderViewingDistanceProgressTitle,
    resetPage2ForNextMeasurement,
    initPaperStepper,
    renderPaperStepperView,
    cleanupBeforeCheckDistance,
    renderCurrentStepView,
    updateRulerEndpoints,
    cancelRulerShiftAnimation,
    positionRulerShiftButton,
    updateDiagonalTapeOnResize,
    updateDiagonalTapeComponent,
    updateDiagonalColors,
    performRulerShift,
    getRightmostVisibleTickX,
    arrowDownFunction,
    arrowUpFunction,

    // TUBE_CHECK_PAGE sentinel
    TUBE_CHECK_PAGE,

    // Getter/setter for mutable state the pageController needs
    getStartX: () => startX,
    setStartX: val => {
      startX = val
    },
    getStartY: () => startY,
    setStartY: val => {
      startY = val
    },
    getEndX: () => endX,
    setEndX: val => {
      endX = val
    },
    getEndY: () => endY,
    setEndY: val => {
      endY = val
    },
    getScreenWidth: () => screenWidth,
    getScreenHeight: () => screenHeight,
    getSelectedUnit: () => selectedUnit,
    getSelectedPaperOption: () => selectedPaperOption,
    getSelectedPaperLengthCm: () => selectedPaperLengthCm,
    getPaperSuggestionValue: () => paperSuggestionValue,
    getPaperSelectionOptions: () => paperSelectionOptions,
    getPreferRightHandBool: () => preferRightHandBool,
    setPreferRightHandBool: val => {
      preferRightHandBool = val
    },

    getFirstMeasurement: () => firstMeasurement,
    setFirstMeasurement: val => {
      firstMeasurement = val
    },

    getStepInstructionModel: () => stepInstructionModel,
    setStepInstructionModel: val => {
      stepInstructionModel = val
    },
    getCurrentStepFlatIndex: () => currentStepFlatIndex,
    setCurrentStepFlatIndex: val => {
      currentStepFlatIndex = val
    },
    setCurrentStepperPhraseKey: val => {
      currentStepperPhraseKey = val
    },
    getLeftInstructionsText: () => leftInstructionsText,
    getRightInstructionsText: () => rightInstructionsText,
    getSectionMediaContainer: () => sectionMediaContainer,
    getPaperStepperLeftText: () => paperStepperLeftText,
    getPaperStepperRightText: () => paperStepperRightText,
    getPaperCurrentStepFlatIndex: () => paperCurrentStepFlatIndex,
    setPaperCurrentStepFlatIndex: val => {
      paperCurrentStepFlatIndex = val
    },

    getArrowIndicators: () => arrowIndicators,
    setArrowIndicators: val => {
      arrowIndicators = val
    },
    getMatchHalfLengthBool: () => matchHalfLengthBool,
    setMatchHalfLengthBool: val => {
      matchHalfLengthBool = val
    },
    getTubeCheckLeftDistPx: () => tubeCheckLeftDistPx,
    setTubeCheckLeftDistPx: val => {
      tubeCheckLeftDistPx = val
    },
    getTubeCheckTapeLengthPx: () => tubeCheckTapeLengthPx,
    setTubeCheckTapeLengthPx: val => {
      tubeCheckTapeLengthPx = val
    },
    getTubeCheckTapeAdjusted: () => tubeCheckTapeAdjusted,
    setTubeCheckTapeAdjusted: val => {
      tubeCheckTapeAdjusted = val
    },

    getViewingDistanceMeasurementCount: () => viewingDistanceMeasurementCount,
    setViewingDistanceMeasurementCount: val => {
      viewingDistanceMeasurementCount = val
    },
    getViewingDistanceTotalExpected: () => viewingDistanceTotalExpected,
    setViewingDistanceTotalExpected: val => {
      viewingDistanceTotalExpected = val
    },

    getFaceMeshSamplesPage3: () => faceMeshSamplesPage3,
    getFaceMeshSamplesPage4: () => faceMeshSamplesPage4,
    getMeshSamplesDuringPage3: () => meshSamplesDuringPage3,
    getMeshSamplesDuringPage4: () => meshSamplesDuringPage4,
    getCameraResolutionXYVpxPage3: () => cameraResolutionXYVpxPage3,
    setCameraResolutionXYVpxPage3: val => {
      cameraResolutionXYVpxPage3 = val
    },
    getCameraResolutionXYVpxPage4: () => cameraResolutionXYVpxPage4,
    setCameraResolutionXYVpxPage4: val => {
      cameraResolutionXYVpxPage4 = val
    },
    setFaceMeshSamplesPage4Array: arr => {
      faceMeshSamplesPage4.length = 0
      faceMeshSamplesPage4.push(...arr)
    },
    setMeshSamplesDuringPage4Array: arr => {
      meshSamplesDuringPage4.length = 0
      meshSamplesDuringPage4.push(...arr)
    },
    setFaceMeshSamplesPage3Array: arr => {
      faceMeshSamplesPage3.length = 0
      faceMeshSamplesPage3.push(...arr)
    },
    setMeshSamplesDuringPage3Array: arr => {
      meshSamplesDuringPage3.length = 0
      meshSamplesDuringPage3.push(...arr)
    },
    paperSuggestionInput,

    getIntervalCmCurrent: () => intervalCmCurrent,
    setIntervalCmCurrent: val => {
      intervalCmCurrent = val
    },

    getShowingReadFirstPopup: () => _showingReadFirstPopup,
    setShowingReadFirstPopup: val => {
      _showingReadFirstPopup = val
    },
    getObjectTestHasFinished: () => objectTestHasFinished,
    setObjectTestHasFinished: val => {
      objectTestHasFinished = val
    },

    getIsAnimating: () => isAnimating,
    getArrowKeyDown: () => arrowKeyDown,
    getArrowIntervalFunction: () => arrowIntervalFunction,

    dontUseYourRulerRaw,

    // State object expected by keyboardHandler (bridges getter/setter state)
    state: {
      get stepInstructionModel() {
        return stepInstructionModel
      },
      set stepInstructionModel(val) {
        stepInstructionModel = val
      },
      get currentStepFlatIndex() {
        return currentStepFlatIndex
      },
      set currentStepFlatIndex(val) {
        currentStepFlatIndex = val
      },
      get currentStepperPhraseKey() {
        return currentStepperPhraseKey
      },
      set currentStepperPhraseKey(val) {
        currentStepperPhraseKey = val
      },
      get _showingReadFirstPopup() {
        return _showingReadFirstPopup
      },
      set _showingReadFirstPopup(val) {
        _showingReadFirstPopup = val
      },
      get isPaperSelectionMode() {
        return isPaperSelectionMode
      },
      renderCurrentStepView() {
        renderCurrentStepView()
      },
    },

    // Keyboard handler / space handler deps (passed through from context)
    enforceFullscreenOnSpacePress,
    irisTrackingIsActive,
    captureVideoFrame,
    cameraShutterSound,
    stampOfApprovalSound,
    env,
    showPopup,
    callback,
    median,
    constructInstructions,
    getCameraResolutionXY,
    calculateFootXYPx,
    getMeshData,
    saveQueue,
    stateManager,
    removeArrowIndicatorsFromDOM,
    getLastCapturedFaceImage: () => lastCapturedFaceImage,
    setLastCapturedFaceImage: val => {
      lastCapturedFaceImage = val
    },

    // Hook for pageController to keep renderCurrentStepView in sync
    setCurrentPage: val => {
      _currentPage = val
    },

    // Hook for orchestrator to wire nextPage after pageController is created
    setNextPageFn: fn => {
      _nextPageFn = fn
    },
  }
}
