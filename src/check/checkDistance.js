import RemoteCalibrator from '../core'
import { takeInput } from '../components/checkInput'
import {
  constructInstructions,
  getCameraResolutionXY,
  safeExecuteFunc,
  forceFullscreen,
  enforceFullscreenOnSpacePress,
} from '../components/utils'
import { setUpEasyEyesKeypadHandler } from '../extensions/keypadHandler'
import { phrases } from '../i18n/schema'
import Swal from 'sweetalert2'
import { swalInfoOptions } from '../components/swalOptions'
import { showPopup } from '../components/popup'
import { processInlineFormatting } from '../distance/markdownInstructionParser'
import {
  createStepInstructionsUI,
  renderStepInstructions,
  fitStepperBoxToHeight,
} from '../distance/stepByStepInstructionHelps'
import { parseInstructions } from '../distance/instructionParserAdapter'
import { resolveInstructionMediaUrl } from '../distance/instructionMediaCache'
import { test_phrases, test_assetMap } from '../distance/assetMap'
import {
  irisTrackingIsActive,
  setMeasurementOverlay,
  clearMeasurementOverlay,
  stdDist,
} from '../distance/distanceTrack'
import {
  createHandPreferenceSelector,
  fitContentToAvailableSpace,
} from '../components/handPreference'
import { showPutGlassesBackOnScreen } from '../distance/object/objectTestFinish'

// Debug: Log what's imported
console.log('📦 checkDistance.js imports:', {
  test_phrases_exists: !!test_phrases,
  test_phrases_keys: test_phrases ? Object.keys(test_phrases) : [],
  test_phrases_sample: test_phrases?.RC_produceDistanceLocation_MD,
  test_assetMap_exists: !!test_assetMap,
})
import { getLeftAndRightEyePointsFromMeshData } from '../distance/distance'
import { captureVideoFrame } from './captureVideoFrame'

import { trimVideoFeedbackDisplay } from './videoHelpers'
import {
  validateFaceMeshSamples,
  showFaceBlockedPopup,
} from './faceMeshValidation'
import {
  getLocalizedUnit,
  createViewingDistanceDiv,
  removeViewingDistanceDiv,
  adjustFontSize,
  updateViewingDistanceDiv,
  createProgressBar,
  updateProgressBar,
  removeProgressBar,
} from './distanceCheckUI'
import { checkSize } from './checkSize'

// Import sound feedback
let cameraShutterSound
try {
  const soundModule = require('../components/sound')
  cameraShutterSound = soundModule.cameraShutterSound
} catch (error) {
  console.warn('Sound module not available')
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
  calibrateDistanceAllowedRatioPxPerCm = 1.1,
  calibrateDistanceAllowedRatioFOverWidth = 1.1,
  viewingDistanceWhichEye = undefined,
  saveSnapshots = false,
  calibrateDistanceCheckMinRulerCm = 0,
) {
  // Force fullscreen unconditionally on "Set your viewing distance" page arrival
  forceFullscreen(this.L, this)

  // Expose calibration params so getEquipment can fill [[N1]] and [[N2]] in RC_howLong
  this._calibrateDistanceCheckCmForEquipment = calibrateDistanceCheckCm
  this._calibrateDistanceCheckMinRulerCm = calibrateDistanceCheckMinRulerCm

  await this.getEquipment(async () => {
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
      calibrateDistanceAllowedRatioPxPerCm,
      calibrateDistanceAllowedRatioFOverWidth,
      viewingDistanceWhichEye,
      saveSnapshots,
    )
  }, false)
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
  calibrateDistanceAllowedRatioPxPerCm = 1.1,
  calibrateDistanceAllowedRatioFOverWidth = 1.1,
  viewingDistanceWhichEye = undefined,
  saveSnapshots = false,
) => {
  const isTrack = measureName === 'trackDistance'
  const isBlindspot = calibrateDistance === 'blindspot'

  let preferRightHandBool = true

  const updateHandOverlay = () => {
    const splitPhraseToWords = phraseKey => {
      const text = phrases?.[phraseKey]?.[RC.language.value] || ''
      return text.split(/\s+/).filter(w => w.length > 0)
    }
    if (preferRightHandBool) {
      setMeasurementOverlay({
        isPaperMode: false,
        eye: 'right',
        leftTextWords: null,
        rightTextWords: splitPhraseToWords('RC_UseRightEye'),
      })
    } else {
      setMeasurementOverlay({
        isPaperMode: false,
        eye: 'left',
        leftTextWords: splitPhraseToWords('RC_UseLeftEye'),
        rightTextWords: null,
      })
    }
  }

  // Track all space bar listeners for proper cleanup
  const activeListeners = []

  const quit = () => {
    clearMeasurementOverlay()
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

  // Ensure RC.sizeCheckJSON exists even if checkSize is never called (no equipment)
  if (!RC.sizeCheckJSON) {
    RC.sizeCheckJSON = {
      _calibrateDistanceAllowedRatioPxPerCm:
        calibrateDistanceAllowedRatioPxPerCm,
      calibrationPxPerCm: null,
      screenWidthCm: null,
      rulerUnit: RC.equipment?.value?.unit || null,
      pxPerCm: [],
      lengthMeasuredPx: [],
      lengthRequestedCm: [],
      acceptedLength: [],
      acceptedRatioLength: [],
      rejectedLength: [],
      rejectedRatioLength: [],
      historyLength: [],
    }
  }

  if (RC.equipment?.value?.has) {
    // Show dummy test page right after equipment is confirmed
    RC.pauseNudger()
    await checkSize(
      RC,
      calibrateDistanceCheckLengthCm,
      calibrateDistanceChecking,
      stepperHistory,
      calibrateDistanceAllowedRatioPxPerCm,
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
    let cameraHz = null
    let webcamMaxHz = null
    let horizontalVpx = null
    if (
      RC.gazeTracker &&
      RC.gazeTracker.webgazer &&
      RC.gazeTracker.webgazer.videoParamsToReport
    ) {
      const vp = RC.gazeTracker.webgazer.videoParamsToReport
      const res = getCameraResolutionXY(RC)
      const height = res[1]
      const width = res[0]
      const maxHeight = vp.maxHeight
      const maxWidth = vp.maxWidth
      const w = Math.max(maxHeight, maxWidth)
      const h = Math.min(maxHeight, maxWidth)
      cameraResolutionXY = `${width}x${height}`
      cameraResolutionMaxXY = `${w},${h}`
      cameraHz = vp.frameRate || null
      webcamMaxHz = vp.maxFrameRate || null
      horizontalVpx = width
    }

    // Helper function to safely round centimeter values (2 decimal places)
    const safeRoundCm = value => {
      if (value == null || isNaN(value)) return null
      return parseFloat(value).toFixed(2)
    }

    // Helper function to safely round ratio values (exactly 4 decimal places, no float noise)
    const safeRoundRatio = value => {
      if (value == null || isNaN(value)) return null
      return parseFloat(Number(value).toFixed(4))
    }

    let calibrationFVpx = null
    let calibrationFOverWidth = null
    try {
      if (stdDist.current && stdDist.current.calibrationFactor) {
        calibrationFVpx = stdDist.current.calibrationFactor / RC._CONST.IPD_CM
        calibrationFOverWidth = safeRoundRatio(calibrationFVpx / horizontalVpx)
      }
    } catch (e) {}

    RC.distanceCheckJSON = {
      // Text parameters first
      _calibrateDistanceChecking: calibrateDistanceChecking,
      _calibrateDistance: calibrateDistance,
      _calibrateDistancePupil: calibrateDistancePupil,
      _calibrateDistanceAllowedRatioFOverWidth:
        calibrateDistanceAllowedRatioFOverWidth,
      historyPreferRightHandBool: [],
      // Parameters with few values (before arrays with 8 values)
      cameraXYPx: [window.screen.width / 2, 0],
      pxPerCm: safeRoundCm(pxPerCm),
      webcamMaxXYVpx: cameraResolutionMaxXY,
      webcamMaxHz: webcamMaxHz,
      ipdCm: safeRoundCm(RC._CONST.IPD_CM),
      calibrationFOverWidth: calibrationFOverWidth, // median(calibration) as ratio
      rulerUnit: RC.equipment?.value?.unit,
      // Plot lists: accepted (grow/shrink), rejected (grow only, more recent of pair)
      acceptedFOverWidth: [],
      acceptedRatioFOverWidth: [],
      acceptedLocation: [],
      acceptedPointXYPx: [],
      rejectedFOverWidth: [],
      rejectedRatioFOverWidth: [],
      rejectedLocation: [],
      rejectedPointXYPx: [],
      historyFOverWidth: [], // Array of the fOverWidth estimate of each snapshot, regardless of whether it was rejected. In the order than the snapshots were taken.
      historyEyesToFootCm: [], // Array of the rulerBasedEyesToFootCm values of each snapshot, regardless of whether it was rejected. In the order than the snapshots were taken.
      // Per-snapshot metrics for accepted and rejected (saved for analysis)
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
      // Arrays with 8 values (one per snapshot)
      fVpx: [], // ipdVpx * rulerBasedEyesToFootCm / ipdCm
      fOverWidth: [], // fVpx / cameraWidthVpx
      ipdOverWidth: [], // ipdVpx / window.innerWidth
      ipdOverWidthXYZ: [], // ipdXYZVpx / cameraWidthVpx (always 3D)
      imageBasedEyesToFootCm: [], //calibrationFVpx * ipdCm / ipdVpx
      imageBasedEyesToPointCm: [], //sqrt(imageBasedEyesToFootCm**2 + footToPoint**2)
      rulerBasedEyesToPointCm: [], //requestedEyesToPointCm
      rulerBasedEyesToFootCm: [], //sqrt(rulerBasedEyesToPointCm**2 - footToPoint**2)
      pointXYPx: [],
      cameraResolutionXYVpx: [],
      cameraHz: [],
      requestedEyesToPointCm: [],
      footToPointCm: [],
      rightEyeFootXYPx: [],
      leftEyeFootXYPx: [],
      footXYPx: [],
    }

    // Include spot parameter only if _calibrateDistance === 'blindspot'
    if (calibrateDistance === 'blindspot') {
      RC.distanceCheckJSON._calibrateDistanceSpotXYDeg =
        calibrateDistanceSpotXYDeg
    }

    let _showingReadFirstPopupDist = false
    let checkDistMovieContainer = null

    for (let i = 0; i < calibrateDistanceCheckCm.length; i++) {
      let register = true
      const cm = calibrateDistanceCheckCm[i]
      const index = i + 1

      // Track space bar listeners for this iteration
      const iterationListeners = []

      // Stepper progress closure for SPACE gating (set inside the try block below)
      let getStepperProgress = () => null

      updateProgressBar(
        (index / calibrateDistanceCheckCm.length) * 100,
        index,
        calibrateDistanceCheckCm.length,
      )
      updateViewingDistanceDiv(
        cm,
        getLocalizedUnit(RC.equipment?.value?.unit, RC.L),
      )

      // Single phrase RC_produceDistanceLocation with placeholders [[TS]], [[SSS]], [[LLL]], [[LLLLLL]]
      const checkingOptions = calibrateDistanceChecking
      const optionsArray =
        checkingOptions && typeof checkingOptions === 'string'
          ? checkingOptions
              .toLowerCase()
              .split(',')
              .map(s => s.trim())
          : []
      const hasTiltAndSwivel = optionsArray.includes('tiltandswivel')
      const hasCamera = optionsArray.includes('camera')
      const hasCenter = optionsArray.includes('center')
      const _saveSnapshotsBool = RC._saveSnapshotsBool === true
      const lang = RC.language.value

      const basePhrase =
        phrases.RC_produceDistanceLocation?.[lang] ||
        phrases.RC_produceDistance?.[lang] ||
        ''

      const replaceTS = hasTiltAndSwivel
        ? phrases.RC_tiltAndSwivel?.[lang] || ''
        : ''
      const replaceSSS = _saveSnapshotsBool
        ? phrases.RC_snapshot?.[lang] || ''
        : phrases.RC_temporarySnapshot?.[lang] || ''
      const replaceLLL = hasCenter
        ? phrases.RC_theCenterLocationShort?.[lang] || ''
        : hasCamera
          ? phrases.RC_theCameraLocationShort?.[lang] || ''
          : phrases.RC_theCenterLocationShort?.[lang] || ''
      const replaceLLLLLL = hasCenter
        ? phrases.RC_theCenterLocationLong?.[lang] || ''
        : hasCamera
          ? phrases.RC_theCameraLocationLong?.[lang] || ''
          : phrases.RC_theCenterLocationLong?.[lang] || ''

      let instructionBodyPhrase = basePhrase
        .replace(/\[\[TS\]\]/g, replaceTS)
        .replace(/\[\[SSS\]\]/g, replaceSSS)
        .replace(/\[\[LLL\]\]/g, replaceLLL)
        .replace(/\[\[LLLLLL\]\]/g, replaceLLLLLL)

      // Step-by-step uses the same single phrase key
      const phraseKeyMapping = {
        RC_produceDistanceLocation_MD: 'RC_produceDistanceLocation',
      }
      const phraseKeyForSteps = 'RC_produceDistanceLocation_MD'

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

      const instructionElement = document.querySelector(
        '.calibration-instruction',
      )

      // Add RTL class if language is RTL
      if (RC.LD === RC._CONST.RTL && instructionElement) {
        instructionElement.classList.add('rtl')
      }

      // Constrain the title to the space left of the live video so it wraps
      // rather than being hidden behind the video (which can appear anywhere).
      // Recalculated on resize since the video can move.
      const video = document.getElementById('webgazerVideoContainer')
      const titleEl = document.getElementById(
        'check-distance-instruction-title',
      )
      const updateTitleWidth = () => {
        if (!titleEl) return
        titleEl.style.minWidth = '0'
        titleEl.style.overflowWrap = 'break-word'
        titleEl.style.maxWidth = ''
        const v = document.getElementById('webgazerVideoContainer')
        if (v) {
          const videoRect = v.getBoundingClientRect()
          const titleRect = titleEl.getBoundingClientRect()
          const gap = 20
          const availableWidth = videoRect.left - titleRect.left - gap
          if (availableWidth > 0) {
            titleEl.style.maxWidth = `${availableWidth}px`
          }
        }
      }
      updateTitleWidth()
      let titleResizeHandler = () => updateTitleWidth()
      window.addEventListener('resize', titleResizeHandler)

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
        instructionBody.style.width = '100%'
        instructionBody.style.maxWidth = '100%'
        instructionBody.style.pointerEvents = 'auto'
        instructionBody.style.paddingBottom = '0'
        instructionBody.style.overflow = 'hidden'

        const PROGRESS_BAR_H = 40

        // Top margin so content starts at videoHeight + 15px from screen top,
        // measured relative to where instructionBody sits (below the title).
        const videoEl = document.getElementById('webgazerVideoContainer')
        if (videoEl) {
          const videoH = videoEl.getBoundingClientRect().height || 0
          const bodyTop = instructionBody.getBoundingClientRect().top
          const needed = videoH + 15 - bodyTop
          instructionBody.style.marginTop =
            needed > 0 ? `${Math.ceil(needed)}px` : '0'
        }

        // Constrain max-height so nothing extends behind the progress bar
        void instructionBody.offsetHeight
        const bodyTopAfterMargin = instructionBody.getBoundingClientRect().top
        const maxH = window.innerHeight - PROGRESS_BAR_H - bodyTopAfterMargin
        if (maxH > 0) {
          instructionBody.style.maxHeight = `${Math.floor(maxH)}px`
        }

        const instrParent = instructionBody.closest('.calibration-instruction')
        if (instrParent) instrParent.style.overflow = 'hidden'

        const scalableWrapper = document.createElement('div')
        scalableWrapper.id = 'check-dist-scalable-wrapper'
        scalableWrapper.style.width = '100%'
        scalableWrapper.style.transformOrigin = 'top left'
        instructionBody.appendChild(scalableWrapper)

        const ui = createStepInstructionsUI(scalableWrapper, {
          layout: 'leftOnly',
          leftWidth: '100%',
          leftPaddingStart: '0rem',
          leftPaddingEnd: '1rem',
          fontSize: 'clamp(1.1em, 2.5vw, 1.4em)',
          lineHeight: '1.4',
        })

        if (!checkDistMovieContainer) {
          checkDistMovieContainer = document.createElement('div')
          checkDistMovieContainer.id = 'check-dist-movie-container'
          checkDistMovieContainer.style.position = 'fixed'
          checkDistMovieContainer.style.bottom = '44px'
          checkDistMovieContainer.style.width = '50vw'
          checkDistMovieContainer.style.maxWidth = '50vw'
          checkDistMovieContainer.style.maxHeight = 'calc(45vh - 44px)'
          checkDistMovieContainer.style.padding = '0.5rem'
          checkDistMovieContainer.style.boxSizing = 'border-box'
          checkDistMovieContainer.style.zIndex = '999999996'
          checkDistMovieContainer.style.pointerEvents = 'none'
          checkDistMovieContainer.style.overflow = 'hidden'
          if (RC.LD === RC._CONST.RTL) {
            checkDistMovieContainer.style.left = '0'
            checkDistMovieContainer.style.right = 'auto'
          } else {
            checkDistMovieContainer.style.right = '0'
            checkDistMovieContainer.style.left = 'auto'
          }
          document.body.appendChild(checkDistMovieContainer)
        }

        // For checkDistance.js: use RC_produceDistanceLocation and apply [[TS]], [[SSS]], [[LLL]], [[LLLLLL]]
        const actualPhraseKey =
          phraseKeyMapping[phraseKeyForSteps] ||
          phraseKeyForSteps.replace('_MD', '')
        let rawStepText = phrases[actualPhraseKey]?.[RC.language.value] || ''
        rawStepText = rawStepText
          .replace(/\[\[TS\]\]/g, replaceTS)
          .replace(/\[\[SSS\]\]/g, replaceSSS)
          .replace(/\[\[LLL\]\]/g, replaceLLL)
          .replace(/\[\[LLLLLL\]\]/g, replaceLLLLLL)

        // Debug logging
        console.log('🔍 checkDistance phrase debug:', {
          phraseKeyRequested: phraseKeyForSteps,
          actualPhraseKey: actualPhraseKey,
          language: RC.language.value,
          phraseExists: !!phrases[actualPhraseKey],
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
            }
            // Always re-render to provide visual feedback (even if only one step)
            doRender()
          }

          const handleNext = () => {
            if (stepIndex < maxIdx) {
              stepIndex++
              if (stepIndex >= maxIdx) {
                RC._readInstructionPhraseKeys.add(actualPhraseKey)
              }
            }
            doRender()
          }

          // On small screens, after the stepper is fitted, harmonize the
          // nav-hint italic text and hand-preference font sizes to 0.7× the
          // stepper font so there are only TWO font sizes: the stepper (focal
          // point) and subdued surrounding text.
          const harmonizeCheckDistFonts = () => {
            const stepperBox = scalableWrapper.querySelector('.rc-stepper-box')
            const navHintEl = scalableWrapper.querySelector(
              '.rc-stepper-nav-hint',
            )
            const handSelector = scalableWrapper.querySelector(
              '.rc-hand-preference-selector',
            )
            const stepperFontPx = parseFloat(stepperBox?.style.fontSize) || 18

            if (stepperFontPx >= 17.5) return

            const RATIO = 0.7
            const MIN_FONT = 8
            let surroundingFontPx = Math.max(MIN_FONT, stepperFontPx * RATIO)

            if (navHintEl && navHintEl.style.display !== 'none') {
              const applyNavFont = fontPx => {
                const px = `${fontPx}px`
                navHintEl.style.fontSize = px
                navHintEl.querySelectorAll(':scope > div').forEach(child => {
                  child.style.fontSize = px
                  child.style.lineHeight = '1.3'
                  child.querySelectorAll('*').forEach(desc => {
                    desc.style.fontSize = 'inherit'
                    desc.style.lineHeight = 'inherit'
                  })
                })
              }

              applyNavFont(surroundingFontPx)
              void navHintEl.offsetHeight

              const availableWidth = navHintEl.clientWidth
              if (availableWidth > 0) {
                let shrinkRatio = 1
                navHintEl.querySelectorAll(':scope > div').forEach(child => {
                  const savedWS = child.style.whiteSpace
                  const savedMW = child.style.maxWidth
                  child.style.whiteSpace = 'nowrap'
                  child.style.maxWidth = 'none'
                  void child.offsetWidth
                  const neededWidth = child.scrollWidth
                  child.style.whiteSpace = savedWS
                  child.style.maxWidth = savedMW || ''
                  if (neededWidth > availableWidth) {
                    shrinkRatio = Math.min(
                      shrinkRatio,
                      availableWidth / neededWidth,
                    )
                  }
                })
                if (shrinkRatio < 1) {
                  surroundingFontPx = Math.max(
                    MIN_FONT,
                    surroundingFontPx * shrinkRatio,
                  )
                  applyNavFont(surroundingFontPx)
                }
              }
            }

            if (handSelector) {
              const px = `${surroundingFontPx}px`
              const savedPIS = handSelector.style.paddingInlineStart || '0'
              const titleDiv = handSelector.querySelector('div')
              const labels = handSelector.querySelectorAll('label')
              const radios = handSelector.querySelectorAll(
                'input[type="radio"]',
              )

              handSelector.style.paddingTop = `${surroundingFontPx * 0.4}px`
              handSelector.style.paddingBottom = `${surroundingFontPx * 0.15}px`
              handSelector.style.paddingInlineStart = savedPIS
              handSelector.style.gap = `${surroundingFontPx * 0.15}px`

              if (titleDiv) {
                titleDiv.style.fontSize = px
                titleDiv.style.marginBottom = `${surroundingFontPx * 0.15}px`
                titleDiv.querySelectorAll('*').forEach(el => {
                  el.style.fontSize = 'inherit'
                  el.style.lineHeight = 'inherit'
                })
              }

              labels.forEach(l => {
                l.style.fontSize = px
                l.style.lineHeight = '1.2'
              })

              const radioSz = Math.max(10, surroundingFontPx * 0.85)
              radios.forEach(r => {
                r.style.width = `${radioSz}px`
                r.style.height = `${radioSz}px`
              })
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
                readFirstPhraseKey: actualPhraseKey,
                readPhraseKeys: RC._readInstructionPhraseKeys,
                onPrev: handlePrev,
                onNext: handleNext,
                bottomOffset: 40, // Account for progress bar height
              },
              lang: RC.language.value,
              langDirection: RC.LD,
              phrases: phrases,
            })

            if (checkDistMovieContainer) {
              checkDistMovieContainer.innerHTML = ''
              while (ui.mediaContainer.firstChild) {
                checkDistMovieContainer.appendChild(
                  ui.mediaContainer.firstChild,
                )
              }
              const movedMedia =
                checkDistMovieContainer.querySelector('video, img')
              if (movedMedia) {
                movedMedia.style.maxHeight = '100%'
              }
              const distContainer = document.getElementById(
                'calibration-trackDistance-check-viewingDistance-container',
              )
              if (distContainer) {
                const hasMovie = checkDistMovieContainer.children.length > 0
                if (hasMovie) {
                  distContainer.style.height = '55%'
                } else {
                  distContainer.style.height = '100%'
                }
                const vdDiv = document.getElementById('viewing-distance-p')
                const uDiv = document.getElementById(
                  'calibration-trackDistance-check-viewingDistance-units',
                )
                if (vdDiv && uDiv) {
                  adjustFontSize(vdDiv, uDiv)
                }
              }
            }

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

            fitContentToAvailableSpace({
              wrapper: scalableWrapper,
              navHintEl: scalableWrapper.querySelector('.rc-stepper-nav-hint'),
              stepperBox: scalableWrapper.querySelector('.rc-stepper-box'),
              handSelector: scalableWrapper.querySelector(
                '.rc-hand-preference-selector',
              ),
              barHeight: 40,
              fillTarget: 0.95,
              fitStepper: fitStepperBoxToHeight,
            })
            harmonizeCheckDistFonts()
            requestAnimationFrame(() => setTimeout(harmonizeCheckDistFonts, 80))
          }
          doRender()

          // Expose stepper progress for SPACE gating in the keyup handler
          getStepperProgress = () => ({
            current: stepIndex,
            max: (stepModel.flatSteps?.length || 1) - 1,
          })

          const navHandler = e => {
            if (e.key === 'ArrowDown') {
              const maxIdx = (stepModel.flatSteps?.length || 1) - 1
              if (stepIndex < maxIdx) {
                stepIndex++
                if (stepIndex >= maxIdx) {
                  RC._readInstructionPhraseKeys.add(actualPhraseKey)
                }
              }
              doRender()
              e.preventDefault()
              e.stopPropagation()
            } else if (e.key === 'ArrowUp') {
              if (stepIndex > 0) {
                stepIndex--
              }
              doRender()
              e.preventDefault()
              e.stopPropagation()
            }
          }
          navHandlerRef = navHandler
          document.addEventListener('keydown', navHandlerRef)

          // Hand-preference selector below stepper
          const existingHandSel = scalableWrapper.querySelector(
            '.rc-hand-preference-selector',
          )
          if (existingHandSel) existingHandSel.remove()
          const handSel = createHandPreferenceSelector({
            phrases,
            lang: RC.language.value,
            preferRight: preferRightHandBool,
            onChange: isRight => {
              preferRightHandBool = isRight
              updateHandOverlay()
            },
            objectPhraseKey: 'RC_measuringStickOrTape',
            compact: false,
          })
          updateHandOverlay()
          scalableWrapper.appendChild(handSel)

          fitContentToAvailableSpace({
            wrapper: scalableWrapper,
            navHintEl: scalableWrapper.querySelector('.rc-stepper-nav-hint'),
            stepperBox: scalableWrapper.querySelector('.rc-stepper-box'),
            handSelector: handSel,
            barHeight: 40,
            fillTarget: 0.95,
            fitStepper: fitStepperBoxToHeight,
          })
          harmonizeCheckDistFonts()
          requestAnimationFrame(() => setTimeout(harmonizeCheckDistFonts, 80))
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
              // Gate SPACE: require stepper to be on the last step (unless already read)
              const alreadyReadDist = RC._readInstructionPhraseKeys.has(
                'RC_produceDistanceLocation',
              )
              if (!alreadyReadDist) {
                const progress = getStepperProgress()
                if (progress && progress.current < progress.max) {
                  if (!_showingReadFirstPopupDist) {
                    _showingReadFirstPopupDist = true
                    ;(async () => {
                      await showPopup(
                        RC,
                        '',
                        phrases.EE_SpaceBarDisabledUntilInstructionsFullyRead?.[
                          RC.language.value
                        ] || '',
                      )
                      _showingReadFirstPopupDist = false
                    })()
                  }
                  return
                }
              }
              RC._readInstructionPhraseKeys.add('RC_produceDistanceLocation')

              // Enforce fullscreen - if not in fullscreen, force it, wait 4 seconds, and ignore this key press
              const canProceed = await enforceFullscreenOnSpacePress(RC.L, RC)
              if (!canProceed) {
                // Key press flushed - not in fullscreen, now in fullscreen after 4 second wait
                // Wait for a new key press (do nothing, just return)
                return
              }

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
              //Todo: first place the capture occurs
              console.log(
                'checkDistance.js keyupListener() saveSnapshots option:',
                saveSnapshots ?? false,
              )

              // Validate face mesh data with retry mechanism
              const faceValidation = await validateFaceMeshSamples(
                RC,
                calibrateDistancePupil,
                calibrateDistanceChecking,
                RC.calibrateDistanceIpdUsesZBool !== false,
              )

              if (!faceValidation.isValid) {
                console.log(
                  '=== FACE MESH VALIDATION FAILED - SHOWING RETRY POPUP ===',
                )

                // Show face blocked popup
                await showFaceBlockedPopup(
                  RC,
                  lastCapturedFaceImage,
                  saveSnapshots,
                )

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
              RC.distanceCheckJSON.cameraHz.push(
                RC.gazeTracker?.webgazer?.videoParamsToReport?.frameRate ||
                  null,
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
                const cameraResolutionXYVpx = getCameraResolutionXY(RC)
                const horizontalVpx = cameraResolutionXYVpx[0]
                const ipdOverWidth = faceValidation.ipdPixels / horizontalVpx
                const imageBasedEyesToFootCm =
                  (calibrationFOverWidth * RC._CONST.IPD_CM) / ipdOverWidth
                RC.distanceCheckJSON.imageBasedEyesToFootCm.push(
                  safeRoundCm(imageBasedEyesToFootCm),
                )
                const imageBasedEyesToPointCm = Math.sqrt(
                  imageBasedEyesToFootCm ** 2 +
                    faceValidation.footToPointCm ** 2,
                )

                RC.distanceCheckJSON.imageBasedEyesToPointCm.push(
                  safeRoundCm(imageBasedEyesToPointCm),
                )
              } catch (e) {
                RC.distanceCheckJSON.imageBasedEyesToFootCm.push(null)
                RC.distanceCheckJSON.imageBasedEyesToPointCm.push(null)
              }
              RC.distanceCheckJSON.rulerBasedEyesToFootCm.push(
                safeRoundCm(rulerBasedEyesToFootCm),
              )
              RC.distanceCheckJSON.rulerBasedEyesToPointCm.push(
                safeRoundCm(requestedEyesToPointCm),
              )
              RC.distanceCheckJSON.requestedEyesToPointCm.push(
                safeRoundCm(requestedEyesToPointCm),
              )
              const currentFVpx =
                Math.round(
                  ((faceValidation.ipdPixels * rulerBasedEyesToFootCm) /
                    RC._CONST.IPD_CM) *
                    10,
                ) / 10
              RC.distanceCheckJSON.fVpx.push(currentFVpx)
              // Calculate and store fOverWidth = fVpx / cameraWidth
              const currentFOverWidth = currentFVpx / cameraResolutionXYVpx[0]
              RC.distanceCheckJSON.fOverWidth.push(
                safeRoundRatio(currentFOverWidth),
              )
              // History lists: record every snapshot regardless of acceptance
              RC.distanceCheckJSON.historyFOverWidth.push(
                safeRoundRatio(currentFOverWidth),
              )
              RC.distanceCheckJSON.historyEyesToFootCm.push(
                safeRoundCm(rulerBasedEyesToFootCm),
              )
              RC.distanceCheckJSON.historyPreferRightHandBool.push(
                preferRightHandBool,
              )
              RC.distanceCheckJSON.pointXYPx.push([
                faceValidation.pointXYPx[0],
                faceValidation.pointXYPx[1],
              ])
              RC.distanceCheckJSON.footToPointCm.push(
                safeRoundCm(faceValidation.footToPointCm),
              )
              RC.distanceCheckJSON.ipdOverWidth.push(
                safeRoundRatio(
                  faceValidation.ipdPixels / cameraResolutionXYVpx[0],
                ),
              )
              RC.distanceCheckJSON.ipdOverWidthXYZ.push(
                safeRoundRatio(
                  faceValidation.ipdXYZPixels / cameraResolutionXYVpx[0],
                ),
              )
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
              // Plot lists: accepted (ratio is NaN for first)
              const prevAccepted =
                RC.distanceCheckJSON.acceptedFOverWidth.length > 0
                  ? RC.distanceCheckJSON.acceptedFOverWidth[
                      RC.distanceCheckJSON.acceptedFOverWidth.length - 1
                    ]
                  : null
              RC.distanceCheckJSON.acceptedFOverWidth.push(
                safeRoundRatio(currentFOverWidth),
              )
              RC.distanceCheckJSON.acceptedRatioFOverWidth.push(
                prevAccepted === null
                  ? NaN
                  : (safeRoundRatio(currentFOverWidth / prevAccepted) ?? NaN),
              )
              RC.distanceCheckJSON.acceptedLocation.push(
                calibrateDistanceChecking,
              )
              RC.distanceCheckJSON.acceptedPointXYPx.push([
                faceValidation.pointXYPx[0],
                faceValidation.pointXYPx[1],
              ])
              RC.distanceCheckJSON.acceptedLeftEyeFootXYPx.push([
                faceValidation.nearestXYPx_left[0],
                faceValidation.nearestXYPx_left[1],
              ])
              RC.distanceCheckJSON.acceptedRightEyeFootXYPx.push([
                faceValidation.nearestXYPx_right[0],
                faceValidation.nearestXYPx_right[1],
              ])
              RC.distanceCheckJSON.acceptedIpdOverWidth.push(
                safeRoundRatio(
                  faceValidation.ipdPixels / cameraResolutionXYVpx[0],
                ),
              )
              RC.distanceCheckJSON.acceptedRulerBasedEyesToFootCm.push(
                safeRoundCm(rulerBasedEyesToFootCm),
              )
              RC.distanceCheckJSON.acceptedRulerBasedEyesToPointCm.push(
                safeRoundCm(requestedEyesToPointCm),
              )
              RC.distanceCheckJSON.acceptedImageBasedEyesToFootCm.push(
                RC.distanceCheckJSON.imageBasedEyesToFootCm.length > 0
                  ? RC.distanceCheckJSON.imageBasedEyesToFootCm[
                      RC.distanceCheckJSON.imageBasedEyesToFootCm.length - 1
                    ]
                  : null,
              )
              RC.distanceCheckJSON.acceptedImageBasedEyesToPointCm.push(
                RC.distanceCheckJSON.imageBasedEyesToPointCm.length > 0
                  ? RC.distanceCheckJSON.imageBasedEyesToPointCm[
                      RC.distanceCheckJSON.imageBasedEyesToPointCm.length - 1
                    ]
                  : null,
              )
              RC.distanceCheckJSON.acceptedPreferRightHandBool.push(
                preferRightHandBool,
              )

              // Clean up the captured image for privacy
              lastCapturedFaceImage = null

              document.removeEventListener('keydown', keyupListener)
              removeKeypadHandler()
              if (navHandlerRef) {
                document.removeEventListener('keydown', navHandlerRef)
                navHandlerRef = null
              }
              if (titleResizeHandler) {
                window.removeEventListener('resize', titleResizeHandler)
                titleResizeHandler = null
              }
              resolve()
            }
            //check for the x key to skip (only allowed if requested distance > 60 cm)
            else if (
              event.key === 'x' &&
              register &&
              cm >
                (RC.equipment?.value?.unit === 'inches'
                  ? Math.round(60 / 2.54)
                  : 60)
            ) {
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
              if (titleResizeHandler) {
                window.removeEventListener('resize', titleResizeHandler)
                titleResizeHandler = null
              }
              resolve()
            }
          }
          const removeKeypadHandler = setUpEasyEyesKeypadHandler(
            null,
            RC.keypadHandler,
            async value => {
              if (value === 'space') {
                // Gate SPACE: require stepper to be on the last step (unless already read)
                const alreadyReadDist = RC._readInstructionPhraseKeys.has(
                  'RC_produceDistanceLocation',
                )
                if (!alreadyReadDist) {
                  const progress = getStepperProgress()
                  if (progress && progress.current < progress.max) {
                    if (!_showingReadFirstPopupDist) {
                      _showingReadFirstPopupDist = true
                      ;(async () => {
                        await showPopup(
                          RC,
                          '',
                          phrases
                            .EE_SpaceBarDisabledUntilInstructionsFullyRead?.[
                            RC.language.value
                          ] || '',
                        )
                        _showingReadFirstPopupDist = false
                      })()
                    }
                    return
                  }
                }
                RC._readInstructionPhraseKeys.add('RC_produceDistanceLocation')

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
                console.log(
                  'distance.js onSpaceSnap() saveSnapshots option:',
                  saveSnapshots ?? false,
                )

                // Validate face mesh data with retry mechanism
                const faceValidation = await validateFaceMeshSamples(
                  RC,
                  calibrateDistancePupil,
                  'camera',
                  RC.calibrateDistanceIpdUsesZBool !== false,
                )

                if (!faceValidation.isValid) {
                  console.log(
                    '=== KEYPAD: FACE MESH VALIDATION FAILED - SHOWING RETRY POPUP ===',
                  )

                  // Show face blocked popup
                  await showFaceBlockedPopup(
                    RC,
                    lastCapturedFaceImage,
                    saveSnapshots,
                  )

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
                RC.distanceCheckJSON.cameraHz.push(
                  RC.gazeTracker?.webgazer?.videoParamsToReport?.frameRate ||
                    null,
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
                  const cameraResolutionXYVpx = getCameraResolutionXY(RC)
                  const horizontalVpx = cameraResolutionXYVpx[0]
                  const ipdOverWidth = faceValidation.ipdPixels / horizontalVpx
                  const imageBasedEyesToFootCm =
                    (calibrationFOverWidth * RC._CONST.IPD_CM) / ipdOverWidth
                  RC.distanceCheckJSON.imageBasedEyesToFootCm.push(
                    safeRoundCm(imageBasedEyesToFootCm),
                  )
                  const imageBasedEyesToPointCm = Math.sqrt(
                    imageBasedEyesToFootCm ** 2 +
                      faceValidation.footToPointCm ** 2,
                  )

                  RC.distanceCheckJSON.imageBasedEyesToPointCm.push(
                    safeRoundCm(imageBasedEyesToPointCm),
                  )
                } catch (e) {
                  RC.distanceCheckJSON.imageBasedEyesToFootCm.push(null)
                  RC.distanceCheckJSON.imageBasedEyesToPointCm.push(null)
                }
                const requestedEyesToPointCm =
                  RC.equipment?.value?.unit === 'inches' ? cm * 2.54 : cm
                const rulerBasedEyesToFootCm = Math.sqrt(
                  requestedEyesToPointCm ** 2 -
                    faceValidation.footToPointCm ** 2,
                )
                RC.distanceCheckJSON.rulerBasedEyesToPointCm.push(
                  safeRoundCm(requestedEyesToPointCm),
                )
                RC.distanceCheckJSON.rulerBasedEyesToFootCm.push(
                  safeRoundCm(rulerBasedEyesToFootCm),
                )
                RC.distanceCheckJSON.requestedEyesToPointCm.push(
                  safeRoundCm(requestedEyesToPointCm),
                )
                const currentFVpxKeypad =
                  Math.round(
                    ((faceValidation.ipdPixels * rulerBasedEyesToFootCm) /
                      RC._CONST.IPD_CM) *
                      10,
                  ) / 10
                RC.distanceCheckJSON.fVpx.push(currentFVpxKeypad)
                // Calculate and store fOverWidth = fVpx / cameraWidth
                const currentFOverWidthKeypad =
                  currentFVpxKeypad / cameraResolutionXYVpx[0]
                RC.distanceCheckJSON.fOverWidth.push(
                  safeRoundRatio(currentFOverWidthKeypad),
                )
                // History lists: record every snapshot regardless of acceptance
                RC.distanceCheckJSON.historyFOverWidth.push(
                  safeRoundRatio(currentFOverWidthKeypad),
                )
                RC.distanceCheckJSON.historyEyesToFootCm.push(
                  safeRoundCm(rulerBasedEyesToFootCm),
                )
                RC.distanceCheckJSON.historyPreferRightHandBool.push(
                  preferRightHandBool,
                )
                RC.distanceCheckJSON.footToPointCm.push(
                  safeRoundCm(faceValidation.footToPointCm),
                )
                RC.distanceCheckJSON.ipdOverWidth.push(
                  safeRoundRatio(
                    faceValidation.ipdPixels / cameraResolutionXYVpx[0],
                  ),
                )
                RC.distanceCheckJSON.ipdOverWidthXYZ.push(
                  safeRoundRatio(
                    faceValidation.ipdXYZPixels / cameraResolutionXYVpx[0],
                  ),
                )
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
                // Plot lists: accepted (ratio is NaN for first)
                const prevAcceptedKeypad =
                  RC.distanceCheckJSON.acceptedFOverWidth.length > 0
                    ? RC.distanceCheckJSON.acceptedFOverWidth[
                        RC.distanceCheckJSON.acceptedFOverWidth.length - 1
                      ]
                    : null
                RC.distanceCheckJSON.acceptedFOverWidth.push(
                  safeRoundRatio(currentFOverWidthKeypad),
                )
                RC.distanceCheckJSON.acceptedRatioFOverWidth.push(
                  prevAcceptedKeypad === null
                    ? NaN
                    : (safeRoundRatio(
                        currentFOverWidthKeypad / prevAcceptedKeypad,
                      ) ?? NaN),
                )
                RC.distanceCheckJSON.acceptedLocation.push(
                  calibrateDistanceChecking,
                )
                RC.distanceCheckJSON.acceptedPointXYPx.push([
                  faceValidation.pointXYPx[0],
                  faceValidation.pointXYPx[1],
                ])
                RC.distanceCheckJSON.acceptedLeftEyeFootXYPx.push([
                  faceValidation.nearestXYPx_left[0],
                  faceValidation.nearestXYPx_left[1],
                ])
                RC.distanceCheckJSON.acceptedRightEyeFootXYPx.push([
                  faceValidation.nearestXYPx_right[0],
                  faceValidation.nearestXYPx_right[1],
                ])
                RC.distanceCheckJSON.acceptedIpdOverWidth.push(
                  safeRoundRatio(
                    faceValidation.ipdPixels / cameraResolutionXYVpx[0],
                  ),
                )
                RC.distanceCheckJSON.acceptedRulerBasedEyesToFootCm.push(
                  safeRoundCm(rulerBasedEyesToFootCm),
                )
                RC.distanceCheckJSON.acceptedRulerBasedEyesToPointCm.push(
                  safeRoundCm(requestedEyesToPointCm),
                )
                RC.distanceCheckJSON.acceptedImageBasedEyesToFootCm.push(
                  RC.distanceCheckJSON.imageBasedEyesToFootCm.length > 0
                    ? RC.distanceCheckJSON.imageBasedEyesToFootCm[
                        RC.distanceCheckJSON.imageBasedEyesToFootCm.length - 1
                      ]
                    : null,
                )
                RC.distanceCheckJSON.acceptedImageBasedEyesToPointCm.push(
                  RC.distanceCheckJSON.imageBasedEyesToPointCm.length > 0
                    ? RC.distanceCheckJSON.imageBasedEyesToPointCm[
                        RC.distanceCheckJSON.imageBasedEyesToPointCm.length - 1
                      ]
                    : null,
                )
                RC.distanceCheckJSON.acceptedPreferRightHandBool.push(
                  preferRightHandBool,
                )

                // Clean up the captured image for privacy
                lastCapturedFaceImage = null

                removeKeypadHandler()
                cleanupFontAdjustment() // Clean up font adjustment listeners
                document.removeEventListener('keyup', keyupListener)
                resolve()
              }
              //check for the x key to skip (only allowed if requested distance > 60 cm)
              else if (
                value === '❌' &&
                cm >
                  (RC.equipment?.value?.unit === 'inches'
                    ? Math.round(60 / 2.54)
                    : 60)
              ) {
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

      // COMPLIANCE CHECK: Starting from the second fOverWidth estimate,
      // compare newFOverWidth with oldFOverWidth using log ratio
      // Only run if the last 2 snapshots are both accepted (not yet rejected)
      const fArr = RC.distanceCheckJSON.fOverWidth
      const aArr = RC.distanceCheckJSON.acceptedFOverWidth
      const lastTwoAccepted =
        fArr.length >= 2 &&
        aArr.length >= 2 &&
        fArr[fArr.length - 1] === aArr[aArr.length - 1] &&
        fArr[fArr.length - 2] === aArr[aArr.length - 2]

      if (lastTwoAccepted) {
        const newFOverWidth =
          RC.distanceCheckJSON.fOverWidth[
            RC.distanceCheckJSON.fOverWidth.length - 1
          ]
        const oldFOverWidth =
          RC.distanceCheckJSON.fOverWidth[
            RC.distanceCheckJSON.fOverWidth.length - 2
          ]

        const T_fow = calibrateDistanceAllowedRatioFOverWidth
        const fowRatio = newFOverWidth / oldFOverWidth
        const fowRoundedPct = Math.round(100 * fowRatio)
        const fowLower = Math.round(100 / T_fow)
        const fowUpper = Math.round(100 * T_fow)
        const fowAccepted =
          fowRoundedPct >= fowLower && fowRoundedPct <= fowUpper

        console.log('[fOverWidth Check] Old fOverWidth:', oldFOverWidth)
        console.log('[fOverWidth Check] New fOverWidth:', newFOverWidth)
        console.log(
          `[fOverWidth Check] Rounded ratio: ${fowRoundedPct}%, interval: [${fowLower}%, ${fowUpper}%]`,
        )

        if (!fowAccepted) {
          console.warn(
            `[fOverWidth Check] MISMATCH: Ratio is ${fowRoundedPct}% (oldFOverWidth=${oldFOverWidth}, newFOverWidth=${newFOverWidth}). Rejecting BOTH measurements.`,
          )

          // Remove the last TWO measurements from all arrays
          RC.calibrateDistanceMeasuredCm.pop()
          RC.calibrateDistanceMeasuredCm.pop()
          RC.calibrateDistanceRequestedCm.pop()
          RC.calibrateDistanceRequestedCm.pop()
          RC.calibrateDistanceIPDPixels.pop()
          RC.calibrateDistanceIPDPixels.pop()
          RC.calibrateDistanceRequestedDistances.pop()
          RC.calibrateDistanceRequestedDistances.pop()
          // EyeFeetXYPx has 2 entries per measurement (left and right)
          RC.calibrateDistanceEyeFeetXYPx.pop()
          RC.calibrateDistanceEyeFeetXYPx.pop()
          RC.calibrateDistanceEyeFeetXYPx.pop()
          RC.calibrateDistanceEyeFeetXYPx.pop()

          // Rejected plot lists: capture before popping (only the more recent of the two fOverWidth values)
          const fOverWidthArray = RC.distanceCheckJSON.fOverWidth
          const moreRecentFOverWidth =
            fOverWidthArray[fOverWidthArray.length - 1]
          RC.distanceCheckJSON.rejectedFOverWidth.push(
            safeRoundRatio(moreRecentFOverWidth),
          )
          RC.distanceCheckJSON.rejectedRatioFOverWidth.push(
            safeRoundRatio(
              fOverWidthArray[fOverWidthArray.length - 1] /
                fOverWidthArray[fOverWidthArray.length - 2],
            ),
          )
          RC.distanceCheckJSON.rejectedLocation.push(calibrateDistanceChecking)
          RC.distanceCheckJSON.rejectedPointXYPx.push([
            ...RC.distanceCheckJSON.pointXYPx[
              RC.distanceCheckJSON.pointXYPx.length - 1
            ],
          ])
          // Rejected per-snapshot metrics: push both rejected snapshots (more recent first, then previous)
          for (let ri = 1; ri >= 0; ri--) {
            const idx = RC.distanceCheckJSON.leftEyeFootXYPx.length - 1 - ri
            RC.distanceCheckJSON.rejectedLeftEyeFootXYPx.push(
              RC.distanceCheckJSON.leftEyeFootXYPx[idx]
                ? [...RC.distanceCheckJSON.leftEyeFootXYPx[idx]]
                : null,
            )
            RC.distanceCheckJSON.rejectedRightEyeFootXYPx.push(
              RC.distanceCheckJSON.rightEyeFootXYPx[idx]
                ? [...RC.distanceCheckJSON.rightEyeFootXYPx[idx]]
                : null,
            )
            RC.distanceCheckJSON.rejectedIpdOverWidth.push(
              RC.distanceCheckJSON.ipdOverWidth[idx] ?? null,
            )
            RC.distanceCheckJSON.rejectedRulerBasedEyesToFootCm.push(
              RC.distanceCheckJSON.rulerBasedEyesToFootCm[idx] ?? null,
            )
            RC.distanceCheckJSON.rejectedRulerBasedEyesToPointCm.push(
              RC.distanceCheckJSON.rulerBasedEyesToPointCm[idx] ?? null,
            )
            RC.distanceCheckJSON.rejectedImageBasedEyesToFootCm.push(
              RC.distanceCheckJSON.imageBasedEyesToFootCm[idx] ?? null,
            )
            RC.distanceCheckJSON.rejectedImageBasedEyesToPointCm.push(
              RC.distanceCheckJSON.imageBasedEyesToPointCm[idx] ?? null,
            )
            RC.distanceCheckJSON.rejectedPreferRightHandBool.push(
              RC.distanceCheckJSON.historyPreferRightHandBool[idx] ?? null,
            )
          }

          // Remove the last TWO from distanceCheckJSON per-snapshot arrays so the
          // next measurement is compared to the last accepted (same as calibration).
          for (let popCount = 0; popCount < 2; popCount++) {
            RC.distanceCheckJSON.fOverWidth.pop()
            RC.distanceCheckJSON.fVpx.pop()
            RC.distanceCheckJSON.ipdOverWidth.pop()
            RC.distanceCheckJSON.ipdOverWidthXYZ.pop()
            RC.distanceCheckJSON.imageBasedEyesToFootCm.pop()
            RC.distanceCheckJSON.imageBasedEyesToPointCm.pop()
            RC.distanceCheckJSON.rulerBasedEyesToPointCm.pop()
            RC.distanceCheckJSON.rulerBasedEyesToFootCm.pop()
            RC.distanceCheckJSON.pointXYPx.pop()
            RC.distanceCheckJSON.cameraResolutionXYVpx.pop()
            RC.distanceCheckJSON.requestedEyesToPointCm.pop()
            RC.distanceCheckJSON.footToPointCm.pop()
            RC.distanceCheckJSON.rightEyeFootXYPx.pop()
            RC.distanceCheckJSON.leftEyeFootXYPx.pop()
            RC.distanceCheckJSON.footXYPx.pop()
          }
          // Shrink accepted lists: remove the two rejected entries
          for (let popCount = 0; popCount < 2; popCount++) {
            RC.distanceCheckJSON.acceptedFOverWidth.pop()
            RC.distanceCheckJSON.acceptedRatioFOverWidth.pop()
            RC.distanceCheckJSON.acceptedLocation.pop()
            RC.distanceCheckJSON.acceptedPointXYPx.pop()
            RC.distanceCheckJSON.acceptedLeftEyeFootXYPx.pop()
            RC.distanceCheckJSON.acceptedRightEyeFootXYPx.pop()
            RC.distanceCheckJSON.acceptedIpdOverWidth.pop()
            RC.distanceCheckJSON.acceptedRulerBasedEyesToFootCm.pop()
            RC.distanceCheckJSON.acceptedRulerBasedEyesToPointCm.pop()
            RC.distanceCheckJSON.acceptedImageBasedEyesToFootCm.pop()
            RC.distanceCheckJSON.acceptedImageBasedEyesToPointCm.pop()
            RC.distanceCheckJSON.acceptedPreferRightHandBool.pop()
          }

          const errorMessage =
            phrases.RC_focalLengthMismatch?.[RC.language.value]
              ?.replace('[[N1]]', fowRoundedPct.toString())
              .replace('[[TT1]]', fowLower.toString())
              .replace('[[TT2]]', fowUpper.toString()) ||
            `The last two snapshots are inconsistent. Your new distance is ${fowRoundedPct}% of that expected from your previous snapshot. Try again. Click OK or press RETURN.`

          // Show popup error message and wait for OK
          await Swal.fire({
            ...swalInfoOptions(RC, { showIcon: false }),
            icon: '',
            title: '',
            html: processInlineFormatting(errorMessage),
            allowEnterKey: true,
            focusConfirm: true,
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

          // Go back 2 iterations to remeasure both rejected distances
          // Set i to i - 2 so the next iteration starts at i - 1
          i = i - 2

          const acceptedCount = RC.distanceCheckJSON.acceptedFOverWidth.length
          console.log(
            `[fOverWidth Check] After rejection: ${acceptedCount} accepted, continuing from index ${i + 1}`,
          )
        }
      }
    }

    if (checkDistMovieContainer && checkDistMovieContainer.parentNode) {
      checkDistMovieContainer.parentNode.removeChild(checkDistMovieContainer)
      checkDistMovieContainer = null
    }

    removeProgressBar(RC, calibrateDistanceChecking)
    removeViewingDistanceDiv()

    RC.distanceCheckJSON.snapshotsTaken =
      RC.distanceCheckJSON.historyFOverWidth.length
    RC.distanceCheckJSON.snapshotsRejected =
      RC.distanceCheckJSON.rejectedFOverWidth.length

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
        processInlineFormatting(
          phrases.RC_AllDistancesRecorded[RC.language.value].replace(
            '[[N11]]',
            RC.calibrateDistanceRequestedCm.length,
          ),
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

  if (RC._showPutGlassesBackOn) {
    RC._showPutGlassesBackOn = false
    await showPutGlassesBackOnScreen(RC)
  }

  quit()
}
