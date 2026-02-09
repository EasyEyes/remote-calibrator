import isEqual from 'react-fast-compare'
import Swal from 'sweetalert2'

import RemoteCalibrator from './core'
import {
  toFixedNumber,
  blurAll,
  remap,
  safeExecuteFunc,
  forceFullscreen,
  enforceFullscreenOnSpacePress,
  isFullscreen,
} from './components/utils'

import Card from './media/card.svg'
import Arrow from './media/arrow.svg'
import USBA from './media/usba.svg'
import USBC from './media/usbc.svg'

import {
  createSlider,
  setSliderPosition,
  setSliderStyle,
} from './components/slider'
import { bindKeys, unbindKeys } from './components/keyBinder'
import { addButtons } from './components/buttons'
import { phrases } from './i18n/schema'
import { processInlineFormatting } from './distance/markdownInstructionParser'
import { setUpEasyEyesKeypadHandler } from './extensions/keypadHandler'
import { swalInfoOptions } from './components/swalOptions'
import { showPauseBeforeNewObject } from './distance/distance'

RemoteCalibrator.prototype._displaySize = function (forInit = false) {
  ////
  if (!forInit && !this.checkInitialized()) return
  ////

  const thisData = {
    value: {
      displayWidthPx: screen.width,
      displayHeightPx: screen.height,
      windowWidthPx: window.innerWidth,
      windowHeightPx: window.innerHeight,
    },
    timestamp: performance.now(),
  }

  if (
    !this.displayData.length ||
    !isEqual(
      thisData.value,
      this.displayData[this.displayData.length - 1].value,
    )
  )
    this.newDisplayData = thisData
}

const resources = {
  card: Card,
  arrow: Arrow,
  usba: USBA,
  usbc: USBC,
}

const widthDataIn = {
  card: 3.375, // 85.6mm
  usba: 0.787402, // 20mm (12mm head)
  usbc: 0.787402, // 20mm (8.25mm head)
}

// Create size scale distribution for randomization
// Generates scale factors from 0.6 to 0.95 and 1.053 to 1.667 (excludes 0.95-1.05 zone)
function createSizeScaleDistribution() {
  const delta = 0.05
  const step = 0.01
  const min = 0.6
  const distribution = []

  // Distribution from min to (1 - delta)
  for (let x = min; x <= 1 - delta + 1e-9; x += step) {
    distribution.push(x)
  }

  // Distribution from 1/(1 - delta) to 1/min
  const n = distribution.length
  for (let i = 0; i < n; i++) {
    distribution.push(1 / distribution[i])
  }

  return distribution
}

// Create the distribution once at module level
const sizeScaleDistribution = createSizeScaleDistribution()

RemoteCalibrator.prototype.screenSize = function (
  screenSizeOptions = {},
  callback = undefined,
) {
  /**
   *
   * options -
   *
   * fullscreen: [Boolean]
   * repeatTesting: 1 // TODO
   * decimalPlace: [Number] Default 1
   * headline: [String]
   * description: [String]
   *
   */
  ////
  if (!this.checkInitialized()) return
  blurAll()
  ////

  const options = Object.assign(
    {
      fullscreen: false,
      repeatTesting: 1,
      screenSizeMeasurementCount: 2, // Number of repeated measurements
      screenSizeConsistencyThreshold: 1.03, // Ratio threshold - last two measurements must satisfy max(M1/M2, M2/M1) <= threshold
      decimalPlace: 1,
      defaultObject: 'card', // Can be card, usba, usbc
      headline: `${phrases.RC_screenSizeTitleN[this.L]}`, // Will be overridden with RC_screenSizeTitleN
      description: phrases.RC_screenSizeIntro[this.L],
      check: false,
      checkCallback: null,
    },
    screenSizeOptions,
  )

  // Force fullscreen unconditionally on Size page arrival
  forceFullscreen(this.L, this)

  // Validate and normalize screenSizeMeasurementCount
  if (
    typeof options.screenSizeMeasurementCount !== 'number' ||
    isNaN(options.screenSizeMeasurementCount) ||
    options.screenSizeMeasurementCount < 1
  ) {
    console.warn(
      `Invalid screenSizeMeasurementCount: ${options.screenSizeMeasurementCount}. Using default value of 2.`,
    )
    options.screenSizeMeasurementCount = 2
  }
  options.screenSizeMeasurementCount = Math.max(
    1,
    Math.floor(options.screenSizeMeasurementCount),
  )

  // Set initial headline with progress indicator (1 of N)
  options.headline =
    phrases.RC_screenSizeTitleN?.[this.L]
      ?.replace('[[N1]]', '1')
      ?.replace('[[N2]]', options.screenSizeMeasurementCount.toString()) ||
    `${phrases.RC_screenSizeTitle[this.L]} (1/${options.screenSizeMeasurementCount})`

  if (!['usba', 'usbc', 'card'].includes(options.defaultObject))
    options.defaultObject = 'card'

  options.description += `<br /><br /><b class="rc-size-obj-selection">${phrases.RC_screenSizeHave[
    this.L
  ].replace(
    '[[xxx]]',
    `<select id="matching-obj"><option value="usba"${
      options.defaultObject === 'usba' ? ' selected' : ''
    }>${phrases.RC_screenSizeUSBA[this.L]}</option><option value="usbc"${
      options.defaultObject === 'usbc' ? ' selected' : ''
    }>${phrases.RC_screenSizeUSBC[this.L]}</option><option value="card"${
      options.defaultObject === 'card' ? ' selected' : ''
    }>${phrases.RC_screenSizeCreditCard[this.L]}</option></select>`,
  )}</b>`

  this._addBackground()
  this._addBackgroundText(options.headline, options.description)
  this._addCreditOnBackground(phrases.RC_screenSizeCredit[this.L])

  getSize(this, this.background, options, callback)

  return
}

function getSize(RC, parent, options, callback) {
  // Initialize measurement tracking
  const measurementState = {
    currentIteration: 1,
    totalIterations: Math.max(
      1,
      Math.floor(options.screenSizeMeasurementCount || 1),
    ),
    measurements: [], // Store all individual measurements
    consistentPair: null, // Will store the indices of 2 consistent measurements
    previousCardWidth: null, // Track previous iteration's actual card width
    originalCardLeftPosition: null, // Track original left position from first iteration
    rejectionCount: 0, // Track number of times user has been rejected for mismatched measurements
  }

  // Start the measurement loop
  performMeasurement(RC, parent, options, callback, measurementState)
}

// Helper function to check if the last 2 consecutive measurements are consistent
// Uses log10 ratio comparison: abs(log10(newPxPerCm/oldPxPerCm)) > log10(threshold)
function checkLastTwoMeasurements(measurements, threshold) {
  // Need at least 2 measurements to compare
  if (measurements.length < 2) return null

  // Get the last two measurements
  const lastIdx = measurements.length - 1
  const secondLastIdx = measurements.length - 2

  const M1 = measurements[secondLastIdx].ppi // oldPxPerCm (as PPI)
  const M2 = measurements[lastIdx].ppi // newPxPerCm (as PPI)

  // Calculate using log10 ratio: abs(log10(M2/M1)) <= log10(threshold)
  // Test passes if logRatio <= logThreshold
  const logRatio = Math.abs(Math.log10(M2 / M1))
  const logThreshold = Math.log10(threshold)

  if (logRatio <= logThreshold) {
    // Found consistent last two measurements!
    return { indices: [secondLastIdx, lastIdx], ppis: [M1, M2] }
  }

  return null // Last two measurements are not consistent
}

function performMeasurement(RC, parent, options, callback, measurementState) {
  // Update headline to show progress dynamically as measurements continue
  // Shows "1 of 2", "2 of 2", "3 of 3", "4 of 4", etc.
  const currentMeasurement = measurementState.currentIteration
  const totalShown = Math.max(
    currentMeasurement,
    measurementState.totalIterations,
  )

  const progressText =
    phrases.RC_screenSizeTitleN?.[RC.L]
      ?.replace('[[N1]]', currentMeasurement.toString())
      ?.replace('[[N2]]', totalShown.toString()) ||
    `${phrases.RC_screenSizeTitle[RC.L]} (${currentMeasurement}/${totalShown})`

  // Update the title element (constructed by constructInstructions)
  const headlineElement = parent.querySelector('#instruction-title')
  if (headlineElement) {
    headlineElement.textContent = progressText
    console.log(`Updated title to: ${progressText}`)
  } else {
    console.warn('Could not find #instruction-title element to update')
  }

  // Update the instruction body text for iterations after the first one
  if (measurementState.currentIteration > 1) {
    const bodyElement = parent.querySelector('#instruction-body')
    if (bodyElement) {
      // For subsequent iterations, use RC_screenSizeContinue instead of RC_screenSizeIntro
      const continueDescription =
        phrases.RC_screenSizeContinue?.[RC.L] ||
        phrases.RC_screenSizeIntro[RC.L]

      // Add the object selection dropdown to the continue text
      const fullDescription =
        continueDescription +
        `<br /><br /><b class="rc-size-obj-selection">${phrases.RC_screenSizeHave[
          RC.L
        ].replace(
          '[[xxx]]',
          `<select id="matching-obj"><option value="usba"${
            options.defaultObject === 'usba' ? ' selected' : ''
          }>${phrases.RC_screenSizeUSBA[RC.L]}</option><option value="usbc"${
            options.defaultObject === 'usbc' ? ' selected' : ''
          }>${phrases.RC_screenSizeUSBC[RC.L]}</option><option value="card"${
            options.defaultObject === 'card' ? ' selected' : ''
          }>${phrases.RC_screenSizeCreditCard[RC.L]}</option></select>`,
        )}</b>`

      bodyElement.innerHTML = fullDescription
      console.log(
        `Updated body text for iteration ${measurementState.currentIteration}`,
      )
    }
  }

  // Slider with random initial position
  const sliderElement = createSlider(parent, 0, 100)

  // Generate random offsets ONLY for measurements after the first one
  let randomHorizontalOffset = 0 // Default: no horizontal offset
  let appliedHorizontalOffset = 0 // Store the actual constrained offset that was applied

  if (
    measurementState.currentIteration > 1 &&
    measurementState.previousCardWidth
  ) {
    // Random horizontal offset: between 0px and +200px (only positive, moving right)
    randomHorizontalOffset = Math.random() * 200 // 0 to +200

    // Card width formula: cardWidth = ((sliderWidth - 30) * (sliderValue / 100) * mobileFactor + 15)
    const mobileFactor = window.innerWidth < 480 ? 2 : 1
    const sliderWidth = sliderElement.offsetWidth || window.innerWidth * 0.8

    // Calculate what scale factors are achievable with slider 0-100
    const maxAchievableWidth =
      (sliderWidth - 30) * (100 / 100) * mobileFactor + 15
    const minAchievableWidth =
      (sliderWidth - 30) * (0 / 100) * mobileFactor + 15
    const maxAchievableFactor =
      maxAchievableWidth / measurementState.previousCardWidth
    const minAchievableFactor =
      minAchievableWidth / measurementState.previousCardWidth

    // Filter distribution to only achievable scale factors
    const achievableFactors = sizeScaleDistribution.filter(
      f => f >= minAchievableFactor && f <= maxAchievableFactor,
    )

    // Pick random scale factor from filtered distribution
    const scaleFactor =
      achievableFactors[Math.floor(Math.random() * achievableFactors.length)]
    const targetCardWidth = measurementState.previousCardWidth * scaleFactor

    // Solve for slider value to achieve this target card width
    const newSliderValue = Math.max(
      0,
      Math.min(
        100,
        ((targetCardWidth - 15) / mobileFactor / (sliderWidth - 30)) * 100,
      ),
    )

    sliderElement.value = newSliderValue
    setSliderStyle(sliderElement)

    // Store intended values for logging and validation after slider positioning
    measurementState._randomizationData = {
      prevCard: measurementState.previousCardWidth,
      scaleFactor: scaleFactor,
      sliderValue: newSliderValue,
      achievableFactors: achievableFactors,
      randomHorizontalOffset: randomHorizontalOffset,
    }
  }

  const _onDown = (e, type) => {
    if (
      e.target.className === 'rc-slider' &&
      e.target.id === 'rc-size-slider' &&
      ((type === RC._CONST.S.CLICK_TYPE.MOUSE && e.which === 1) ||
        type === RC._CONST.S.CLICK_TYPE.TOUCH)
    ) {
      e.target.style.cursor = 'grabbing'
      arrowFillElement.setAttribute('fill', RC._CONST.COLOR.ORANGE)
      const _onEnd = () => {
        sliderElement.style.cursor = 'grab'
        arrowFillElement.setAttribute('fill', RC._CONST.COLOR.LIGHT_GREY)
        document.removeEventListener('mouseup', _onEnd, false)
      }
      if (type === RC._CONST.S.CLICK_TYPE.MOUSE)
        document.addEventListener('mouseup', _onEnd, false)
      else if (type === RC._CONST.S.CLICK_TYPE.TOUCH)
        document.addEventListener('touchend', _onEnd, false)
    }
  }

  const onMouseDown = e => {
    _onDown(e, 'mouse')
  }
  const onTouchStart = e => {
    _onDown(e, 'touch')
  }
  document.addEventListener('mousedown', onMouseDown, false)
  document.addEventListener('touchstart', onTouchStart, false)

  // Add all objects
  const elements = addMatchingObj(['card', 'arrow', 'usba', 'usbc'], parent)

  // Apply horizontal offset to slider and objects together (only for iterations > 1)
  if (measurementState.currentIteration > 1 && randomHorizontalOffset !== 0) {
    // Get current card position to constrain the offset
    const cardElement = elements.card || elements.usba || elements.usbc
    const cardRect = cardElement ? cardElement.getBoundingClientRect() : null

    if (cardRect) {
      // Since offset is always positive (moving right), no left boundary check needed
      appliedHorizontalOffset = randomHorizontalOffset

      console.log(
        `Applying horizontal offset: ${appliedHorizontalOffset.toFixed(1)}px`,
      )

      // Get slider rect BEFORE applying transform to get original dimensions
      const sliderRect = sliderElement.getBoundingClientRect()
      const originalSliderWidth = sliderRect.width
      const sliderLeftAfterOffset = sliderRect.left + appliedHorizontalOffset
      const sliderRightAfterOffset = sliderRect.right + appliedHorizontalOffset
      const screenWidth = window.innerWidth
      const rightMargin = 30 // Consistent 30px margin on the right

      // Check if slider right edge would go beyond screen width - 30px with this offset
      if (sliderRightAfterOffset > screenWidth - rightMargin) {
        // Shrink slider width to maintain 30px right margin
        const maxAllowedWidth =
          screenWidth - rightMargin - sliderLeftAfterOffset
        sliderElement.style.width = `${maxAllowedWidth}px`
        console.log(
          `Shrinking slider: originalWidth=${originalSliderWidth.toFixed(1)}px, newWidth=${maxAllowedWidth.toFixed(1)}px, rightEdgeAt=${(screenWidth - rightMargin).toFixed(1)}px`,
        )
      }

      // Apply offset to slider AFTER width adjustment
      sliderElement.style.transform = `translateX(${appliedHorizontalOffset}px)`

      // Apply same constrained offset to objects
      for (const i in elements) {
        if (i === 'card' || i === 'usba' || i === 'usbc') {
          elements[i].style.transform =
            `translateX(${appliedHorizontalOffset}px)`
        }
      }
    }
  }

  // Validate and retry if actual ratio falls in excluded zone (if randomized)
  if (measurementState._randomizationData) {
    const data = measurementState._randomizationData
    const mobileFactor = window.innerWidth < 480 ? 2 : 1
    const finalSliderWidth =
      sliderElement.offsetWidth || sliderElement.getBoundingClientRect().width
    let actualCardWidth =
      (finalSliderWidth - 30) * (data.sliderValue / 100) * mobileFactor + 15
    let actualRatio = actualCardWidth / data.prevCard

    // Excluded zone check: 0.95 < ratio < 1.05
    const excludedMin = 0.95
    const excludedMax = 1.05
    let retryCount = 0
    const maxRetries = 20

    while (
      actualRatio > excludedMin &&
      actualRatio < excludedMax &&
      retryCount < maxRetries
    ) {
      retryCount++
      console.log(
        `Retry ${retryCount}: actualRatio ${actualRatio.toFixed(3)} in excluded zone [${excludedMin}, ${excludedMax}], picking new scaleFactor...`,
      )

      // Pick a new random scale factor
      const newScaleFactor =
        data.achievableFactors[
          Math.floor(Math.random() * data.achievableFactors.length)
        ]
      const newTargetWidth = data.prevCard * newScaleFactor
      const newSliderValue = Math.max(
        0,
        Math.min(
          100,
          ((newTargetWidth - 15) /
            mobileFactor /
            (sliderElement.offsetWidth - 30)) *
            100,
        ),
      )

      // Update slider
      sliderElement.value = newSliderValue
      setSliderStyle(sliderElement)

      // Recalculate actual card width
      const updatedSliderWidth =
        sliderElement.offsetWidth || sliderElement.getBoundingClientRect().width
      actualCardWidth =
        (updatedSliderWidth - 30) * (newSliderValue / 100) * mobileFactor + 15
      actualRatio = actualCardWidth / data.prevCard

      // Update stored data for logging
      data.scaleFactor = newScaleFactor
      data.sliderValue = newSliderValue
    }

    if (retryCount >= maxRetries) {
      console.warn(
        `Reached max retries (${maxRetries}) without escaping excluded zone. Using current ratio: ${actualRatio.toFixed(3)}`,
      )
    } else if (retryCount > 0) {
      console.log(
        `Success after ${retryCount} retries: actualRatio ${actualRatio.toFixed(3)} outside excluded zone`,
      )
    }

    // Log final result
    console.log(
      `Randomization: prevCard=${data.prevCard.toFixed(1)}px, newCard=${actualCardWidth.toFixed(1)}px, scaleFactor=${data.scaleFactor.toFixed(2)}x, actualRatio=${actualRatio.toFixed(2)}x, slider=${data.sliderValue.toFixed(1)}%`,
    )
    delete measurementState._randomizationData // Clean up
  }

  // Switch OBJ
  let currentMatchingObj = options.defaultObject // DEFAULT
  document.getElementById('matching-obj').addEventListener('change', e => {
    switchMatchingObj(e.target.value, elements, setSizes)
    currentMatchingObj = e.target.value
  })

  switchMatchingObj('card', elements)
  // Card & Arrow
  const arrowFillElement = document.getElementById('size-arrow-fill')
  arrowFillElement.setAttribute('fill', RC._CONST.COLOR.LIGHT_GREY)
  const arrowSizes = {
    width: elements.arrow.getBoundingClientRect().width,
    height: elements.arrow.getBoundingClientRect().height,
  }

  const setSizes = () => {
    setCardSizes(RC, sliderElement, elements.card, elements.arrow, arrowSizes)
    setConnectorSizes(sliderElement, elements.usba)
    setConnectorSizes(sliderElement, elements.usbc)
  }

  setSizes()

  // Add "please measure carefully" text below slider (never moves horizontally)
  const measureText = document.createElement('div')
  // Support markdown formatting in instruction text
  measureText.innerHTML = processInlineFormatting(
    phrases.RC_screenSizeMatters?.[RC.L] || '',
  )
  measureText.style.position = 'absolute'
  measureText.style.left = '50%' // Start at center of screen
  measureText.style.width = 'calc(50% - 2rem)' // Extend from center to right margin
  measureText.style.color = 'black'
  measureText.style.fontSize = '18pt'
  measureText.style.fontWeight = '500'
  measureText.style.textAlign = 'left'
  measureText.style.zIndex = '1' // Lower z-index so elements appear above text
  measureText.className = 'rc-measure-text'
  measureText.id = 'rc-measure-text'
  parent.appendChild(measureText)

  // Position the text below the slider using same logic as setObjectsPosition
  const positionMeasureText = () => {
    measureText.style.top = `${sliderElement.getBoundingClientRect().top + 50}px`
    //console.log('Positioning measure text at:', measureText.style.top, 'Visible:', measureText.style.visibility)
  }

  // Initial positioning
  positionMeasureText()

  const onSliderInput = () => {
    setSliderStyle(sliderElement)
    setSizes()
  }
  const resizeObserver = new ResizeObserver(() => {
    setSizes()
    setSliderPosition(sliderElement, parent)
    setObjectsPosition(elements, sliderElement)
    // Reapply horizontal offset to slider and objects
    if (appliedHorizontalOffset !== 0) {
      // Get slider rect WITHOUT transform to get base dimensions
      sliderElement.style.transform = ''
      const sliderRect = sliderElement.getBoundingClientRect()
      const sliderLeftAfterOffset = sliderRect.left + appliedHorizontalOffset
      const sliderRightAfterOffset = sliderRect.right + appliedHorizontalOffset
      const screenWidth = window.innerWidth
      const rightMargin = 30 // Consistent 30px margin on the right

      // Check if slider needs to be shrunk
      if (sliderRightAfterOffset > screenWidth - rightMargin) {
        // Shrink slider width to maintain 30px right margin
        const maxAllowedWidth =
          screenWidth - rightMargin - sliderLeftAfterOffset
        sliderElement.style.width = `${maxAllowedWidth}px`
      }

      // Apply offset AFTER width adjustment
      sliderElement.style.transform = `translateX(${appliedHorizontalOffset}px)`

      for (const i in elements) {
        if (i === 'card' || i === 'usba' || i === 'usbc') {
          elements[i].style.transform =
            `translateX(${appliedHorizontalOffset}px)`
        }
      }
    }
    positionMeasureText()
  })
  resizeObserver.observe(parent)

  // Dynamic step size keyboard handling for arrow keys
  let arrowKeyDown = false
  let arrowIntervalFunction = null
  let currentArrowKey = null
  let intervalCount = 0 // Track how many intervals have fired

  const arrowDownFunction = e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault() // Prevent default slider behavior
    if (arrowKeyDown) return

    arrowKeyDown = true
    currentArrowKey = e.key
    intervalCount = 0 // Reset counter for new key press

    if (arrowIntervalFunction) {
      clearInterval(arrowIntervalFunction)
    }

    // Calculate dynamic step size based on whether key is being held
    const calculateStepSize = () => {
      // If held for more than 3 intervals (~150ms), switch to fast movement
      if (intervalCount > 3) {
        return 1.0 // 1% for held keys (fast approach)
      }
      return 0.1 // 0.1% for taps (precise adjustment)
    }

    arrowIntervalFunction = setInterval(() => {
      intervalCount++
      const stepSize = calculateStepSize()
      const currentValue = parseFloat(sliderElement.value)

      if (currentArrowKey === 'ArrowLeft') {
        sliderElement.value = Math.max(0, currentValue - stepSize)
      } else if (currentArrowKey === 'ArrowRight') {
        sliderElement.value = Math.min(100, currentValue + stepSize)
      }

      // Trigger slider update
      onSliderInput()
    }, 50)
  }

  const arrowUpFunction = e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
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

  const removeKeypadHandler = setUpEasyEyesKeypadHandler(
    null,
    RC.keypadHandler,
    () => {
      finishFunction() // ! Finish
    },
    false,
    ['return', 'space'],
    RC,
  )

  // Call when ESC pressed
  const breakFunction = () => {
    document.removeEventListener('mousedown', onMouseDown, false)
    document.removeEventListener('touchstart', onTouchStart, false)
    document.removeEventListener('input', onSliderInput, false)
    document.removeEventListener('keydown', arrowDownFunction)
    document.removeEventListener('keyup', arrowUpFunction)
    if (arrowIntervalFunction) {
      clearInterval(arrowIntervalFunction)
    }
    resizeObserver.unobserve(parent)
    RC._removeBackground()
    removeKeypadHandler()

    // Remove the measure text
    const measureTextElement = document.getElementById('rc-measure-text')
    if (measureTextElement && measureTextElement.parentNode) {
      measureTextElement.parentNode.removeChild(measureTextElement)
    }

    // Unbind keys
    unbindKeys(bindKeysFunction)
  }

  // Call when SPACE pressed
  // ! RETURN & BREAK
  const finishFunction = async () => {
    // Enforce fullscreen - if not in fullscreen, force it, wait 4 seconds, and ignore this key press
    const canProceed = await enforceFullscreenOnSpacePress(RC.L, RC)
    if (!canProceed) {
      // Key press flushed - not in fullscreen, now in fullscreen after 4 second wait
      // Wait for a new key press (do nothing, just return)
      return
    }

    //play stamp of approval sound
    const soundModule = require('./components/sound')
    const stampOfApprovalSound = soundModule.stampOfApprovalSound
    stampOfApprovalSound()

    const eleWidth =
      elements[currentMatchingObj].getBoundingClientRect().width ||
      Number.parseInt(elements[currentMatchingObj].style.width) // Pixel

    const ppi = eleWidth / widthDataIn[currentMatchingObj]

    const toFixedN = options.decimalPlace

    // Store this measurement
    measurementState.measurements.push({
      ppi: ppi,
      object: currentMatchingObj,
      timestamp: performance.now(),
    })

    // Store actual card width for next iteration's size constraint
    measurementState.previousCardWidth = eleWidth

    // Store original card left position from first iteration
    if (
      measurementState.currentIteration === 1 &&
      measurementState.originalCardLeftPosition === null
    ) {
      measurementState.originalCardLeftPosition =
        elements[currentMatchingObj].getBoundingClientRect().left
      console.log(
        `Stored original card left position: ${measurementState.originalCardLeftPosition}px`,
      )
    }

    // If only 1 measurement requested, return immediately without consistency check
    if (measurementState.totalIterations === 1) {
      const screenData = _getSingleMeasurementData(
        measurementState.measurements[0],
        toFixedN,
      )

      RC.newScreenData = screenData
      const singlePxPerCm = toFixedNumber(
        measurementState.measurements[0].ppi / 2.54,
        1,
      )
      RC.screenSizeMeasurements = {
        pxPerCm: [singlePxPerCm],
        chosen: [singlePxPerCm],
        mean: singlePxPerCm,
      }
      breakFunction()

      if (options.check)
        RC._checkScreenSize(callback, screenData, options.checkCallback)
      else safeExecuteFunc(callback, screenData)

      return
    }

    // Check if we need more measurements to reach minimum count
    if (measurementState.currentIteration < measurementState.totalIterations) {
      // More measurements needed - clean up current UI and restart
      cleanupMeasurement()

      // Increment iteration counter
      measurementState.currentIteration++

      // Restart measurement with same parent and options
      performMeasurement(RC, parent, options, callback, measurementState)
      return
    }

    // We've done minimum N measurements - now check for consistency of last 2
    if (measurementState.measurements.length > 1) {
      const consistentPair = checkLastTwoMeasurements(
        measurementState.measurements,
        options.screenSizeConsistencyThreshold,
      )

      if (consistentPair) {
        // Found 2 consistent measurements! Calculate data and finish
        measurementState.consistentPair = consistentPair

        const screenData = _getConsistentPairScreenData(
          measurementState.measurements,
          consistentPair,
          toFixedN,
        )

        // ! Record data
        RC.newScreenData = screenData
        RC.screenSizeMeasurements = {
          pxPerCm: measurementState.measurements.map(m =>
            toFixedNumber(m.ppi / 2.54, 1),
          ),
          chosen: consistentPair.ppis.map(p => toFixedNumber(p / 2.54, 1)),
          mean: toFixedNumber(
            Math.sqrt(consistentPair.ppis[0] * consistentPair.ppis[1]) / 2.54,
            1,
          ),
        }

        // Remove listeners and DOM
        breakFunction()

        // ! Call the callback function
        if (options.check)
          RC._checkScreenSize(callback, screenData, options.checkCallback)
        else safeExecuteFunc(callback, screenData)

        return
      } else {
        // Consistency check failed - reject BOTH measurements
        const lastIdx = measurementState.measurements.length - 1
        const secondLastIdx = measurementState.measurements.length - 2
        const oldPxPerCm =
          measurementState.measurements[secondLastIdx].ppi / 2.54
        const newPxPerCm = measurementState.measurements[lastIdx].ppi / 2.54

        // Calculate ratio as percentage: (100 * newPxPerCm / oldPxPerCm)
        const ratioPercent = ((100 * newPxPerCm) / oldPxPerCm).toFixed(0)

        console.log(
          `Consistency check failed. New length is ${ratioPercent}% of expected. Rejecting BOTH measurements.`,
        )

        const errorMessage =
          phrases.RC_pixelDensityMismatch?.[RC.L]?.replace(
            '[[N1]]',
            ratioPercent,
          ) ||
          `❌ The last two length settings are inconsistent. The new length is ${ratioPercent}% of that expected from the previous one. Let's try again. Click OK or press RETURN.`

        // Show popup (only accept Return/Enter, not spacebar)
        const preventSpacebar = e => {
          if (e.key === ' ' || e.code === 'Space') {
            e.preventDefault()
            e.stopPropagation()
          }
        }

        await Swal.fire({
          ...swalInfoOptions(RC, { showIcon: false }),
          icon: undefined,
          html: errorMessage,
          allowEnterKey: true,
          confirmButtonText:
            phrases.T_ok?.[RC.L] || phrases.RC_OK?.[RC.L] || 'OK',
          didOpen: () => {
            // Prevent spacebar from closing the popup
            document.addEventListener('keydown', preventSpacebar, true)
          },
          willClose: () => {
            // Clean up the event listener
            document.removeEventListener('keydown', preventSpacebar, true)
          },
        })

        // Increment rejection counter for mismatched measurements
        measurementState.rejectionCount++
        console.log(
          `Rejection count (screen size mismatch): ${measurementState.rejectionCount}`,
        )

        // Reject BOTH measurements - remove them from the array
        measurementState.measurements.pop() // Remove last (new)
        measurementState.measurements.pop() // Remove second-to-last (old)

        // Reset iteration counting for fresh start after mismatch
        // currentIteration = remaining measurements + 1 (next measurement number)
        // totalIterations = remaining measurements + 2 (need 2 more consistent measurements)
        const remainingMeasurements = measurementState.measurements.length
        measurementState.currentIteration = remainingMeasurements + 1
        measurementState.totalIterations = remainingMeasurements + 2

        console.log(
          `After rejection: ${measurementState.measurements.length} measurements remaining, ` +
            `continuing from iteration ${measurementState.currentIteration} of ${measurementState.totalIterations}`,
        )

        // Show pause before allowing new measurement (with exponentially growing duration)
        // await showPauseBeforeNewObject(
        //   RC,
        //   measurementState.rejectionCount,
        //   'RC_PauseBeforeRemeasuringCreditCard',
        // )

        // After popup and pause, restart measurement
        cleanupMeasurement()
        performMeasurement(RC, parent, options, callback, measurementState)
        return
      }
    }

    // We've done N measurements but no consistent pair found
    // Keep measuring until we find consistency (for screenSizeMeasurementCount !== 2)
    cleanupMeasurement()

    // Increment iteration counter (but not totalIterations)
    measurementState.currentIteration++

    console.log('No consistent measurements found yet, continuing...')

    // Restart measurement
    performMeasurement(RC, parent, options, callback, measurementState)

    return
  }

  // Helper function to clean up measurement UI for restart
  const cleanupMeasurement = () => {
    document.removeEventListener('mousedown', onMouseDown, false)
    document.removeEventListener('touchstart', onTouchStart, false)
    document.removeEventListener('input', onSliderInput, false)
    document.removeEventListener('keydown', arrowDownFunction)
    document.removeEventListener('keyup', arrowUpFunction)
    if (arrowIntervalFunction) {
      clearInterval(arrowIntervalFunction)
    }
    resizeObserver.unobserve(parent)
    removeKeypadHandler()

    // Remove UI elements
    const measureTextElement = document.getElementById('rc-measure-text')
    if (measureTextElement && measureTextElement.parentNode) {
      measureTextElement.parentNode.removeChild(measureTextElement)
    }

    // Remove slider
    if (sliderElement && sliderElement.parentNode) {
      sliderElement.parentNode.removeChild(sliderElement)
    }

    // Remove objects
    const sizeObjects = document.getElementsByClassName('size-obj')
    while (sizeObjects.length > 0) {
      sizeObjects[0].parentNode.removeChild(sizeObjects[0])
    }

    // Remove buttons
    const buttons = document.getElementById('rc-buttons')
    if (buttons && buttons.parentNode) {
      buttons.parentNode.removeChild(buttons)
    }

    // Unbind keys
    unbindKeys(bindKeysFunction)
  }

  sliderElement.addEventListener('input', onSliderInput, false)
  const bindKeysFunction = bindKeys({
    Escape: breakFunction,
    // Enter: finishFunction, // Remove Enter/Return key
    ' ': finishFunction,
  })

  // Add buttons but hide the OK button - rely on space key instead
  const addedButtons = addButtons(
    RC.L,
    RC.background,
    {
      go: finishFunction,
      cancel: breakFunction,
    },
    RC.params.showCancelButton,
  )

  // Hide the OK button (go button) - rely on space key instead
  const goButton = addedButtons[1]
  if (goButton) {
    goButton.style.display = 'none'
  }

  // Hide the restart calibration button (cancel button)
  const cancelButton = addedButtons[2]
  if (cancelButton) {
    cancelButton.style.display = 'none'
  }

  // Set to actual default object
  switchMatchingObj(currentMatchingObj, elements, setSizes)
}

const setCardSizes = (RC, slider, card, arrow, aS) => {
  // Card size determined directly by slider value (no size factor)
  const targetWidth =
    (slider.offsetWidth - 30) *
      (slider.value / 100) *
      (window.innerWidth < 480 ? 2 : 1) +
    15
  card.style.width = `${targetWidth}px`
  // Arrow
  const cardSizes = card.getBoundingClientRect()
  if (cardSizes.width !== 0) {
    arrow.style.left = `${cardSizes.left + targetWidth}px`
    arrow.style.top = `${
      cardSizes.top +
      RC.background.scrollTop +
      (targetWidth * 0.63 - aS.height) / 2
    }px`
  }
}

const setConnectorSizes = (slider, connector) => {
  // Connector size determined directly by slider value (no size factor)
  connector.style.width = `${remap(slider.value ** 1.5, 0, 1000, 50, 400)}px`
}

const addMatchingObj = (names, parent) => {
  // Remove all elements from the page first
  const oldElements = document.getElementsByClassName('size-obj')
  while (oldElements.length) {
    oldElements[0].parentNode.removeChild(oldElements[0])
  }

  const elements = {}

  for (const name of names) {
    let element = document.createElement('div')
    parent.appendChild(element)
    element.outerHTML = resources[name]
    element = document.getElementById(`size-${name}`)
    element.setAttribute('preserveAspectRatio', 'none')
    element.style.visibility = 'hidden'
    elements[name] = element
  }

  // Initial positioning
  setObjectsPosition(elements, document.querySelector('#rc-size-slider'))

  return elements
}

const switchMatchingObj = (name, elements, setSizes) => {
  for (const obj in elements) {
    if (obj === name) elements[obj].style.visibility = 'visible'
    else elements[obj].style.visibility = 'hidden'
  }
  // if (name === 'card') elements.arrow.style.visibility = 'visible'
  // else elements.arrow.style.visibility = 'hidden'
  elements.arrow.style.visibility = 'hidden'
  safeExecuteFunc(setSizes)
}

/**
 *
 * Get screen data from a single measurement (no consistency check)
 *
 */
const _getSingleMeasurementData = (measurement, toFixedN) => {
  const ppi = measurement.ppi

  // Get base screen data using the single PPI
  const baseScreenData = _getScreenData(ppi, toFixedN)

  // Add measurement metadata (consistent with multi-measurement structure)
  baseScreenData.value.screenPpiMean = toFixedNumber(ppi, toFixedN)
  baseScreenData.value.screenPpiStd = 0 // No std dev for single measurement
  baseScreenData.value.screenPpiMeasurements = [toFixedNumber(ppi, toFixedN)]
  baseScreenData.value.measurementCount = 1
  baseScreenData.value.totalMeasurementsTaken = 1

  // Include the single measurement
  baseScreenData.measurements = [
    {
      ppi: toFixedNumber(ppi, toFixedN),
      object: measurement.object,
      timestamp: measurement.timestamp,
      used: true,
      screenData: _getScreenData(ppi, toFixedN).value,
    },
  ]

  return baseScreenData
}

/**
 *
 * Get screen data from the 2 consistent measurements
 *
 */
const _getConsistentPairScreenData = (
  measurements,
  consistentPair,
  toFixedN,
) => {
  const ppi1 = consistentPair.ppis[0]
  const ppi2 = consistentPair.ppis[1]
  const meanPpi = Math.sqrt(ppi1 * ppi2) // Geometric mean

  // Calculate standard deviation of the 2 measurements
  const variance =
    (Math.pow(ppi1 - meanPpi, 2) + Math.pow(ppi2 - meanPpi, 2)) / 2
  const stdDev = Math.sqrt(variance)

  // Get base screen data using mean PPI
  const baseScreenData = _getScreenData(meanPpi, toFixedN)

  // Enhance with measurement data
  baseScreenData.value.screenPpiMean = toFixedNumber(meanPpi, toFixedN)
  baseScreenData.value.screenPpiStd = toFixedNumber(stdDev, toFixedN)
  baseScreenData.value.screenPpiMeasurements = [
    toFixedNumber(ppi1, toFixedN),
    toFixedNumber(ppi2, toFixedN),
  ]
  baseScreenData.value.measurementCount = 2 // Always 2 for consistent pair
  baseScreenData.value.totalMeasurementsTaken = measurements.length // How many measurements were needed
  baseScreenData.value.consistentPairIndices = consistentPair.indices // Which measurements were used

  // Include ALL measurements with flag for which were used
  baseScreenData.measurements = measurements.map((m, idx) => ({
    ppi: toFixedNumber(m.ppi, toFixedN),
    object: m.object,
    timestamp: m.timestamp,
    used: consistentPair.indices.includes(idx), // Flag if this measurement was used
    screenData: _getScreenData(m.ppi, toFixedN).value,
  }))

  return baseScreenData
}

/**
 *
 * Get aggregated screen data from multiple measurements (legacy - for single measurement case)
 *
 */
const _getAggregatedScreenData = (measurements, toFixedN) => {
  // Calculate mean PPI from all measurements
  const ppiValues = measurements.map(m => m.ppi)
  const meanPpi =
    ppiValues.reduce((sum, val) => sum + val, 0) / ppiValues.length

  // Calculate standard deviation
  const variance =
    ppiValues.reduce((sum, val) => sum + Math.pow(val - meanPpi, 2), 0) /
    ppiValues.length
  const stdDev = Math.sqrt(variance)

  // Get base screen data using mean PPI
  const baseScreenData = _getScreenData(meanPpi, toFixedN)

  // Enhance with aggregated measurement data
  baseScreenData.value.screenPpiMean = toFixedNumber(meanPpi, toFixedN)
  baseScreenData.value.screenPpiStd = toFixedNumber(stdDev, toFixedN)
  baseScreenData.value.screenPpiMeasurements = ppiValues.map(ppi =>
    toFixedNumber(ppi, toFixedN),
  )
  baseScreenData.value.measurementCount = measurements.length

  // Include individual measurements with full details
  baseScreenData.measurements = measurements.map(m => ({
    ppi: toFixedNumber(m.ppi, toFixedN),
    object: m.object,
    timestamp: m.timestamp,
    screenData: _getScreenData(m.ppi, toFixedN).value,
  }))

  return baseScreenData
}

/**
 *
 * Get all screen data from known ppi
 *
 */
const _getScreenData = (ppi, toFixedN) => {
  const screenData = {
    value: {
      screenWidthCm: toFixedNumber(
        (2.54 * window.screen.width) / ppi,
        toFixedN,
      ),
      screenHeightCm: toFixedNumber(
        (2.54 * window.screen.height) / ppi,
        toFixedN,
      ),
      screenPhysicalPpi: toFixedNumber(ppi * window.devicePixelRatio, toFixedN),
      screenPpi: toFixedNumber(ppi, toFixedN),
    },
    timestamp: performance.now(),
  }
  screenData.value.screenDiagonalCm = toFixedNumber(
    Math.hypot(screenData.value.screenWidthCm, screenData.value.screenHeightCm),
    toFixedN,
  )
  screenData.value.screenDiagonalIn = toFixedNumber(
    screenData.value.screenDiagonalCm / 2.54,
    toFixedN,
  )

  return screenData
}

const setObjectsPosition = (objects, slider) => {
  for (const i in objects) {
    objects[i].style.top = `${slider.getBoundingClientRect().top + 50}px`
  }
}
