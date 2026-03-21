/**
 * objectTestFinish.js
 *
 * Finish / cleanup logic extracted from the legacy objectTest function
 * in distance.js (lines 7493-8324).
 *
 * Exports:
 *   cleanupObjectTestDOM(deps)       – Remove listeners, DOM elements, overlays
 *   buildDebugOverlay(data, deps)    – Create the debug feedback div when objecttestdebug is true
 *   finishObjectTest(context)        – Main entry point (async); orchestrates the full finish flow
 *   cleanupAllResources(context)     – Full teardown (keyboard, DOM, resize, background)
 */

import Swal from 'sweetalert2'

import { BLINDSPOT_TRANSITION_DELAY_MS, Z_INDEX } from './objectTestConstants'
import { debugLog, debugError } from './debugLogger'
import {
  calculateCalibrationFactors,
  buildCalibrationData,
  sanitizeDataObject,
  filterAndRoundSamples,
} from './calibrationCalculator'
import { swalInfoOptions } from '../../components/swalOptions'
import { phrases } from '../../i18n/schema'
import { processInlineFormatting } from '../markdownInstructionParser'
import { setUpEasyEyesKeypadHandler } from '../../extensions/keypadHandler'

// ---------------------------------------------------------------------------
// "Put Your Glasses Back On" screen
// ---------------------------------------------------------------------------

/**
 * Show a full-screen prompt asking the participant to put their glasses
 * back on, with an OK button.  Uses the same Swal styling as the rest
 * of the distance calibration / check pages.
 */
export async function showPutGlassesBackOnScreen(RC) {
  await Swal.fire({
    ...swalInfoOptions(RC, { showIcon: false }),
    confirmButtonText: phrases.RC_ok[RC.L],
    title:
      '<p class="heading2">' +
      processInlineFormatting(phrases.RC_PutYourGlassesBackOn[RC.L]) +
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
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Recursively walk an object and log problematic values (undefined, NaN,
 * Infinity, null).  Faithfully reproduces the inline `checkForProblems`
 * closures from distance.js lines 8121-8141 and 8190-8206.
 */
function checkForProblems(obj, path = '') {
  for (const key in obj) {
    const fullPath = path ? `${path}.${key}` : key
    const value = obj[key]
    if (value === undefined) {
      console.error(`  ❌ UNDEFINED at ${fullPath}`)
    } else if (typeof value === 'number' && isNaN(value)) {
      console.error(`  ❌ NaN at ${fullPath}`)
    } else if (typeof value === 'number' && !isFinite(value)) {
      console.error(`  ❌ Infinity at ${fullPath}`)
    } else if (value === null) {
      console.warn(`  ⚠️ null at ${fullPath}`)
    } else if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value)
    ) {
      checkForProblems(value, fullPath)
    }
  }
}

/**
 * Build the geometric-calculation detail HTML used inside both the initial
 * debug overlay and the combined-mode update.
 *
 * Legacy: distance.js lines 7838-7885 and 7996-8043 (identical block).
 */
function buildGeometricCalcHtml(RC, ppi) {
  if (!RC.page4GeometricCalc) return ''
  const g = RC.page4GeometricCalc
  return `
    <div style="margin-top: 10px; border-top: 1px solid #ccc; padding-top: 10px;">
      <div style="font-weight: bold; margin-bottom: 5px;">📐 Page 4 Geometric Calculation:</div>
      <div style="margin-left: 10px;">
        <div style="color: #0066cc; font-weight: bold;">Input Values:</div>
        <div>  objectLengthCm = ${g.objectLengthCm.toFixed(2)}</div>
        <div>  ipdVpx = ${g.ipdVpx.toFixed(2)}</div>
        <div>  nearestXYPx_left = [${g.nearestXYPx_left[0].toFixed(1)}, ${g.nearestXYPx_left[1].toFixed(1)}]</div>
        <div>  nearestXYPx_right = [${g.nearestXYPx_right[0].toFixed(1)}, ${g.nearestXYPx_right[1].toFixed(1)}]</div>
        <div>  cameraXYPx = [${g.cameraXYPx[0].toFixed(1)}, ${g.cameraXYPx[1].toFixed(1)}]</div>
        <div>  pointXYPx (screen center) = [${g.pointXYPx[0].toFixed(1)}, ${g.pointXYPx[1].toFixed(1)}]</div>
        
        <div style="color: #0066cc; font-weight: bold; margin-top: 8px;">Step 1: Calculate foot position (mean of left & right eye feet)</div>
        <div>  footXYPx = mean(nearestXYPx_left, nearestXYPx_right)</div>
        <div>  footXYPx = [${g.footXYPx[0].toFixed(1)}, ${g.footXYPx[1].toFixed(1)}]</div>
        
        <div style="color: #0066cc; font-weight: bold; margin-top: 8px;">Step 2: Calculate pointToFootCm</div>
        <div>  pointToFootCm = norm(pointXYPx - footXYPx) / pxPerCm</div>
        <div>  pointToFootCm = sqrt((${g.pointXYPx[0].toFixed(1)} - ${g.footXYPx[0].toFixed(1)})² + (${g.pointXYPx[1].toFixed(1)} - ${g.footXYPx[1].toFixed(1)})²) / ${(ppi / 2.54).toFixed(2)}</div>
        <div>  <strong>pointToFootCm = ${g.pointToFootCm.toFixed(2)} cm</strong></div>
        
        <div style="color: #0066cc; font-weight: bold; margin-top: 8px;">Step 3: Calculate footToCameraCm</div>
        <div>  footToCameraCm = norm(footXYPx - cameraXYPx) / pxPerCm</div>
        <div>  footToCameraCm = sqrt((${g.footXYPx[0].toFixed(1)} - ${g.cameraXYPx[0].toFixed(1)})² + (${g.footXYPx[1].toFixed(1)} - ${g.cameraXYPx[1].toFixed(1)})²) / ${(ppi / 2.54).toFixed(2)}</div>
        <div>  <strong>footToCameraCm = ${g.footToCameraCm.toFixed(2)} cm</strong></div>
        
        <div style="color: #0066cc; font-weight: bold; margin-top: 8px;">Step 4: Set eyeToPointCm = objectLengthCm</div>
        <div>  <strong>eyeToPointCm = ${g.eyeToPointCm.toFixed(2)} cm</strong></div>
        
        <div style="color: #0066cc; font-weight: bold; margin-top: 8px;">Step 5: Calculate eyeToFootCm (Pythagorean theorem)</div>
        <div>  eyeToFootCm = sqrt(eyeToPointCm² - pointToFootCm²)</div>
        <div>  eyeToFootCm = sqrt(${g.eyeToPointCm.toFixed(2)}² - ${g.pointToFootCm.toFixed(2)}²)</div>
        <div>  <strong>eyeToFootCm = ${g.eyeToFootCm.toFixed(2)} cm</strong></div>
        
        <div style="color: #0066cc; font-weight: bold; margin-top: 8px;">Step 6: Calculate eyeToScreenCm (parallel to optical axis)</div>
        <div>  eyeToScreenCm = eyeToFootCm</div>
        <div>  eyeToScreenCm = ${g.eyeToFootCm.toFixed(2)}</div>
        <div>  <strong>eyeToScreenCm = ${g.eyeToFootCm.toFixed(2)} cm</strong></div>
        
        <div style="color: #0066cc; font-weight: bold; margin-top: 8px;">Step 7: Calculate factorVpxCm</div>
        <div>  factorVpxCm = ipdVpx × eyeToScreenCm</div>
        <div>  factorVpxCm = ${g.ipdVpx.toFixed(2)} × ${g.eyeToFootCm.toFixed(2)}</div>
        <div style="color: #cc0000; font-weight: bold;">  ✓ page4FactorCmPx = ${g.page4FactorCmPx.toFixed(2)}</div>
      </div>
    </div>
  `
}

// ---------------------------------------------------------------------------
// cleanupObjectTestDOM
// ---------------------------------------------------------------------------

/**
 * Remove keyboard listeners, DOM elements, and overlays that were created
 * during the object test.
 *
 * Legacy: distance.js lines 7506-7571 (inside objectTestFinishFunction)
 *
 * @param {object} deps
 * @param {Function}      deps.handleKeyPress
 * @param {Function}      deps.handleInstructionNav
 * @param {Function}      deps.handlePaperStepperNav
 * @param {HTMLElement}    deps.buttonContainer
 * @param {object|null}    deps.instructionsUI       – stepper UI with .destroy()
 * @param {Function}      deps.clearMeasurementOverlay
 * @param {Function}      deps.removeBigCircle
 * @param {object|null}    deps.tubeCheckTape        – { container }
 * @param {object|null}    deps.arrowIndicators      – arrow indicator component ref
 * @param {Function}      deps.removeArrowIndicatorsFromDOM
 * @param {{value:*}}     deps.globalPointXYPx
 * @param {object}        deps.leftLabel             – { container }
 * @param {object}        deps.rightLabel            – { container }
 * @param {object}        deps.options
 */
export function cleanupObjectTestDOM(deps) {
  const {
    handleKeyPress,
    handleInstructionNav,
    handlePaperStepperNav,
    buttonContainer,
    instructionsUI,
    clearMeasurementOverlay,
    removeBigCircle,
    tubeCheckTape,
    arrowIndicators,
    removeArrowIndicatorsFromDOM,
    globalPointXYPx,
    leftLabel,
    rightLabel,
    options,
  } = deps

  // Always clean up keyboard event listeners FIRST to prevent re-triggering
  document.removeEventListener('keydown', handleKeyPress)
  document.removeEventListener('keyup', handleKeyPress)
  document.removeEventListener('keydown', handleInstructionNav)
  document.removeEventListener('keydown', handlePaperStepperNav)

  // Remove paper-mode / calibration elements appended to document.body
  if (buttonContainer && buttonContainer.parentNode) {
    buttonContainer.parentNode.removeChild(buttonContainer)
  }
  const _rulerNote = document.getElementById('paper-dont-use-ruler-note')
  if (_rulerNote && _rulerNote.parentNode) {
    _rulerNote.parentNode.removeChild(_rulerNote)
  }
  const _rulerColumn = document.getElementById('dont-use-ruler-column')
  if (_rulerColumn && _rulerColumn.parentNode) {
    _rulerColumn.parentNode.removeChild(_rulerColumn)
  }

  // Remove stepper UI
  if (instructionsUI?.destroy) {
    instructionsUI.destroy()
  }
  // Remove ALL viewport-positioned stepper media containers from document.body
  document
    .querySelectorAll('body > .rc-stepper-media-container')
    .forEach(el => {
      el.parentNode.removeChild(el)
    })

  // Clear measurement overlay (eye-side text + tube circles) and big circle
  clearMeasurementOverlay()
  removeBigCircle()

  // Clean up tube check tape
  if (tubeCheckTape && tubeCheckTape.container) {
    tubeCheckTape.container.style.display = 'none'
  }

  // Clean up arrow indicators (local ref and DOM by id so they stay gone)
  if (arrowIndicators) {
    arrowIndicators.remove()
  }
  removeArrowIndicatorsFromDOM()

  globalPointXYPx.value = null

  // Clean up label elements explicitly
  if (leftLabel.container.parentNode) {
    leftLabel.container.parentNode.removeChild(leftLabel.container)
  }
  if (rightLabel.container.parentNode) {
    rightLabel.container.parentNode.removeChild(rightLabel.container)
  }

  // Hide don't use ruler text if it was created
  if (options.calibrateDistanceCheckBool) {
    const dontUseRuler = document.querySelector(
      'div[style*="color: rgb(139, 0, 0)"]',
    )
    if (dontUseRuler) {
      dontUseRuler.style.display = 'none'
    }
  }
}

// ---------------------------------------------------------------------------
// buildDebugOverlay
// ---------------------------------------------------------------------------

/**
 * Create the fixed-position debug feedback div when `objecttestdebug` is true.
 *
 * Legacy: distance.js lines 7819-7901
 *
 * @param {object} data                    – The calibration data object
 * @param {object} deps
 * @param {object}   deps.RC
 * @param {number}   deps.ppi
 * @param {number[]} deps.faceMeshSamplesPage3
 * @param {number[]} deps.faceMeshSamplesPage4
 * @param {number}   deps.distance1FactorCmPx
 * @param {number}   deps.distance2FactorCmPx
 * @returns {HTMLDivElement|null}
 */
export function buildDebugOverlay(data, deps) {
  const {
    RC,
    ppi,
    faceMeshSamplesPage3,
    faceMeshSamplesPage4,
    distance1FactorCmPx,
    distance2FactorCmPx,
  } = deps

  const feedbackDiv = document.createElement('div')
  feedbackDiv.style.position = 'fixed'
  feedbackDiv.style.bottom = '20px'
  feedbackDiv.style.left = '20px'
  feedbackDiv.style.color = 'black'
  feedbackDiv.style.padding = '10px'
  feedbackDiv.style.borderRadius = '5px'
  feedbackDiv.style.fontFamily = 'monospace'
  feedbackDiv.style.zIndex = Z_INDEX.DEBUG_OVERLAY
  feedbackDiv.style.backgroundColor = 'rgba(255, 255, 255, 0.95)'
  feedbackDiv.style.maxHeight = '80vh'
  feedbackDiv.style.overflowY = 'auto'
  feedbackDiv.style.fontSize = '11px'

  const geometricCalcHtml = buildGeometricCalcHtml(RC, ppi)

  feedbackDiv.innerHTML = `
    <div style="position: absolute; top: 5px; right: 5px; cursor: pointer; font-weight: bold; font-size: 16px; color: #666;" onclick="this.parentElement.remove()">×</div>
    <div style="margin-top: 10px; font-weight: bold;">Object Distance Calibration Debug</div>
    <div>pxPerCm = ${(ppi / 2.54).toFixed(1)}</div>
    <div>distanceObjectCm = ${data.value.toFixed(1)}</div>
    <div style="margin-top: 5px; border-top: 1px solid #eee; padding-top: 5px;">
    <div>distance1InterpupillaryPx = ${faceMeshSamplesPage3.map(sample => (isNaN(sample) ? 'NaN' : Math.round(sample))).join(', ')}</div>
      <div>distance1FactorCmPx (Page 3) = ${distance1FactorCmPx}</div>
    <div>distance2InterpupillaryPx = ${faceMeshSamplesPage4.map(sample => (isNaN(sample) ? 'NaN' : Math.round(sample))).join(', ')}</div>
      <div>distance2FactorCmPx (Page 4) = ${distance2FactorCmPx}</div>
    </div>
    ${geometricCalcHtml}
  `
  document.body.appendChild(feedbackDiv)

  return feedbackDiv
}

// ---------------------------------------------------------------------------
// finishObjectTest
// ---------------------------------------------------------------------------

/**
 * Main finish entry point.  Orchestrates the full flow:
 *  1. Guard against double execution
 *  2. Remove listeners + DOM elements
 *  3. Initialize Face Mesh if needed
 *  4. Calculate physical distance
 *  5. Build data object (delegates to calibrationCalculator.js)
 *  6. Create debug overlay (if objecttestdebug)
 *  7. Store data in RC
 *  8. Handle 'both' mode (object + blindspot) or normal mode
 *
 * Legacy: distance.js lines 7493-8224
 *
 * @param {object} context – All state / deps the finish function needs.
 *   See property list below.
 */
export async function finishObjectTest(context) {
  const {
    // Mutable flag – caller must pass an object: { value: false }
    objectTestHasFinishedRef,

    // Keyboard handlers
    handleKeyPress,
    handleInstructionNav,
    handlePaperStepperNav,

    // DOM refs
    buttonContainer,
    instructionsUI,
    tubeCheckTape,
    arrowIndicators,
    globalPointXYPx,
    leftLabel,
    rightLabel,
    container,

    // Overlay helpers (from distanceTrack / locationUtils)
    clearMeasurementOverlay,
    removeBigCircle,
    removeArrowIndicatorsFromDOM,

    // Measurement state
    firstMeasurement,
    startX,
    startY,
    endX,
    endY,
    screenWidth,
    ppi,
    pxPerMm,
    isPaperSelectionMode,
    selectedPaperOption,
    selectedPaperLabel,
    paperSelectionOptions,
    selectedPaperLengthCm,
    paperSuggestionValue,
    intraocularDistanceCm,
    faceMeshSamplesPage3,
    faceMeshSamplesPage4,

    // Tape helper
    tape,

    // Utilities
    toFixedNumber,
    median,
    constructInstructions,
    phrases,

    // Core
    RC,
    options,
    callback,

    // Blindspot
    blindSpotTestNew,

    // objectTest restart (breakFunction uses this)
    objectTest,
  } = context

  // ===================== GUARD: Prevent double execution =====================
  if (objectTestHasFinishedRef.value) {
    console.warn(
      '=== objectTestFinishFunction ALREADY COMPLETED - SKIPPING DUPLICATE CALL ===',
    )
    return
  }
  objectTestHasFinishedRef.value = true
  console.log('=== objectTestFinishFunction STARTING (first and only call) ===')

  // ===================== CLEANUP DOM =====================
  cleanupObjectTestDOM({
    handleKeyPress,
    handleInstructionNav,
    handlePaperStepperNav,
    buttonContainer,
    instructionsUI,
    clearMeasurementOverlay,
    removeBigCircle,
    tubeCheckTape,
    arrowIndicators,
    removeArrowIndicatorsFromDOM,
    globalPointXYPx,
    leftLabel,
    rightLabel,
    options,
  })

  // Null out caller's arrowIndicators ref after cleanup (mirrors legacy mutation)
  // Callers should check arrowIndicators === null after this call.

  // ===================== INITIALIZATION CHECK =====================
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

  // ===================== CALCULATE PHYSICAL DISTANCE =====================
  let objectLengthPx = null
  let objectLengthMm = null
  if (!isPaperSelectionMode) {
    objectLengthPx = tape.helpers.getDistance(startX, startY, endX, endY)
    objectLengthMm = objectLengthPx / pxPerMm

    console.log('=== Object Test Measurement Results ===')
    console.log(`Distance in pixels: ${objectLengthPx.toFixed(2)}px`)
    console.log(`Distance in millimeters: ${objectLengthMm.toFixed(2)}mm`)
    console.log(
      `Distance in centimeters: ${(objectLengthMm / 10).toFixed(2)}cm`,
    )
    console.log('=====================================')
  }

  // ===================== DEBUG: Log all data-object inputs =====================
  console.log('=== DEBUG: FINISH FUNCTION - DATA OBJECT INPUTS ===')
  console.log(
    `  firstMeasurement: ${firstMeasurement} (type: ${typeof firstMeasurement})`,
  )
  console.log(
    `  toFixedNumber(firstMeasurement, 1): ${toFixedNumber(firstMeasurement, 1)}`,
  )
  console.log(
    `  startX: ${startX}, startY: ${startY}, endX: ${endX}, endY: ${endY}`,
  )
  console.log(`  screenWidth: ${screenWidth}`)
  console.log(`  objectLengthPx: ${objectLengthPx}`)
  console.log(`  objectLengthMm: ${objectLengthMm}`)
  console.log(`  ppi: ${ppi}`)
  console.log(`  intraocularDistanceCm: ${intraocularDistanceCm}`)
  console.log(`  faceMeshSamplesPage3: [${faceMeshSamplesPage3.join(', ')}]`)
  console.log(`  faceMeshSamplesPage4: [${faceMeshSamplesPage4.join(', ')}]`)
  console.log(`  RC.page3FactorCmPx: ${RC.page3FactorCmPx}`)
  console.log(`  RC.page4FactorCmPx: ${RC.page4FactorCmPx}`)

  // Check for NaN/null/undefined values that could cause PsychoJS errors
  const criticalValues = [
    { name: 'firstMeasurement', value: firstMeasurement },
    { name: 'startX', value: startX },
    { name: 'startY', value: startY },
    { name: 'endX', value: endX },
    { name: 'endY', value: endY },
    { name: 'screenWidth', value: screenWidth },
    { name: 'objectLengthPx', value: objectLengthPx },
    { name: 'objectLengthMm', value: objectLengthMm },
    { name: 'ppi', value: ppi },
    { name: 'intraocularDistanceCm', value: intraocularDistanceCm },
    { name: 'RC.page3FactorCmPx', value: RC.page3FactorCmPx },
    { name: 'RC.page4FactorCmPx', value: RC.page4FactorCmPx },
  ]
  criticalValues.forEach(({ name, value }) => {
    if (value === null || value === undefined) {
      console.warn(`  ⚠️ WARNING: ${name} is ${value}`)
    } else if (typeof value === 'number' && isNaN(value)) {
      console.error(`  ❌ ERROR: ${name} is NaN!`)
    }
  })

  const nanPage3Count = faceMeshSamplesPage3.filter(s => isNaN(s)).length
  const nanPage4Count = faceMeshSamplesPage4.filter(s => isNaN(s)).length
  if (nanPage3Count > 0)
    console.error(
      `  ❌ ERROR: ${nanPage3Count} NaN values in faceMeshSamplesPage3`,
    )
  if (nanPage4Count > 0)
    console.error(
      `  ❌ ERROR: ${nanPage4Count} NaN values in faceMeshSamplesPage4`,
    )
  console.log('=== END DEBUG ===')

  // ===================== BUILD DATA OBJECT =====================
  const calibrationFactors = calculateCalibrationFactors(
    RC,
    faceMeshSamplesPage3,
    faceMeshSamplesPage4,
  )

  const data = buildCalibrationData({
    firstMeasurementCm: firstMeasurement,
    toFixedNumber,
    startX,
    startY,
    endX,
    endY,
    screenWidthPx: screenWidth,
    objectLengthPx,
    objectLengthMm,
    ppi,
    intraocularDistanceCm,
    faceMeshSamplesPage3,
    faceMeshSamplesPage4,
    isPaperSelectionModeBool: isPaperSelectionMode,
    selectedPaperOption,
    selectedPaperLabel,
    paperSelectionOptions,
    selectedPaperLengthCm,
    paperSuggestionValue,
    calibrationFactors,
  })

  const { distance1FactorCmPx, distance2FactorCmPx } = calibrationFactors

  console.log('=== Object Test Calibration Factors ===')
  console.log('Object distance:', data.value, 'cm')
  console.log(
    'Page 3 valid samples:',
    faceMeshSamplesPage3.filter(s => !isNaN(s)).length,
    '/ 5',
  )
  console.log(
    'Page 4 valid samples:',
    faceMeshSamplesPage4.filter(s => !isNaN(s)).length,
    '/ 5',
  )
  console.log(
    'Page 3 average Face Mesh:',
    calibrationFactors.page3Average,
    'px',
  )
  console.log(
    'Page 4 average Face Mesh:',
    calibrationFactors.page4Average,
    'px',
  )
  console.log('Page 3 calibration factor:', distance1FactorCmPx)
  console.log('Page 4 calibration factor:', distance2FactorCmPx)
  console.log('======================================')

  console.log('=== DATA SANITIZED - Ready for callback ===')

  // ===================== DEBUG OVERLAY =====================
  let feedbackDiv = null
  if (options.objecttestdebug) {
    feedbackDiv = buildDebugOverlay(data, {
      RC,
      ppi,
      faceMeshSamplesPage3,
      faceMeshSamplesPage4,
      distance1FactorCmPx,
      distance2FactorCmPx,
    })
  }

  // ===================== STORE MEASUREMENT DATA =====================
  RC.newObjectTestDistanceData = data
  RC.newViewingDistanceData = data

  console.log('=== DEBUG: DATA STORED IN RC ===')
  console.log(
    'RC.newObjectTestDistanceData keys:',
    Object.keys(RC.newObjectTestDistanceData || {}),
  )
  console.log(
    'RC.newViewingDistanceData keys:',
    Object.keys(RC.newViewingDistanceData || {}),
  )
  console.log('=== END DEBUG ===')

  // ===================== CHECK FUNCTION =====================
  if (options.useObjectTestData === 'both') {
    // 'both' mode: object test + blindspot combined
    RC._removeBackground()

    document.removeEventListener('keydown', handleKeyPress)
    document.removeEventListener('keyup', handleKeyPress)

    setTimeout(() => {
      RC._addBackground()

      RC._replaceBackground(
        constructInstructions(
          `${phrases.RC_distanceTrackingTitle[RC.L]}`,
          null,
          true,
          '',
        ),
      )

      blindSpotTestNew(RC, options, true, async blindspotData => {
        const objectCalibrationFactor = data.calibrationFactor
        const blindspotCalibrationFactor = blindspotData.calibrationFactor

        console.log('=== Combined Test Calibration Factors ===')
        console.log('Object test calibration factor:', objectCalibrationFactor)
        console.log(
          'Blindspot test calibration factor:',
          blindspotCalibrationFactor,
        )

        const medianCalibrationFactor = median([
          objectCalibrationFactor,
          blindspotCalibrationFactor,
        ])

        console.log('Median calibration factor:', medianCalibrationFactor)
        console.log('=========================================')

        const medianData = {
          value: data.value,
          timestamp: Date.now(),
          method: 'both',
          calibrationFactor: medianCalibrationFactor,
          averageFaceMesh: data.averageFaceMesh,
          faceMeshSamplesPage3: faceMeshSamplesPage3.map(sample =>
            isNaN(sample) ? sample : Math.round(sample),
          ),
          faceMeshSamplesPage4: faceMeshSamplesPage4.map(sample =>
            isNaN(sample) ? sample : Math.round(sample),
          ),

          raw: {
            object: data,
            blindspot: blindspotData,
            objectCalibrationFactor,
            blindspotCalibrationFactor,
            medianCalibrationFactor,
          },
        }

        // Update feedback for combined measurement
        if (options.objecttestdebug && feedbackDiv) {
          const geometricCalcHtml = buildGeometricCalcHtml(RC, ppi)

          feedbackDiv.innerHTML = `
                    <div style="position: absolute; top: 5px; right: 5px; cursor: pointer; font-weight: bold; font-size: 16px; color: #666;" onclick="this.parentElement.remove()">×</div>
                    <div style="margin-top: 10px; font-weight: bold;">Object + Blindspot Combined Calibration Debug</div>
                    <div>pxPerCm = ${(ppi / 2.54).toFixed(1)}</div>
                    <div>distanceObjectCm = ${data.value.toFixed(1)}</div>
                    <div style="margin-top: 5px; border-top: 1px solid #eee; padding-top: 5px;">
                    <div>distance1InterpupillaryPx = ${faceMeshSamplesPage3.map(sample => (isNaN(sample) ? 'NaN' : Math.round(sample))).join(', ')}</div>
                      <div>distance1FactorCmPx (Page 3) = ${distance1FactorCmPx}</div>
                    <div>distance2InterpupillaryPx = ${faceMeshSamplesPage4.map(sample => (isNaN(sample) ? 'NaN' : Math.round(sample))).join(', ')}</div>
                      <div>distance2FactorCmPx (Page 4) = ${distance2FactorCmPx}</div>
                      <div style="margin-top: 5px;">blindspotCalibrationFactor = ${blindspotCalibrationFactor.toFixed(1)}</div>
                    <div>AverageCombinedCalibrationFactor = ${medianCalibrationFactor.toFixed(1)}</div>
                    </div>
                    ${geometricCalcHtml}
                `
        }

        RC.newObjectTestDistanceData = medianData
        RC.newViewingDistanceData = medianData

        if (options.calibrateDistanceCheckBool) {
          RC._showPutGlassesBackOn = true
          cleanupBeforeCheckDistance(context)
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
          )
        } else {
          await showPutGlassesBackOnScreen(RC)
          if (typeof callback === 'function') {
            callback(data)
          }
        }

        RC._removeBackground()
      })
    }, BLINDSPOT_TRANSITION_DELAY_MS)
  } else {
    // Normal mode (not 'both')
    if (options.calibrateDistanceCheckBool) {
      console.log('=== DEBUG: DATA BEING PASSED TO _checkDistance ===')
      console.log('Data keys:', Object.keys(data))
      console.log('Critical values:')
      console.log('  data.value:', data.value)
      console.log('  data.calibrationFactor:', data.calibrationFactor)
      console.log('  data.distance1FactorCmPx:', data.distance1FactorCmPx)
      console.log('  data.distance2FactorCmPx:', data.distance2FactorCmPx)
      console.log('  data.faceMeshSamplesPage3:', data.faceMeshSamplesPage3)
      console.log('  data.faceMeshSamplesPage4:', data.faceMeshSamplesPage4)
      console.log('  data.intraocularDistanceCm:', data.intraocularDistanceCm)
      console.log('  data.method:', data.method)
      console.log('  data.raw:', data.raw)

      checkForProblems(data)
      console.log('=== END DEBUG ===')

      RC._showPutGlassesBackOn = true
      cleanupBeforeCheckDistance(context)
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
        options.saveSnapshots,
        options.calibrateDistanceCheckMinRulerCm,
      )
    } else {
      console.log('=== DEBUG: FINAL DATA OBJECT BEING PASSED TO CALLBACK ===')
      console.log('Data keys:', Object.keys(data))
      console.log(
        'Full data object:',
        JSON.stringify(
          data,
          (key, value) => {
            if (typeof value === 'number') {
              if (isNaN(value)) return 'NaN'
              if (!isFinite(value)) return value > 0 ? 'Infinity' : '-Infinity'
            }
            return value
          },
          2,
        ),
      )

      checkForProblems(data)
      console.log('=== END DEBUG ===')

      await showPutGlassesBackOnScreen(RC)

      if (typeof callback === 'function') {
        callback(data)
      }
    }

    RC._removeBackground()

    console.log(
      '=== DEBUG: objectTestFinishFunction COMPLETED SUCCESSFULLY ===',
    )
    console.log(
      'Remote-calibrator has finished. Any errors after this are from PsychoJS/EasyEyes.',
    )
  }
}

// ---------------------------------------------------------------------------
// cleanupBeforeCheckDistance  (internal helper)
// ---------------------------------------------------------------------------

/**
 * Remove arrow indicators, stepper, button container, paper-mode elements,
 * and paper stepper keyboard listener before transitioning to _checkDistance.
 *
 * Legacy: distance.js lines 4458-4486
 */
function cleanupBeforeCheckDistance(context) {
  const {
    removeArrowIndicatorsFromDOM,
    instructionsUI,
    buttonContainer,
    container,
    handlePaperStepperNav,
  } = context

  removeArrowIndicatorsFromDOM()

  if (instructionsUI?.destroy) {
    instructionsUI.destroy()
  }
  // Remove ALL viewport-positioned stepper media containers from document.body
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
}

// ---------------------------------------------------------------------------
// cleanupAllResources
// ---------------------------------------------------------------------------

/**
 * Full teardown of the object test: keyboard, DOM, resize listeners, and
 * background.  Combines the legacy `cleanupObjectTest` (lines 8226-8288)
 * and `breakFunction` (lines 8290-8324) cleanup portions.
 *
 * Legacy: distance.js lines 8226-8288
 *
 * @param {object} context
 * @param {Function}   context.handleKeyPress
 * @param {Function}   context.handleInstructionNav
 * @param {Function}   context.handlePaperStepperNav
 * @param {Function|null} context.removeKeypadHandler
 * @param {Function|null} context.updateDiagonalTapeOnResize
 * @param {Function|null} context.reflowInstructionsOnResize
 * @param {object}     context.leftLabel
 * @param {object}     context.rightLabel
 * @param {HTMLElement|null} context.container
 * @param {HTMLElement|null} context.buttonContainer
 * @param {object|null} context.instructionsUI
 * @param {Function}   context.clearMeasurementOverlay
 * @param {Function}   context.removeBigCircle
 * @param {object}     context.RC
 */
export function cleanupAllResources(context) {
  const {
    handleKeyPress,
    handleInstructionNav,
    handlePaperStepperNav,
    removeKeypadHandler,
    updateDiagonalTapeOnResize,
    reflowInstructionsOnResize,
    leftLabel,
    rightLabel,
    container,
    buttonContainer,
    instructionsUI,
    clearMeasurementOverlay,
    removeBigCircle,
    RC,
  } = context

  // Clean up keyboard event listeners
  document.removeEventListener('keydown', handleKeyPress)
  document.removeEventListener('keyup', handleKeyPress)
  document.removeEventListener('keydown', handleInstructionNav)
  document.removeEventListener('keydown', handlePaperStepperNav)

  // Clean up keypad handler
  if (removeKeypadHandler) {
    removeKeypadHandler()
  }

  // Clean up resize event listener (same as checkDistance.js)
  window.removeEventListener('resize', updateDiagonalTapeOnResize)
  // Remove instructions reflow listener if present
  if (typeof reflowInstructionsOnResize === 'function') {
    window.removeEventListener('resize', reflowInstructionsOnResize)
  }

  // Clean up label elements explicitly
  if (leftLabel.container.parentNode) {
    leftLabel.container.parentNode.removeChild(leftLabel.container)
  }
  if (rightLabel.container.parentNode) {
    rightLabel.container.parentNode.removeChild(rightLabel.container)
  }

  // Clean up any remaining DOM elements
  if (container && container.parentNode) {
    container.parentNode.removeChild(container)
  }
  if (buttonContainer && buttonContainer.parentNode) {
    buttonContainer.parentNode.removeChild(buttonContainer)
  }
  // Remove stepper UI (including viewport-positioned media container)
  if (instructionsUI?.destroy) {
    instructionsUI.destroy()
  }

  // Remove paper-mode elements appended to document.body
  const rulerNote = document.getElementById('paper-dont-use-ruler-note')
  if (rulerNote && rulerNote.parentNode) {
    rulerNote.parentNode.removeChild(rulerNote)
  }
  const rulerColumn = document.getElementById('dont-use-ruler-column')
  if (rulerColumn && rulerColumn.parentNode) {
    rulerColumn.parentNode.removeChild(rulerColumn)
  }

  // Clear measurement overlay (eye-side text + tube circles) and big circle
  clearMeasurementOverlay()
  removeBigCircle()

  // Clean up background
  RC._removeBackground()
}

/**
 * Break and restart the object test.
 * Reproduces legacy distance.js L8290-8324 (breakFunction).
 *
 * Performs a lighter cleanup than cleanupAllResources (no instructionsUI
 * destroy, no container removal), then restarts by calling objectTest again.
 *
 * @param {object} context
 * @param {function} objectTestFn - The objectTest function to call for restart
 */
export function breakAndRestart(context, objectTestFn) {
  const {
    RC,
    options,
    callback,
    handleKeyPress,
    handleInstructionNav,
    handlePaperStepperNav,
    updateDiagonalTapeOnResize,
    clearMeasurementOverlay,
    removeBigCircle,
    leftLabel,
    rightLabel,
    buttonContainer,
  } = context

  document.removeEventListener('keydown', handleKeyPress)
  document.removeEventListener('keyup', handleKeyPress)
  document.removeEventListener('keydown', handleInstructionNav)
  document.removeEventListener('keydown', handlePaperStepperNav)

  clearMeasurementOverlay()
  removeBigCircle()

  window.removeEventListener('resize', updateDiagonalTapeOnResize)

  if (leftLabel?.container?.parentNode) {
    leftLabel.container.parentNode.removeChild(leftLabel.container)
  }
  if (rightLabel?.container?.parentNode) {
    rightLabel.container.parentNode.removeChild(rightLabel.container)
  }
  if (buttonContainer?.parentNode) {
    buttonContainer.parentNode.removeChild(buttonContainer)
  }

  objectTestFn(RC, options, callback)
}
