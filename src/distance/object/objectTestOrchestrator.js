/**
 * objectTestOrchestrator.js
 *
 * New modular entry point for the object-based distance calibration test.
 * Wires together all extracted modules to reproduce the exact behavior
 * of the legacy objectTest function in distance.js.
 *
 * This file is NOT yet called from distance.js -- it exists alongside
 * the legacy code until Phase 10 (cutover).
 *
 * Signature matches the legacy: objectTestNew(RC, options, callback)
 */

import Swal from 'sweetalert2'

import { env } from '../../core'
import {
  constructInstructions,
  toFixedNumber,
  median,
  forceFullscreen,
  enforceFullscreenOnSpacePress,
  isFullscreen,
  fitToViewport,
  getCameraResolutionXY,
} from '../../components/utils'
import { setDefaultVideoPosition } from '../../components/video'
import { phrases } from '../../i18n/schema'
import { test_assetMap } from '../assetMap'
import { fetchBlobOnce } from '../instructionMediaCache'
import {
  createStepInstructionsUI,
  renderStepInstructions,
  fitStepperBoxToHeight,
} from '../stepByStepInstructionHelps'
import { parseInstructions } from '../instructionParserAdapter'
import { processInlineFormatting } from '../markdownInstructionParser'
import { fitContentToAvailableSpace } from '../../components/handPreference'
import { swalInfoOptions } from '../../components/swalOptions'
import { setUpEasyEyesKeypadHandler } from '../../extensions/keypadHandler'
import {
  showPopup,
  showTestPopup,
  hideResolutionSettingMessage,
  showVideoResolutionLabel,
  hideVideoResolutionLabel,
} from '../../components/popup'
import { ppiToPxPerCm } from '../../components/converters'
import {
  calculateFootXYPx,
  calculateNearestPoints,
  getMeshData,
  setMeasurementOverlay,
  clearMeasurementOverlay,
} from '../distanceTrack'
import { irisTrackingIsActive } from '../distanceTrack'
import { captureVideoFrame } from '../../check/captureVideoFrame'
import woodSvg from '../../media/AdobeStock_1568677429.svg'

import {
  DEFAULT_TUBE_DIAMETER_CM,
  DEFAULT_OFFSET_CM,
  DEFAULT_CAMERA_WIDTH_VPX,
  FALLBACK_PPI,
  FIRST_BLOCKING_PRELOAD_COUNT,
  MEDIA_PRELOAD_PRIORITY_KEYS,
  CM_PER_INCH,
  DOM_ID,
  Z_INDEX,
} from './objectTestConstants'
import { resolvePaperSelectionOptions } from './optionsParser'
import { createObjectTestStateManager } from './objectTestStateManager'
import { createMeasurementState } from './measurementState'
import { createMeasurementSaveQueue } from './measurementSaveQueue'
import {
  saveCalibrationMeasurements,
  processMeshDataAndCalculateNearestPoints,
  createMeasurementObject,
  measureIntraocularDistancePx,
  blindSpotTestNew,
} from '../distance'
import {
  parseLocationsArray,
  parseLocation,
  getGlobalPointForLocation,
  removeBigCircle,
  createLocationMeasurementManager,
  createMeasurementPageRenderer,
  buildMeasurementPageConfig,
  positionVideoForLocation,
  getArrowPositionForLocation,
} from './index'
import { createRulerTapeComponent } from './rulerTapeComponent'
import { createTubeCheckComponent } from './tubeCheckComponent'
import { createPaperSelectionComponent } from './paperSelectionComponent'
import {
  createArrowIndicators,
  removeArrowIndicatorsFromDOM,
} from './arrowIndicatorComponent'
import { collectFaceMeshSamples as _collectFaceMeshSamples } from './faceMeshCollector'
import {
  handleSpaceOnTubeCheck,
  handleSpaceOnPage2,
  handleSpaceOnPage3,
} from './spaceKeyHandler'
import {
  calculateCalibrationFactors,
  buildCalibrationData,
  sanitizeDataObject,
} from './calibrationCalculator'
import { createPageController } from './pageController'
import { createKeyboardHandler } from './keyboardHandler'
import { finishObjectTest, cleanupAllResources } from './objectTestFinish'
import { createObjectTestUI } from './objectTestUI'
import { debugLog } from './debugLogger'

// Sound effects (conditionally loaded to avoid issues in test environments)
let soundFeedback, cameraShutterSound, stampOfApprovalSound
if (env !== 'mocha') {
  const soundModule = require('../../components/sound')
  soundFeedback = soundModule.soundFeedback
  cameraShutterSound = soundModule.cameraShutterSound
  stampOfApprovalSound = soundModule.stampOfApprovalSound
}

// Shared global state (matches legacy exports from distance.js)
export const objectLengthCmGlobal = { value: null }
export const globalPointXYPx = { value: [window.screen.width / 2, 0] }

/**
 * Preload instruction media assets with priority ordering.
 * Blocks on the first few highest-priority assets, then continues in background.
 */
async function preloadAllInstructionMedia() {
  const allUrls = []
  const maps = [test_assetMap].filter(Boolean)
  maps.forEach(m => {
    Object.values(m || {}).forEach(u => {
      if (typeof u === 'string' && u) allUrls.push(u)
    })
  })
  if (!allUrls.length) return

  const seen = new Set()
  const ordered = []
  MEDIA_PRELOAD_PRIORITY_KEYS.forEach(key => {
    const url = (test_assetMap && test_assetMap[key]) || null
    if (url && allUrls.includes(url) && !seen.has(url)) {
      ordered.push(url)
      seen.add(url)
    }
  })
  allUrls.forEach(url => {
    if (!seen.has(url)) {
      ordered.push(url)
      seen.add(url)
    }
  })

  const firstBatch = ordered.slice(0, FIRST_BLOCKING_PRELOAD_COUNT)
  const remaining = ordered.slice(FIRST_BLOCKING_PRELOAD_COUNT)

  await Promise.all(firstBatch.map(fetchBlobOnce)).catch(error => {
    debugLog('preload', 'Error preloading initial media:', error)
  })

  if (remaining.length && !window.__eeInstructionMediaPreloaderPromise) {
    window.__eeInstructionMediaPreloaderPromise = (async () => {
      for (const url of remaining) {
        try {
          await fetchBlobOnce(url)
        } catch (err) {
          debugLog('preload', 'Error preloading media url:', err)
        }
      }
    })()
  }
}

/**
 * New modular object test entry point.
 * Drop-in replacement for the legacy objectTest function.
 *
 * @param {object} RC - RemoteCalibrator instance
 * @param {object} options - Calibration options
 * @param {function} [callback] - Completion callback
 */
export async function objectTestNew(RC, options, callback = undefined) {
  debugLog('orchestrator', 'objectTestNew called')

  RC._addBackground()

  // Store tube options on RC so locationUtils can access them
  RC._calibrateDistanceTubeDiameterCm =
    options.calibrateDistanceTubeDiameterCm ?? DEFAULT_TUBE_DIAMETER_CM
  RC._calibrateDistanceDrawPaperTubeBool =
    options.calibrateDistanceDrawPaperTubeBool !== false

  // ─── Typical mode (early return) ─────────────────────────────────────
  const isTypicalModeBool = options.useObjectTestData === 'typical'
  if (isTypicalModeBool) {
    hideResolutionSettingMessage()
    let range = options.calibrateDistanceFocalLengthRange
    if (typeof range === 'string') {
      range = range.split(',').map(s => parseFloat(s.trim()))
    }
    const fOverWidth = range.reduce((a, b) => a + b, 0) / range.length
    RC.calibrationFOverWidth = fOverWidth
    const cameraWidthVpx =
      options.calibrateDistanceCameraResolution[0] || DEFAULT_CAMERA_WIDTH_VPX
    const calibrationFactor = fOverWidth * cameraWidthVpx * RC._CONST.IPD_CM
    const data = {
      value: null,
      timestamp: performance.now(),
      method: 'typical',
      calibrationFactor,
      averageFaceMesh: null,
    }
    if (options.calibrateDistanceCheckBool) {
      await RC._checkDistance(
        callback,
        data,
        'trackDistance',
        options.checkCallback,
        options.calibrateDistanceCheckCm,
        options.callbackStatic,
        options.calibrateDistanceCheckSecs,
        options.calibrateDistanceCheckLengthCm,
        options.calibrateDistanceCenterYourEyesBool,
        options.calibrateDistancePupil,
        options.calibrateDistanceChecking,
        options.calibrateDistanceSpotXYDeg,
        options.calibrateDistance,
        options.stepperHistory,
        options.calibrateDistanceAllowedRatioPxPerCm,
        options.calibrateDistanceAllowedRatioFOverWidth,
        options.viewingDistanceWhichEye,
        undefined,
        options.calibrateDistanceCheckMinRulerCm,
        options.calibrateDistanceCorrectForHeadRotation,
      )
    } else if (typeof callback === 'function') {
      callback(data)
    }
    RC._removeBackground()
    return
  }

  // ─── Mode flags ──────────────────────────────────────────────────────
  const isPaperSelectionModeBool = options.useObjectTestData === 'paper'
  const showLengthBool = !!options.calibrateDistanceShowRulerUnitsBool
  const calibrateDistanceOffsetCm =
    options.calibrateDistanceOffsetCm ?? DEFAULT_OFFSET_CM

  // ─── PPI and unit conversions ────────────────────────────────────────
  const ppi = RC.screenPpi ? RC.screenPpi.value : FALLBACK_PPI
  const pxPerMm = ppi / 25.4
  const pxPerCm = ppi / CM_PER_INCH

  const getOffsetPx = () => {
    const currentPpi = RC.screenPpi
      ? RC.screenPpi.value
      : RC._CONST.N.PPI_DONT_USE
    return calibrateDistanceOffsetCm * (currentPpi / CM_PER_INCH)
  }

  // ─── Webcam info ─────────────────────────────────────────────────────
  let webcamMaxXYVpx = ''
  let webcamMaxHz = null
  if (RC.gazeTracker?.webgazer?.videoParamsToReport) {
    const vp = RC.gazeTracker.webgazer.videoParamsToReport
    const maxW = Math.max(vp.maxHeight || 0, vp.maxWidth || 0)
    const maxH = Math.min(vp.maxHeight || 0, vp.maxWidth || 0)
    if (maxW && maxH) webcamMaxXYVpx = `${maxW},${maxH}`
    webcamMaxHz = vp.maxFrameRate || null
  }

  // ─── Paper selection options ─────────────────────────────────────────
  const {
    paperSelectionOptions,
    usePaperOnlyChoicesBool,
    paperChoicesPhraseKey,
  } = resolvePaperSelectionOptions({
    isPaperSelectionModeBool,
    calibrateDistanceCheckBool: options.calibrateDistanceCheckBool,
    phrases,
    lang: RC.L,
  })

  // ─── Parse locations ─────────────────────────────────────────────────
  const calibrateDistanceLocations = parseLocationsArray(
    options.calibrateDistanceLocations,
  )

  // ─── State managers ──────────────────────────────────────────────────
  const stateManager = createObjectTestStateManager({
    options,
    calibrateDistanceOffsetCm,
    webcamMaxXYVpx,
    webcamMaxHz,
  })

  const measurementState = createMeasurementState({
    objectMeasurementCount: options.objectMeasurementCount,
    isPaperSelectionModeBool,
  })

  const saveQueue = createMeasurementSaveQueue()

  // ─── Preload media ───────────────────────────────────────────────────
  await preloadAllInstructionMedia()

  // ─── Shared context object ───────────────────────────────────────────
  // This is passed to all modules so they can access shared state and dependencies.
  // It replaces the closure-based sharing in the legacy monolithic function.
  const context = {
    RC,
    options,
    callback,
    phrases,
    env,
    ppi,
    pxPerMm,
    pxPerCm,
    getOffsetPx,
    isPaperSelectionModeBool,
    showLengthBool,
    calibrateDistanceOffsetCm,
    calibrateDistanceLocations,
    paperSelectionOptions,
    usePaperOnlyChoicesBool,
    paperChoicesPhraseKey,
    stateManager,
    measurementState,
    saveQueue,
    woodSvg,
    test_assetMap,
    // Functions from external modules
    toFixedNumber,
    median,
    forceFullscreen,
    enforceFullscreenOnSpacePress,
    isFullscreen,
    fitToViewport,
    getCameraResolutionXY,
    setDefaultVideoPosition,
    constructInstructions,
    parseInstructions,
    processInlineFormatting,
    renderStepInstructions,
    createStepInstructionsUI,
    fitStepperBoxToHeight,
    fitContentToAvailableSpace,
    swalInfoOptions,
    setUpEasyEyesKeypadHandler,
    showPopup,
    showTestPopup,
    hideResolutionSettingMessage,
    showVideoResolutionLabel,
    hideVideoResolutionLabel,
    ppiToPxPerCm,
    calculateFootXYPx,
    calculateNearestPoints,
    getMeshData,
    setMeasurementOverlay,
    clearMeasurementOverlay,
    irisTrackingIsActive,
    captureVideoFrame,
    Swal,
    createArrowIndicators,
    removeArrowIndicatorsFromDOM,
    collectFaceMeshSamples: (RC, samplesArr, ppi, meshSamplesArr) =>
      _collectFaceMeshSamples(
        RC,
        options.calibrateDistancePupil,
        samplesArr,
        meshSamplesArr,
        measureIntraocularDistancePx,
      ),
    calculateCalibrationFactors,
    buildCalibrationData,
    sanitizeDataObject,
    removeBigCircle,
    createLocationMeasurementManager,
    createMeasurementPageRenderer,
    buildMeasurementPageConfig,
    positionVideoForLocation,
    getArrowPositionForLocation,
    getGlobalPointForLocation,
    parseLocation,
    finishObjectTest,
    cleanupAllResources,
    saveCalibrationMeasurements,
    processMeshDataAndCalculateNearestPoints,
    createMeasurementObject,
    measureIntraocularDistancePx,
    blindSpotTestNew,
    soundFeedback,
    cameraShutterSound,
    stampOfApprovalSound,
    isCameraDisconnected: () =>
      RC.gazeTracker?.isCameraDisconnected?.() ?? false,
  }

  // ─── Show initial popup before creating UI ─────────────────────────
  if (!options.cameraSelectionDone) {
    await showTestPopup(RC, null, options)
  }

  // ─── Create all shared DOM elements, state, and helpers ──────────────
  // createObjectTestUI mirrors the legacy objectTest closure: it creates
  // every DOM element (container, title, tape, buttons, etc.), initialises
  // the measurementPageRenderer and locationManager, and returns a `deps`
  // object that satisfies every property pageController/keyboardHandler expect.
  const deps = createObjectTestUI(context)

  // ─── Create page controller ──────────────────────────────────────────
  const pageController = createPageController(deps)
  deps.pageController = pageController
  context.pageController = pageController

  // Wire the proceed button's deferred nextPage reference now that
  // pageController exists (objectTestUI creates the onclick handler
  // before pageController is available).
  if (deps.setNextPageFn) {
    deps.setNextPageFn(() => pageController.nextPage())
  }

  // ─── Wire space key dispatch function ─────────────────────────────────
  // The keyboardHandler calls spaceKeyHandler(currentPage, listenerCtx).
  // We create a dispatch function that routes to the correct per-page handler.
  //
  // The per-page handlers (from spaceKeyHandler.js) destructure flat property
  // names (e.g. `tubeCheckTapeAdjusted`) while objectTestUI exposes them via
  // getter functions (e.g. `getTubeCheckTapeAdjusted()`).  We resolve all
  // getters into a flat snapshot so the handlers work unchanged.
  const TUBE_CHECK_PAGE = 'tubeCheck'
  deps.spaceKeyHandler = async (currentPage, listenerCtx) => {
    const handlerContext = {
      // Start with the orchestrator's context (has all external utility functions)
      ...context,
      // Layer on deps from objectTestUI (has DOM elements, state accessors, helpers)
      ...deps,
      // Resolve getter-based state into flat values the handlers expect
      tubeCheckTapeAdjusted: deps.getTubeCheckTapeAdjusted(),
      tubeCheckTapeLengthPx: deps.getTubeCheckTapeLengthPx(),
      matchHalfLengthBool: deps.getMatchHalfLengthBool(),
      selectedPaperLengthCm: deps.getSelectedPaperLengthCm(),
      selectedPaperOption: deps.getSelectedPaperOption(),
      selectedPaperLabel: deps.getSelectedPaperOption()
        ? deps
            .getPaperSelectionOptions()
            ?.find(o => o.key === deps.getSelectedPaperOption())?.label
        : null,
      paperSuggestionValue: deps.getPaperSuggestionValue(),
      preferRightHandBool: deps.getPreferRightHandBool(),
      firstMeasurement: deps.getFirstMeasurement(),
      arrowIndicators: deps.getArrowIndicators(),
      faceMeshSamplesPage3: deps.getFaceMeshSamplesPage3(),
      faceMeshSamplesPage4: deps.getFaceMeshSamplesPage4(),
      meshSamplesDuringPage3: deps.getMeshSamplesDuringPage3(),
      meshSamplesDuringPage4: deps.getMeshSamplesDuringPage4(),
      cameraResolutionXYVpxPage3: deps.getCameraResolutionXYVpxPage3(),
      setCameraResolutionXYVpxPage3: deps.setCameraResolutionXYVpxPage3,
      cameraResolutionXYVpxPage4: deps.getCameraResolutionXYVpxPage4(),
      setCameraResolutionXYVpxPage4: deps.setCameraResolutionXYVpxPage4,
      setFaceMeshSamplesPage4Array: deps.setFaceMeshSamplesPage4Array,
      setMeshSamplesDuringPage4Array: deps.setMeshSamplesDuringPage4Array,
      setFaceMeshSamplesPage3Array: deps.setFaceMeshSamplesPage3Array,
      setMeshSamplesDuringPage3Array: deps.setMeshSamplesDuringPage3Array,
      objectTestFinishFunction: () =>
        finishObjectTest({
          ...context,
          ...deps,
          objectTestHasFinishedRef: {
            get value() {
              return deps.getObjectTestHasFinished()
            },
            set value(v) {
              deps.setObjectTestHasFinished(v)
            },
          },
          firstMeasurement: deps.getFirstMeasurement(),
          startX: deps.getStartX(),
          startY: deps.getStartY(),
          endX: deps.getEndX(),
          endY: deps.getEndY(),
          screenWidth: deps.getScreenWidth(),
          arrowIndicators: deps.getArrowIndicators(),
          intraocularDistanceCm: null,
          faceMeshSamplesPage3: deps.getFaceMeshSamplesPage3(),
          faceMeshSamplesPage4: deps.getFaceMeshSamplesPage4(),
          isPaperSelectionMode: deps.state?.isPaperSelectionMode,
          selectedPaperOption: deps.getSelectedPaperOption(),
          selectedPaperLabel: deps.getSelectedPaperOption()
            ? deps
                .getPaperSelectionOptions()
                ?.find(o => o.key === deps.getSelectedPaperOption())?.label
            : null,
          selectedPaperLengthCm: deps.getSelectedPaperLengthCm(),
          paperSuggestionValue: deps.getPaperSuggestionValue(),
        }),
      setPreferRightHandBool: deps.setPreferRightHandBool,
      setArrowIndicators: deps.setArrowIndicators,
      lastCapturedFaceImage: deps.getLastCapturedFaceImage(),
      setLastCapturedFaceImage: deps.setLastCapturedFaceImage,
      viewingDistanceMeasurementCount:
        deps.getViewingDistanceMeasurementCount(),
      setViewingDistanceMeasurementCount:
        deps.setViewingDistanceMeasurementCount,
      stepInstructionModel: deps.getStepInstructionModel(),
      setStepInstructionModel: deps.setStepInstructionModel,
      currentStepFlatIndex: deps.getCurrentStepFlatIndex(),
      setCurrentStepFlatIndex: deps.setCurrentStepFlatIndex,
      currentStepperPhraseKey: deps.state?.currentStepperPhraseKey,
      setCurrentStepperPhraseKey: deps.setCurrentStepperPhraseKey,
      isPaperSelectionMode: deps.state?.isPaperSelectionMode,
      // Map keyboard handler's attach/detach to the names space handlers expect
      reattachKeydown: listenerCtx.attach,
      detachKeydown: listenerCtx.detach,
      // Page navigation from the page controller
      showPage: pageController.showPage.bind(pageController),
      nextPage: pageController.nextPage.bind(pageController),
      getCurrentPage: pageController.getCurrentPage.bind(pageController),
    }
    if (currentPage === TUBE_CHECK_PAGE) {
      await handleSpaceOnTubeCheck(handlerContext)
    } else if (currentPage === 2) {
      await handleSpaceOnPage2(handlerContext)
    } else if (currentPage === 3) {
      await handleSpaceOnPage3(handlerContext)
    }
  }

  // ─── Create keyboard handler ─────────────────────────────────────────
  const keyboardHandler = createKeyboardHandler(deps)
  deps.keyboardHandler = keyboardHandler
  context.keyboardHandler = keyboardHandler

  // ─── Final initialisation ────────────────────────────────────────────
  hideResolutionSettingMessage()

  const webgazerFaceFeedbackBox = document.getElementById(
    DOM_ID.FACE_FEEDBACK_BOX,
  )
  if (!options.calibrateDistanceCenterYourEyesBool && webgazerFaceFeedbackBox) {
    webgazerFaceFeedbackBox.style.display = 'none'
  }

  // ─── Camera disconnection handling ─────────────────────────────────
  let cameraDisconnectedDuringTest = false

  const unsubDisconnect = RC.gazeTracker.onCameraDisconnected(() => {
    cameraDisconnectedDuringTest = true
    keyboardHandler.detach()
    debugLog('orchestrator', 'Camera disconnected – keyboard input blocked')
  })

  const unsubReconnect = RC.gazeTracker.onCameraReconnected(() => {
    if (!cameraDisconnectedDuringTest) return
    cameraDisconnectedDuringTest = false

    const currentPage = pageController.getCurrentPage()
    debugLog(
      'orchestrator',
      `Camera reconnected on page ${currentPage} – restoring UI`,
    )

    if (currentPage === 3) {
      // On the measurement page: discard in-progress samples and roll back
      // the location manager so the participant retakes this measurement.
      const locationManager = deps.locationManager
      if (locationManager && locationManager.getCurrentIndex() > 0) {
        locationManager.rejectAndGoBack(1)
      }

      const faceMeshSamplesPage3 = deps.getFaceMeshSamplesPage3()
      const meshSamplesDuringPage3 = deps.getMeshSamplesDuringPage3()
      if (faceMeshSamplesPage3) faceMeshSamplesPage3.length = 0
      if (meshSamplesDuringPage3) meshSamplesDuringPage3.length = 0

      const resetPageConfig = buildMeasurementPageConfig(
        locationManager,
        options.saveSnapshots || false,
        deps.getPreferRightHandBool(),
        getOffsetPx(),
      )

      if (resetPageConfig && deps.measurementPageRenderer) {
        deps.measurementPageRenderer.showMeasurementPage({
          ...resetPageConfig,
          pageNumberOffset: deps.state?.isPaperSelectionMode ? 2 : 0,
          setStepModel: (model, index, phraseKey) => {
            deps.setStepInstructionModel(model)
            if (index != null) deps.setCurrentStepFlatIndex(index)
            const maxIdx = (model?.flatSteps?.length || 1) - 1
            if (deps.getCurrentStepFlatIndex() > maxIdx)
              deps.setCurrentStepFlatIndex(maxIdx)
            if (phraseKey) deps.setCurrentStepperPhraseKey(phraseKey)
          },
          onHandPreferenceChange: isRight => {
            deps.setPreferRightHandBool(isRight)
            deps.updateMeasurementOverlayForLocation()
          },
        })
      }
    } else {
      // On pages 0, 1, 2, or tubeCheck: simply re-show the current page
      // so the UI is refreshed without jumping to the measurement phase.
      pageController.showPage(currentPage)
    }

    keyboardHandler.attach()
  })

  // Expose unsub functions so objectTestFinish can clean them up
  context._unsubCameraDisconnect = unsubDisconnect
  context._unsubCameraReconnect = unsubReconnect
  deps._unsubCameraDisconnect = unsubDisconnect
  deps._unsubCameraReconnect = unsubReconnect

  // ─── Attach keyboard and show first page ─────────────────────────────
  keyboardHandler.attach()

  if (options.calibrateDistanceCenterYourEyesBool) {
    await pageController.showPage(0)
  } else {
    await pageController.showPage(2)
  }
}
