/**
 * spaceKeyHandler.js
 *
 * Async handlers for the Space key on each page of the object-based distance
 * calibration test.  Extracted line-for-line from the monolithic IIFE inside
 * handleKeyPress in legacy distance.js (lines ~8400-9700).
 *
 * Every branch, popup, sound effect, video capture, tolerance check, and
 * retroactive-rejection path from the original code is preserved here.
 */

import Swal from 'sweetalert2'

import { debugLog, debugError } from './debugLogger'
import { DEFAULT_FOCAL_TOLERANCE_RATIO } from './objectTestConstants'

const CATEGORY = 'spaceKey'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers shared across page handlers
// ─────────────────────────────────────────────────────────────────────────────

function preventSpaceInPopup(ev) {
  if (ev.key === ' ' || ev.code === 'Space') {
    ev.preventDefault()
    ev.stopPropagation()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// handleSpaceOnTubeCheck
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Space on the tube-check page: validate the adjusted tape against the
 * expected paper length, accept or reject via Swal, then advance to page 3
 * or return to page 2.
 *
 * @param {Object} context – all state & deps needed by this handler
 */
export async function handleSpaceOnTubeCheck(context) {
  const {
    tubeCheckTapeAdjusted,
    tubeCheckTapeLengthPx,
    pxPerCm,
    matchHalfLengthBool,
    selectedPaperLengthCm,
    objectTestCommonData,
    options,
    objectLengthCmGlobal,
    RC,
    phrases,
    tubeCheckTape,
    showPage,
    reattachKeydown,
    swalInfoOptions,
    processInlineFormatting,
  } = context

  // Require that the tape was adjusted before accepting SPACE
  if (!tubeCheckTapeAdjusted) {
    debugLog(
      CATEGORY,
      'SPACE ignored on tube check page – tape not yet adjusted',
    )
    reattachKeydown()
    return
  }

  // Calculate the estimated tube length from the tape
  const tapeLengthCm = tubeCheckTapeLengthPx / pxPerCm
  const estimatedCm = matchHalfLengthBool ? tapeLengthCm * 2 : tapeLengthCm
  const expectedCm = selectedPaperLengthCm

  if (!expectedCm || expectedCm <= 0) {
    debugError(CATEGORY, 'Tube check: invalid expectedCm, skipping check')
    reattachKeydown()
    return
  }

  const ratio = estimatedCm / expectedCm

  // Save to objectTestCommonData arrays
  objectTestCommonData.estimatedLengthCm.push(Math.round(estimatedCm * 10) / 10)
  objectTestCommonData.estimatedLengthRatio.push(
    Math.round(ratio * 1000) / 1000,
  )

  console.log(
    `Tube check: tapeLengthCm=${tapeLengthCm.toFixed(1)}, estimatedCm=${estimatedCm.toFixed(1)}, expectedCm=${expectedCm}, ratio=${ratio.toFixed(3)}, matchHalf=${matchHalfLengthBool}`,
  )

  // Acceptance thresholds (from options or defaults)
  const ratioThresholdFull = options.calibrateDistanceAllowedRatioCm
  const ratioThresholdHalf = options.calibrateDistanceAllowedRatioHalfCm

  // Round ratio to integer percentage BEFORE testing so the accept/reject
  // decision is consistent with what the participant sees (e.g. 102%).
  const roundedRatio = Math.round(ratio * 100) / 100
  const log10Ratio = Math.abs(Math.log10(roundedRatio))
  const pctOfExpected = roundedRatio * 100
  const threshold = matchHalfLengthBool
    ? ratioThresholdHalf
    : ratioThresholdFull
  const log10Threshold = Math.abs(Math.log10(threshold))
  const accepted = log10Ratio <= log10Threshold

  console.log(
    `Tube check: accepted=${accepted}, threshold=${matchHalfLengthBool ? ratioThresholdHalf : ratioThresholdFull}`,
  )

  if (accepted) {
    // Hide tube check tape and proceed to page 3
    tubeCheckTape.container.style.display = 'none'

    // Initialize Face Mesh tracking if not already done
    if (!RC.gazeTracker.checkInitialized('distance')) {
      RC.gazeTracker._init(
        { toFixedN: 1, showVideo: true, showFaceOverlay: false },
        'distance',
      )
    }

    // Use the original expected exact length, not the estimate
    objectLengthCmGlobal.value = expectedCm

    await showPage(3)
    setTimeout(() => reattachKeydown(), 0)
  } else {
    // Rejected – show error message (pctOfExpected already computed above)
    const errorMsg = (phrases.RC_BadMatchToExpectedLength?.[RC.L]).replace(
      '[[NNN]]',
      pctOfExpected.toString(),
    )

    await Swal.fire({
      ...swalInfoOptions(RC, { showIcon: false }),
      icon: undefined,
      html: processInlineFormatting(errorMsg),
      allowEnterKey: true,
      confirmButtonText: phrases.T_ok?.[RC.L] || phrases.RC_OK?.[RC.L] || 'OK',
      didOpen: () => {
        document.addEventListener('keydown', preventSpaceInPopup, true)
      },
      willClose: () => {
        document.removeEventListener('keydown', preventSpaceInPopup, true)
      },
    })

    // Hide tube check tape and return to page 2 (paper selection)
    tubeCheckTape.container.style.display = 'none'
    await showPage(2)
    setTimeout(() => reattachKeydown(), 0)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// handleSpaceOnPage2
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Space on page 2: record ruler measurement, enforce minimum length,
 * show rejection popup when too short, then advance to page 3 on success.
 *
 * @param {Object} context – all state & deps needed by this handler
 */
export async function handleSpaceOnPage2(context) {
  const {
    isPaperSelectionMode,
    nextPage,
    RC,
    tape,
    startX,
    startY,
    endX,
    endY,
    pxPerMm,
    measurementState,
    options,
    objectTestCommonData,
    intervalCmCurrent,
    phrases,
    swalInfoOptions,
    processInlineFormatting,
    resetPage2ForNextMeasurement,
    reattachKeydown,
  } = context

  // Paper-selection mode: just advance via nextPage
  if (isPaperSelectionMode) {
    const advanced = await nextPage()

    if (advanced && !RC.gazeTracker.checkInitialized('distance')) {
      RC.gazeTracker._init(
        { toFixedN: 1, showVideo: true, showFaceOverlay: false },
        'distance',
      )
    }

    reattachKeydown()
    return
  }

  // ── Ruler mode: record the diagonal distance ─────────────────────────
  const diagonalDistancePx = tape.helpers.getDistance(
    startX,
    startY,
    endX,
    endY,
  )
  const firstMeasurement = diagonalDistancePx / pxPerMm / 10

  console.log('=== DEBUG: PAGE 2 - FIRST MEASUREMENT SET ===')
  console.log(`  diagonalDistancePx: ${diagonalDistancePx}`)
  console.log(`  pxPerMm: ${pxPerMm}`)
  console.log(
    `  firstMeasurement = ${diagonalDistancePx} / ${pxPerMm} / 10 = ${firstMeasurement} cm`,
  )
  console.log('=== END DEBUG ===')

  // Validate object length – minimum enforcement
  const minCm = options.calibrateDistanceObjectMinMaxCm?.[0] || 30
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
      measurementState.rejectionCount++
      console.log(`Rejection count: ${measurementState.rejectionCount}`)

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
      reattachKeydown()
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
        `Current measurement is too short (${Math.round(firstMeasurement)}cm < ${Math.round(minCm)}cm) – will enforce on NEXT measurement`,
      )
      measurementState.lastAttemptWasTooShort = true
      objectTestCommonData.objectMeasuredMsg.push('short')
    } else {
      measurementState.lastAttemptWasTooShort = false
    }
  }

  // Store original measurement data before resetting lines
  context.setFirstMeasurement(firstMeasurement)
  context.savedMeasurementData = {
    startX,
    startY,
    endX,
    endY,
    objectLengthPx: diagonalDistancePx,
    objectLengthMm: diagonalDistancePx / pxPerMm,
    objectLengthCm: firstMeasurement,
  }

  // Move to page 3
  await nextPage()

  // Initialize Face Mesh tracking if not already done
  if (!RC.gazeTracker.checkInitialized('distance')) {
    RC.gazeTracker._init(
      { toFixedN: 1, showVideo: true, showFaceOverlay: false },
      'distance',
    )
  }

  reattachKeydown()
}

// ─────────────────────────────────────────────────────────────────────────────
// handleSpaceOnPage3
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Space on page 3: collect Face Mesh samples, compute fOverWidth, run
 * tolerance check, handle rejection / retroactive rejection / advancement,
 * and finally bulk-save at completion.
 *
 * @param {Object} context – all state & deps needed by this handler
 */
export async function handleSpaceOnPage3(context) {
  const {
    RC,
    options,
    phrases,
    ppi,
    firstMeasurement,
    faceMeshSamplesPage3,
    faceMeshSamplesPage4,
    meshSamplesDuringPage3,
    meshSamplesDuringPage4,
    lastCapturedFaceImage,
    setLastCapturedFaceImage,
    locationManager,
    objectTestCommonData,
    measurementSaveQueue,
    measurementState,
    isPaperSelectionMode,
    preferRightHandBool,
    setPreferRightHandBool,
    viewingDistanceMeasurementCount,
    setViewingDistanceMeasurementCount,
    globalPointXYPx,
    objectLengthCmGlobal,
    arrowIndicators,
    setArrowIndicators,
    stepInstructionModel,
    setStepInstructionModel,
    currentStepFlatIndex,
    setCurrentStepFlatIndex,
    currentStepperPhraseKey,
    setCurrentStepperPhraseKey,
    cameraResolutionXYVpxPage3,
    setCameraResolutionXYVpxPage3,
    cameraResolutionXYVpxPage4,
    setCameraResolutionXYVpxPage4,
    setFaceMeshSamplesPage4Array,
    setMeshSamplesDuringPage4Array,
    selectedPaperOption,
    selectedPaperLengthCm,
    selectedPaperLabel,
    paperSuggestionValue,
    paperSelectionContainer,
    paperSuggestionInput,
    paperValidationMessage,
    paperSelectionOptions,
    calibrateDistanceLocations,
    swalInfoOptions,
    processInlineFormatting,
    collectFaceMeshSamples,
    getCameraResolutionXY,
    getMeshData,
    calculateFootXYPx,
    getGlobalPointForLocation,
    getOffsetPx,
    positionVideoForLocation,
    getArrowPositionForLocation,
    createArrowIndicators: createArrowIndicatorsFn,
    buildMeasurementPageConfig,
    measurementPageRenderer,
    updateMeasurementOverlayForLocation,
    renderViewingDistanceProgressTitle,
    processMeshDataAndCalculateNearestPoints,
    createMeasurementObject,
    saveCalibrationMeasurements,
    objectTestFinishFunction,
    nextPage,
    showPage,
    reattachKeydown,
    detachKeydown,
  } = context

  console.log('=== COLLECTING FACE MESH SAMPLES ON PAGE 3 ===')

  // Collect 5 Face Mesh samples for calibration
  await collectFaceMeshSamples(
    RC,
    faceMeshSamplesPage3,
    ppi,
    meshSamplesDuringPage3,
  )
  const cameraRes = getCameraResolutionXY(RC)
  setCameraResolutionXYVpxPage3(cameraRes)
  console.log('Face Mesh calibration samples (page 3):', faceMeshSamplesPage3)

  // Check for invalid samples
  const validSamples = faceMeshSamplesPage3.filter(sample => !isNaN(sample))
  if (
    validSamples.length < 5 ||
    faceMeshSamplesPage3.some(sample => isNaN(sample))
  ) {
    // Use the image captured at space press
    const capturedImage = lastCapturedFaceImage

    let conditionalFaceImageNotSaved = ''
    if (!options.saveSnapshots) {
      conditionalFaceImageNotSaved = `<p style="margin-top: 15px; font-size: 0.7em; color: #666;">${processInlineFormatting(phrases.RC_FaceImageNotSaved[RC.L])}</p>`
    }

    const result = await Swal.fire({
      ...swalInfoOptions(RC, { showIcon: false }),
      title: processInlineFormatting(phrases.RC_FaceBlocked[RC.L]),
      html: `<div style="text-align: center;">
        <img src="${capturedImage}" style="max-width: 300px; max-height: 400px; border: 2px solid #ccc; border-radius: 8px;" alt="Camera view" />
        ${conditionalFaceImageNotSaved}
       </div>`,
      showCancelButton: false,
      showConfirmButton: false,
      allowEnterKey: false,
      footer: `
      <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; gap: 10px;">
        <button class="swal2-confirm swal2-styled" id="ok-button-page3" style="background-color: #3085d6; border: none; flex: 0 0 auto;">
          ${phrases.EE_ok[RC.L]}
        </button>
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="color: #000; font-size: 1.6em;">
            ${processInlineFormatting(phrases.RC_LongerObjectHelps[RC.L])}
          </div>
          <button class="swal2-confirm swal2-styled" id="new-object-button-page3" style="background-color: #28a745; border: none; flex: 0 0 auto;">
            ${phrases.RC_NewObjectButton[RC.L]}
          </button>
        </div>
      </div>
    `,
      customClass: { footer: 'swal2-footer-no-border' },
      didOpen: () => {
        // Add CSS to remove footer border
        if (!document.getElementById('swal2-footer-no-border-style')) {
          const style = document.createElement('style')
          style.id = 'swal2-footer-no-border-style'
          style.textContent =
            '.swal2-footer-no-border { border-top: none !important; }'
          document.head.appendChild(style)
        }

        // Handle keyboard events – only allow Enter/Return, prevent Space
        const keydownListener = event => {
          if (event.key === ' ') {
            event.preventDefault()
            event.stopPropagation()
            return
          }
          if (event.key === 'Enter' || event.key === 'Return') {
            document.getElementById('ok-button-page3').click()
          }
        }
        document.addEventListener('keydown', keydownListener, true)
        RC.popupKeydownListener = keydownListener

        // OK button closes popup
        document
          .getElementById('ok-button-page3')
          .addEventListener('click', () => {
            Swal.close()
          })

        // "New object" button – restart from page 2
        document
          .getElementById('new-object-button-page3')
          .addEventListener('click', () => {
            console.log('New object button clicked – restarting from page 2')

            faceMeshSamplesPage3.length = 0
            faceMeshSamplesPage4.length = 0
            meshSamplesDuringPage3.length = 0
            meshSamplesDuringPage4.length = 0
            context.setFirstMeasurement(null)

            context.setViewingDistanceMeasurementCount(0)
            context.setViewingDistanceTotalExpected(
              isPaperSelectionMode
                ? calibrateDistanceLocations.length + 1
                : calibrateDistanceLocations.length,
            )

            context.resetMeasurementState()

            if (isPaperSelectionMode) {
              context.resetPaperSelectionState()
            }

            context.setCurrentPage(1)
            Swal.close()
            nextPage()
            reattachKeydown()
          })
      },
      willClose: () => {
        if (RC.popupKeydownListener) {
          document.removeEventListener('keydown', RC.popupKeydownListener, true)
          RC.popupKeydownListener = null
        }
        reattachKeydown()
      },
    })

    console.log('=== RETRYING FACE MESH SAMPLES ON PAGE 3 ===')
    setLastCapturedFaceImage(null)
    return // user will press space again
  }

  // ── All 5 samples valid – process this location measurement ───────────
  console.log(
    `=== ALL 5 FACE MESH SAMPLES VALID FOR LOCATION ${locationManager.getCurrentIndex()} ===`,
  )

  const currentLocMeasurement = locationManager.getCurrentLocationInfo()
  const validSamplesForCalc = faceMeshSamplesPage3.filter(s => !isNaN(s))

  console.log('=== DEBUG: MEASUREMENT CALCULATION INPUTS ===')
  console.log(
    `  faceMeshSamplesPage3 raw: [${faceMeshSamplesPage3.join(', ')}]`,
  )
  console.log(`  validSamplesForCalc count: ${validSamplesForCalc.length}`)
  console.log(`  validSamplesForCalc: [${validSamplesForCalc.join(', ')}]`)
  console.log(
    `  firstMeasurement: ${firstMeasurement} (type: ${typeof firstMeasurement})`,
  )

  const avgFaceMesh =
    validSamplesForCalc.length > 0
      ? validSamplesForCalc.reduce((a, b) => a + b, 0) /
        validSamplesForCalc.length
      : NaN
  console.log(`  avgFaceMesh calculated: ${avgFaceMesh}`)

  console.log(`  cameraRes: [${cameraRes[0]}, ${cameraRes[1]}]`)
  console.log(`  RC._CONST.IPD_CM: ${RC._CONST?.IPD_CM}`)

  const mesh = await getMeshData(
    RC,
    options.calibrateDistancePupil,
    meshSamplesDuringPage3,
  )

  let factorCmPx = avgFaceMesh * firstMeasurement
  let fOverWidth = factorCmPx / cameraRes[0] / RC._CONST.IPD_CM
  let rulerBasedEyesToFootCm = null
  let nearestXYPx_left = null
  let nearestXYPx_right = null
  let rulerBasedEyesToPointCm = firstMeasurement
  let footToPointCm = null
  let currentIPDDistance = null
  let ipdOverWidth = null
  let imageBasedEyesToFootCm = null
  let imageBasedEyesToPointCm = null

  if (mesh) {
    const { leftEye, rightEye, video, currentIPDDistance: ipdVpx } = mesh
    currentIPDDistance = ipdVpx
    const pxPerCmLocal = ppi / 2.54

    const footResult = calculateFootXYPx(
      RC,
      video,
      leftEye,
      rightEye,
      pxPerCmLocal,
      currentIPDDistance,
    )
    nearestXYPx_left = footResult.nearestXYPx_left
    nearestXYPx_right = footResult.nearestXYPx_right

    const locInfo = locationManager.getCurrentLocationInfo()
    const pointXYPx = getGlobalPointForLocation(
      locInfo.location,
      getOffsetPx(),
      RC,
    )

    console.log('page 3:3 globalPointXYPx:', globalPointXYPx.value)

    const eye = preferRightHandBool ? 'right' : 'left'
    const footXYPx = eye === 'left' ? nearestXYPx_left : nearestXYPx_right

    footToPointCm =
      Math.hypot(footXYPx[0] - pointXYPx[0], footXYPx[1] - pointXYPx[1]) /
      pxPerCmLocal

    rulerBasedEyesToPointCm = firstMeasurement
    rulerBasedEyesToFootCm = Math.sqrt(
      rulerBasedEyesToPointCm ** 2 - footToPointCm ** 2,
    )
    factorCmPx = currentIPDDistance * rulerBasedEyesToFootCm
    fOverWidth = factorCmPx / cameraRes[0] / RC._CONST.IPD_CM
    ipdOverWidth =
      currentIPDDistance && cameraRes[0]
        ? currentIPDDistance / cameraRes[0]
        : null
    const fVpx = fOverWidth * cameraRes[0]
    imageBasedEyesToFootCm =
      currentIPDDistance && RC._CONST?.IPD_CM
        ? (fVpx * RC._CONST.IPD_CM) / currentIPDDistance
        : null
    imageBasedEyesToPointCm =
      imageBasedEyesToFootCm != null && footToPointCm != null
        ? Math.sqrt(imageBasedEyesToFootCm ** 2 + footToPointCm ** 2)
        : null
  }

  // NaN checks
  if (isNaN(avgFaceMesh)) console.error('  ERROR: avgFaceMesh is NaN!')
  if (isNaN(factorCmPx))
    console.error(
      '  ERROR: factorCmPx is NaN! Check firstMeasurement and avgFaceMesh',
    )
  if (isNaN(fOverWidth))
    console.error(
      '  ERROR: fOverWidth is NaN! Check factorCmPx, cameraRes, and IPD_CM',
    )
  console.log('=== END DEBUG ===')

  console.log(`Location ${locationManager.getCurrentIndex()} measurement:`)
  console.log(
    `  avgFaceMesh: ${avgFaceMesh}, factorCmPx: ${factorCmPx}, fOverWidth: ${fOverWidth}`,
  )

  // History lists: record every snapshot regardless of acceptance
  objectTestCommonData.historyFOverWidth.push(
    parseFloat(Number(fOverWidth).toFixed(4)),
  )
  objectTestCommonData.historyEyesToFootCm.push(
    rulerBasedEyesToFootCm != null
      ? parseFloat(Number(rulerBasedEyesToFootCm).toFixed(2))
      : null,
  )
  objectTestCommonData.historyPreferRightHandBool.push(preferRightHandBool)

  // ── Tolerance check ───────────────────────────────────────────────────
  const T_focal =
    options.calibrateDistanceAllowedRatioFOverWidth ||
    DEFAULT_FOCAL_TOLERANCE_RATIO
  const prevFOverWidth = locationManager.getPreviousFOverWidth()
  const focalRatio = prevFOverWidth != null ? fOverWidth / prevFOverWidth : 1
  const focalRoundedPct = Math.round(100 * focalRatio)
  const focalLower = Math.round(100 / T_focal)
  const focalUpper = Math.round(100 * T_focal)
  const focalAccepted =
    prevFOverWidth == null ||
    (focalRoundedPct >= focalLower && focalRoundedPct <= focalUpper)

  if (!focalAccepted) {
    // ── TOLERANCE FAILED ──────────────────────────────────────────────
    console.log('=== TOLERANCE CHECK FAILED - REJECTING MEASUREMENTS ===')

    // Rejected plot lists
    objectTestCommonData.rejectedFOverWidth.push(
      parseFloat(Number(fOverWidth).toFixed(4)),
    )
    objectTestCommonData.rejectedRatioFOverWidth.push(
      parseFloat(Number(fOverWidth / prevFOverWidth).toFixed(4)),
    )
    const failLocInfo = locationManager.getCurrentLocationInfo()
    objectTestCommonData.rejectedLocation.push(failLocInfo.locEye)
    objectTestCommonData.rejectedPointXYPx.push(
      globalPointXYPx.value ? [...globalPointXYPx.value] : [null, null],
    )
    objectTestCommonData.rejectedLeftEyeFootXYPx.push(
      nearestXYPx_left && nearestXYPx_left.length >= 2
        ? [
            Math.round(nearestXYPx_left[0] * 100) / 100,
            Math.round(nearestXYPx_left[1] * 100) / 100,
          ]
        : null,
    )
    objectTestCommonData.rejectedRightEyeFootXYPx.push(
      nearestXYPx_right && nearestXYPx_right.length >= 2
        ? [
            Math.round(nearestXYPx_right[0] * 100) / 100,
            Math.round(nearestXYPx_right[1] * 100) / 100,
          ]
        : null,
    )
    objectTestCommonData.rejectedIpdOverWidth.push(
      ipdOverWidth != null && !isNaN(ipdOverWidth)
        ? parseFloat(Number(ipdOverWidth).toFixed(4))
        : null,
    )
    objectTestCommonData.rejectedRulerBasedEyesToFootCm.push(
      rulerBasedEyesToFootCm != null && !isNaN(rulerBasedEyesToFootCm)
        ? parseFloat(Number(rulerBasedEyesToFootCm).toFixed(2))
        : null,
    )
    objectTestCommonData.rejectedRulerBasedEyesToPointCm.push(
      rulerBasedEyesToPointCm != null && !isNaN(rulerBasedEyesToPointCm)
        ? parseFloat(Number(rulerBasedEyesToPointCm).toFixed(2))
        : null,
    )
    objectTestCommonData.rejectedImageBasedEyesToFootCm.push(
      imageBasedEyesToFootCm != null && !isNaN(imageBasedEyesToFootCm)
        ? parseFloat(Number(imageBasedEyesToFootCm).toFixed(2))
        : null,
    )
    objectTestCommonData.rejectedImageBasedEyesToPointCm.push(
      imageBasedEyesToPointCm != null && !isNaN(imageBasedEyesToPointCm)
        ? parseFloat(Number(imageBasedEyesToPointCm).toFixed(2))
        : null,
    )
    objectTestCommonData.rejectedPreferRightHandBool.push(preferRightHandBool)

    // Shrink accepted lists: remove only the previous (retroactively rejected)
    objectTestCommonData.acceptedFOverWidth.pop()
    objectTestCommonData.acceptedRatioFOverWidth.pop()
    objectTestCommonData.acceptedLocation.pop()
    objectTestCommonData.acceptedPointXYPx.pop()
    objectTestCommonData.acceptedLeftEyeFootXYPx.pop()
    objectTestCommonData.acceptedRightEyeFootXYPx.pop()
    objectTestCommonData.acceptedIpdOverWidth.pop()
    objectTestCommonData.acceptedRulerBasedEyesToFootCm.pop()
    objectTestCommonData.acceptedRulerBasedEyesToPointCm.pop()
    objectTestCommonData.acceptedImageBasedEyesToFootCm.pop()
    objectTestCommonData.acceptedImageBasedEyesToPointCm.pop()
    objectTestCommonData.acceptedPreferRightHandBool.pop()

    // Queue the CURRENT (failing) measurement as rejected
    measurementSaveQueue.push({
      locEye: failLocInfo.locEye,
      location: failLocInfo.location,
      meshSamples: [...meshSamplesDuringPage3],
      factorCmPx,
      fOverWidth,
      cameraResolution: cameraRes,
      locationIndex: locationManager.getCurrentIndex(),
      accepted: false,
    })
    console.log(
      `Queued rejected measurement for location ${failLocInfo.locEye}`,
    )

    // Retroactively reject the PREVIOUS measurement
    for (let qi = measurementSaveQueue.length - 2; qi >= 0; qi--) {
      if (measurementSaveQueue[qi].accepted) {
        measurementSaveQueue[qi].accepted = false
        console.log(
          `Retroactively rejected queued measurement at index ${qi} ` +
            `(location ${measurementSaveQueue[qi].locEye}, ` +
            `fOverWidth ${measurementSaveQueue[qi].fOverWidth})`,
        )
        break
      }
    }

    // Show rejection popup
    const displayMessage =
      phrases.RC_focalLengthMismatch?.[RC.L]
        ?.replace('[[N1]]', focalRoundedPct.toString())
        .replace('[[TT1]]', focalLower.toString())
        .replace('[[TT2]]', focalUpper.toString()) ||
      `The last two snapshots are inconsistent. Your new distance is ${focalRoundedPct}% of that expected from your previous snapshot. Let's try again. Click OK or press RETURN.`

    await Swal.fire({
      ...swalInfoOptions(RC, { showIcon: false }),
      title: '',
      html: `<p>${processInlineFormatting(displayMessage)}</p>`,
      confirmButtonText: phrases.EE_ok?.[RC.L] || 'OK',
    })

    // Reject measurements and go back using locationManager
    locationManager.rejectAndGoBack(1)

    // Reset face mesh samples for retry
    faceMeshSamplesPage3.length = 0
    meshSamplesDuringPage3.length = 0

    // Re-render the measurement page for the reset location
    const resetPageConfig = buildMeasurementPageConfig(
      locationManager,
      options.saveSnapshots || false,
      preferRightHandBool,
      getOffsetPx(),
    )

    if (resetPageConfig) {
      const pageResult = await measurementPageRenderer.showMeasurementPage({
        ...resetPageConfig,
        pageNumberOffset: isPaperSelectionMode ? 1 : 0,
        onProgressUpdate: (current, total) => {
          console.log(`Progress update after rejection: ${current} of ${total}`)
        },
        setStepModel: (model, index, phraseKey) => {
          setStepInstructionModel(model)
          if (index != null) setCurrentStepFlatIndex(index)
          const maxIdx = (model?.flatSteps?.length || 1) - 1
          if (currentStepFlatIndex > maxIdx) setCurrentStepFlatIndex(maxIdx)
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
        `Re-rendered page after rejection for location ${locationManager.getCurrentIndex()}`,
      )
    } else {
      // Fallback: update UI elements manually
      const resetLocInfo = locationManager.getCurrentLocationInfo()
      if (resetLocInfo) {
        positionVideoForLocation(RC, resetLocInfo.location, getOffsetPx())
        if (arrowIndicators) arrowIndicators.remove()
        setArrowIndicators(null)
        if (resetLocInfo.location === 'camera') {
          const arrowXY = getArrowPositionForLocation(
            resetLocInfo.location,
            getOffsetPx(),
            RC,
          )
          const newArrows = createArrowIndicatorsFn(arrowXY)
          RC.background.appendChild(newArrows)
          setArrowIndicators(newArrows)
        }
        updateMeasurementOverlayForLocation()
      }
    }

    // Update progress title
    setViewingDistanceMeasurementCount(
      locationManager.getCurrentIndex() + 1 + (isPaperSelectionMode ? 1 : 0),
    )
    renderViewingDistanceProgressTitle()

    reattachKeydown()
    setLastCapturedFaceImage(null)

    // Set global point based on current location
    const currentLocForPoint = locationManager.getCurrentLocationInfo()
    globalPointXYPx.value = getGlobalPointForLocation(
      currentLocForPoint.location,
      getOffsetPx(),
      RC,
    )
    console.log('page 3:4 globalPointXYPx:', globalPointXYPx.value)
    return
  }

  // ── TOLERANCE PASSED ────────────────────────────────────────────────
  console.log('=== TOLERANCE CHECK PASSED ===')

  console.log('=== DEBUG: STORING MEASUREMENT ===')
  console.log(`  firstMeasurement (objectLengthCm): ${firstMeasurement}`)
  console.log(`  avgFaceMesh: ${avgFaceMesh}`)
  console.log(`  factorCmPx: ${factorCmPx}`)
  console.log(`  fOverWidth: ${fOverWidth}`)

  // Get previous fOverWidth BEFORE storing current
  const prevF = locationManager.getPreviousFOverWidth()

  locationManager.storeMeasurement({
    location: currentLocMeasurement.location,
    faceMeshSamples: [...faceMeshSamplesPage3],
    meshSamples: [...meshSamplesDuringPage3],
    cameraResolution: cameraRes,
    avgFaceMesh,
    factorCmPx,
    fOverWidth,
    objectLengthCm: firstMeasurement,
  })

  // Queue this snapshot as accepted
  objectTestCommonData.acceptedFOverWidth.push(
    parseFloat(Number(fOverWidth).toFixed(4)),
  )
  objectTestCommonData.acceptedRatioFOverWidth.push(
    prevF == null
      ? NaN
      : (() => {
          const r = fOverWidth / prevF
          return r != null && !isNaN(r) ? parseFloat(Number(r).toFixed(4)) : NaN
        })(),
  )
  objectTestCommonData.acceptedLocation.push(currentLocMeasurement.locEye)
  objectTestCommonData.acceptedPointXYPx.push(
    globalPointXYPx.value ? [...globalPointXYPx.value] : [null, null],
  )
  objectTestCommonData.acceptedLeftEyeFootXYPx.push(
    nearestXYPx_left && nearestXYPx_left.length >= 2
      ? [
          Math.round(nearestXYPx_left[0] * 100) / 100,
          Math.round(nearestXYPx_left[1] * 100) / 100,
        ]
      : null,
  )
  objectTestCommonData.acceptedRightEyeFootXYPx.push(
    nearestXYPx_right && nearestXYPx_right.length >= 2
      ? [
          Math.round(nearestXYPx_right[0] * 100) / 100,
          Math.round(nearestXYPx_right[1] * 100) / 100,
        ]
      : null,
  )
  objectTestCommonData.acceptedIpdOverWidth.push(
    ipdOverWidth != null && !isNaN(ipdOverWidth)
      ? parseFloat(Number(ipdOverWidth).toFixed(4))
      : null,
  )
  objectTestCommonData.acceptedRulerBasedEyesToFootCm.push(
    rulerBasedEyesToFootCm != null && !isNaN(rulerBasedEyesToFootCm)
      ? parseFloat(Number(rulerBasedEyesToFootCm).toFixed(2))
      : null,
  )
  objectTestCommonData.acceptedRulerBasedEyesToPointCm.push(
    rulerBasedEyesToPointCm != null && !isNaN(rulerBasedEyesToPointCm)
      ? parseFloat(Number(rulerBasedEyesToPointCm).toFixed(2))
      : null,
  )
  objectTestCommonData.acceptedImageBasedEyesToFootCm.push(
    imageBasedEyesToFootCm != null && !isNaN(imageBasedEyesToFootCm)
      ? parseFloat(Number(imageBasedEyesToFootCm).toFixed(2))
      : null,
  )
  objectTestCommonData.acceptedImageBasedEyesToPointCm.push(
    imageBasedEyesToPointCm != null && !isNaN(imageBasedEyesToPointCm)
      ? parseFloat(Number(imageBasedEyesToPointCm).toFixed(2))
      : null,
  )
  objectTestCommonData.acceptedPreferRightHandBool.push(preferRightHandBool)

  measurementSaveQueue.push({
    locEye: currentLocMeasurement.locEye,
    location: currentLocMeasurement.location,
    meshSamples: [...meshSamplesDuringPage3],
    factorCmPx,
    fOverWidth,
    cameraResolution: cameraRes,
    locationIndex: locationManager.getCurrentIndex(),
    accepted: true,
  })
  console.log(
    `Queued accepted measurement for location ${currentLocMeasurement.locEye}`,
  )

  // Check if there are more locations
  const hasMoreLocations = locationManager.advanceToNext()
  console.log('page 3:5 globalPointXYPx:', globalPointXYPx.value)

  if (hasMoreLocations) {
    // ── More locations to measure ─────────────────────────────────────
    const currentLocForPoint = locationManager.getCurrentLocationInfo()
    globalPointXYPx.value = getGlobalPointForLocation(
      currentLocForPoint.location,
      getOffsetPx(),
      RC,
    )

    console.log(
      `=== ADVANCING TO NEXT LOCATION ${locationManager.getCurrentIndex()} ===`,
    )

    faceMeshSamplesPage3.length = 0
    meshSamplesDuringPage3.length = 0

    const nextPageConfig = buildMeasurementPageConfig(
      locationManager,
      options.saveSnapshots || false,
      preferRightHandBool,
      getOffsetPx(),
    )

    if (nextPageConfig) {
      const pageResult = await measurementPageRenderer.showMeasurementPage({
        ...nextPageConfig,
        pageNumberOffset: isPaperSelectionMode ? 1 : 0,
        onProgressUpdate: (current, total) => {
          console.log(`Progress update: ${current} of ${total}`)
        },
        setStepModel: (model, index, phraseKey) => {
          setStepInstructionModel(model)
          if (index != null) setCurrentStepFlatIndex(index)
          const maxIdx = (model?.flatSteps?.length || 1) - 1
          if (currentStepFlatIndex > maxIdx) setCurrentStepFlatIndex(maxIdx)
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
        `Re-rendered page for location ${locationManager.getCurrentIndex()}: ${nextPageConfig.locEye}`,
      )
    } else {
      // Fallback: update UI elements manually
      const nextLocInfo = locationManager.getCurrentLocationInfo()
      if (nextLocInfo) {
        positionVideoForLocation(RC, nextLocInfo.location, getOffsetPx())
        if (arrowIndicators) arrowIndicators.remove()
        setArrowIndicators(null)
        if (nextLocInfo.location === 'camera') {
          const arrowXY = getArrowPositionForLocation(
            nextLocInfo.location,
            getOffsetPx(),
            RC,
          )
          const newArrows = createArrowIndicatorsFn(arrowXY)
          RC.background.appendChild(newArrows)
          setArrowIndicators(newArrows)
        }
        updateMeasurementOverlayForLocation()
        console.log(
          `Updated UI for location ${locationManager.getCurrentIndex()}: ${nextLocInfo.locEye}`,
        )
      }
    }

    // Update progress title
    setViewingDistanceMeasurementCount(
      locationManager.getCurrentIndex() + 1 + (isPaperSelectionMode ? 1 : 0),
    )
    renderViewingDistanceProgressTitle()

    reattachKeydown()
    setLastCapturedFaceImage(null)
  } else {
    // ── ALL LOCATIONS MEASURED – FINISH ──────────────────────────────
    console.log(
      '=== ALL LOCATIONS MEASURED - FINISHING DIRECTLY FROM PAGE 3 ===',
    )

    const completedMeasurements = locationManager.getCompletedMeasurements()
    console.log(`Total completed measurements: ${completedMeasurements.length}`)

    const finalCalibration = locationManager.calculateFinalCalibration()
    console.log('=== FINAL CALIBRATION CALCULATED ===')
    console.log(
      `  Geometric mean fOverWidth: ${finalCalibration.geometricMeanFOverWidth}`,
    )
    console.log(
      `  Geometric mean factor: ${finalCalibration.geometricMeanFactor}`,
    )

    const firstMeasurementData = completedMeasurements[0]
    const lastMeasurementData =
      completedMeasurements[completedMeasurements.length - 1]

    // Set global point based on last measurement location
    globalPointXYPx.value = getGlobalPointForLocation(
      lastMeasurementData.location,
      getOffsetPx(),
      RC,
    )

    RC.page3FactorCmPx = firstMeasurementData.factorCmPx
    RC.page4FactorCmPx = lastMeasurementData.factorCmPx
    RC.fOverWidth1 = firstMeasurementData.fOverWidth
    RC.fOverWidth2 = lastMeasurementData.fOverWidth
    RC.averageObjectTestCalibrationFactor = finalCalibration.geometricMeanFactor
    RC.calibrationFOverWidth = finalCalibration.geometricMeanFOverWidth

    // Copy measurement data to Page 3/4 arrays for compatibility
    faceMeshSamplesPage3.length = 0
    faceMeshSamplesPage3.push(...firstMeasurementData.faceMeshSamples)
    meshSamplesDuringPage3.length = 0
    meshSamplesDuringPage3.push(...firstMeasurementData.meshSamples)
    setCameraResolutionXYVpxPage3(firstMeasurementData.cameraResolution)

    faceMeshSamplesPage4.length = 0
    faceMeshSamplesPage4.push(...lastMeasurementData.faceMeshSamples)
    meshSamplesDuringPage4.length = 0
    meshSamplesDuringPage4.push(...lastMeasurementData.meshSamples)
    setCameraResolutionXYVpxPage4(lastMeasurementData.cameraResolution)

    // Remove listeners BEFORE calling finish to prevent re-triggering
    detachKeydown()

    // ── BULK SAVE ─────────────────────────────────────────────────────
    try {
      const allMeasurementObjects = []
      for (const entry of measurementSaveQueue) {
        const entryPointXYPx = getGlobalPointForLocation(
          entry.location,
          getOffsetPx(),
          RC,
        )
        const {
          nearestPointsData: entryNearestPointsData,
          currentIPDDistance: entryCurrentIPDDistance,
          ipdXYZVpx: entryIpdXYZVpx,
        } = await processMeshDataAndCalculateNearestPoints(
          RC,
          options,
          [...entry.meshSamples],
          entry.factorCmPx,
          ppi,
          0,
          0,
          'object',
          entry.locationIndex + 1,
          [0, 0],
          [0, 0],
          0,
          0,
          0,
          options.calibrateDistanceChecking,
          entryPointXYPx,
          firstMeasurement,
        )

        allMeasurementObjects.push(
          createMeasurementObject(
            `location-${entry.locEye}`,
            firstMeasurement,
            entry.factorCmPx,
            entryNearestPointsData,
            entryCurrentIPDDistance,
            null,
            entry.cameraResolution,
            isPaperSelectionMode
              ? selectedPaperLabel ||
                  paperSelectionOptions.find(o => o.key === selectedPaperOption)
                    ?.label ||
                  null
              : null,
            isPaperSelectionMode ? paperSuggestionValue : null,
            entryIpdXYZVpx,
            entry.fOverWidth,
            entry.accepted,
          ),
        )
      }

      objectTestCommonData.snapshotsTaken =
        objectTestCommonData.historyFOverWidth.length
      objectTestCommonData.snapshotsRejected =
        objectTestCommonData.rejectedFOverWidth.length

      saveCalibrationMeasurements(
        RC,
        'object',
        allMeasurementObjects,
        undefined,
        objectTestCommonData,
      )

      const acceptedCount = allMeasurementObjects.filter(
        m => m.snapshotAcceptedBool,
      ).length
      const rejectedCount = allMeasurementObjects.length - acceptedCount
      console.log(
        `Saved ${allMeasurementObjects.length} measurement attempts ` +
          `(${acceptedCount} accepted, ${rejectedCount} rejected) ` +
          `in chronological order`,
      )
    } catch (error) {
      console.error('Error in bulk save of measurement attempts:', error)
    }

    // Call finish function DIRECTLY
    console.log('=== CALLING objectTestFinishFunction DIRECTLY ===')
    await objectTestFinishFunction()

    setLastCapturedFaceImage(null)
  }
}
