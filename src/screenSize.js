import isEqual from 'react-fast-compare'
import Swal from 'sweetalert2'

import RemoteCalibrator from './core'
import {
  toFixedNumber,
  blurAll,
  remap,
  safeExecuteFunc,
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
import { setUpEasyEyesKeypadHandler } from './extensions/keypadHandler'
import { swalInfoOptions } from './components/swalOptions'

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

  this.getFullscreen(options.fullscreen)

  // Validate and normalize screenSizeMeasurementCount
  if (typeof options.screenSizeMeasurementCount !== 'number' || 
      isNaN(options.screenSizeMeasurementCount) || 
      options.screenSizeMeasurementCount < 1) {
    console.warn(`Invalid screenSizeMeasurementCount: ${options.screenSizeMeasurementCount}. Using default value of 2.`)
    options.screenSizeMeasurementCount = 2
  }
  options.screenSizeMeasurementCount = Math.max(1, Math.floor(options.screenSizeMeasurementCount))
  
  // Set initial headline with progress indicator (1 of N)
  options.headline = phrases.RC_screenSizeTitleN?.[this.L]
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
    totalIterations: Math.max(1, Math.floor(options.screenSizeMeasurementCount || 1)),
    measurements: [], // Store all individual measurements
    consistentPair: null, // Will store the indices of 2 consistent measurements
  }

  // Start the measurement loop
  performMeasurement(RC, parent, options, callback, measurementState)
}

// Helper function to check if the last 2 consecutive measurements are consistent
function checkLastTwoMeasurements(measurements, threshold) {
  // Need at least 2 measurements to compare
  if (measurements.length < 2) return null
  
  // Get the last two measurements
  const lastIdx = measurements.length - 1
  const secondLastIdx = measurements.length - 2
  
  const M1 = measurements[secondLastIdx].ppi
  const M2 = measurements[lastIdx].ppi
  
  // Calculate max(M1/M2, M2/M1)
  const ratio = Math.max(M1 / M2, M2 / M1)
  
  // Test passes if ratio <= threshold
  if (ratio <= threshold) {
    // Found consistent last two measurements!
    return { indices: [secondLastIdx, lastIdx], ppis: [M1, M2] }
  }
  
  return null // Last two measurements are not consistent
}

function performMeasurement(RC, parent, options, callback, measurementState) {
  // Update headline to show progress dynamically as measurements continue
  // Shows "1 of 2", "2 of 2", "3 of 3", "4 of 4", etc.
  const currentMeasurement = measurementState.currentIteration
  const totalShown = Math.max(currentMeasurement, measurementState.totalIterations)
  
  const progressText = phrases.RC_screenSizeTitleN?.[RC.L]
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
      const continueDescription = phrases.RC_screenSizeContinue?.[RC.L] || phrases.RC_screenSizeIntro[RC.L]
      
      // Add the object selection dropdown to the continue text
      const fullDescription = continueDescription + `<br /><br /><b class="rc-size-obj-selection">${phrases.RC_screenSizeHave[
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
      console.log(`Updated body text for iteration ${measurementState.currentIteration}`)
    }
  }

  // Slider with random initial position (0-66% for subsequent measurements)
  const sliderElement = createSlider(parent, 0, 100)
  
  // Generate random offsets ONLY for measurements after the first one
  let randomSizeFactor = 1 // Default: no size change
  let randomHorizontalOffset = 0 // Default: no horizontal offset
  
  if (measurementState.currentIteration > 1) {
    // Random size factor: between 0.5x and 2x (factor of 2 range)
    randomSizeFactor = 0.5 + Math.random() * 1.5 // 0.5 to 2.0
    // Random horizontal offset: between -400px and +400px (800px range)
    // This will be applied only to the card/USB object, not the slider
    randomHorizontalOffset = (Math.random() - 0.5) * 800 // -400 to +400
    
    // Set random initial slider value (this changes the progress bar fill)
    const randomValue = Math.random() * 66.67 // Random value between 0 and 66.67%
    sliderElement.value = randomValue
    setSliderStyle(sliderElement)
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
  
  // Apply horizontal offset to objects after creation (only for iterations > 1)
  if (measurementState.currentIteration > 1) {
    setObjectsPosition(elements, sliderElement, randomHorizontalOffset)
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
    setCardSizes(RC, sliderElement, elements.card, elements.arrow, arrowSizes, randomSizeFactor)
    setConnectorSizes(sliderElement, elements.usba, randomSizeFactor)
    setConnectorSizes(sliderElement, elements.usbc, randomSizeFactor)
  }

  setSizes()

  // Add "please measure carefully" text below slider (never moves horizontally)
  const measureText = document.createElement('div')
  measureText.innerText = phrases.RC_screenSizeMatters[RC.L]
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
    setSliderPosition(sliderElement, parent) // Slider never moves horizontally
    setObjectsPosition(elements, sliderElement, randomHorizontalOffset) // Only objects move
    positionMeasureText() // Update text position on resize
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

    // If only 1 measurement requested, return immediately without consistency check
    if (measurementState.totalIterations === 1) {
      const screenData = _getSingleMeasurementData(measurementState.measurements[0], toFixedN)
      
      RC.newScreenData = screenData
      const singlePpi = toFixedNumber(measurementState.measurements[0].ppi, 1)
      RC.screenSizeMeasurements = {
        ppi: [singlePpi],
        chosen: [singlePpi],
        mean: singlePpi
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
        options.screenSizeConsistencyThreshold
      )
      
      if (consistentPair) {
        // Found 2 consistent measurements! Calculate data and finish
        measurementState.consistentPair = consistentPair
        
        const screenData = _getConsistentPairScreenData(
          measurementState.measurements,
          consistentPair,
          toFixedN
        )
        
        // ! Record data
        RC.newScreenData = screenData
        RC.screenSizeMeasurements = {
          ppi: measurementState.measurements.map(m => toFixedNumber(m.ppi, 1)),
          chosen: consistentPair.ppis.map(p => toFixedNumber(p, 1)),
          mean: toFixedNumber(Math.sqrt(consistentPair.ppis[0] * consistentPair.ppis[1]), 1)
        }

        // Remove listeners and DOM
        breakFunction()

        // ! Call the callback function
        if (options.check)
          RC._checkScreenSize(callback, screenData, options.checkCallback)
        else safeExecuteFunc(callback, screenData)
        
        return
      } else {
        // Consistency check failed
        // If screenSizeMeasurementCount is 2, show popup with error message
        if (options.screenSizeMeasurementCount === 2) {
          const lastIdx = measurementState.measurements.length - 1
          const secondLastIdx = measurementState.measurements.length - 2
          const M1 = measurementState.measurements[secondLastIdx].ppi
          const M2 = measurementState.measurements[lastIdx].ppi
          const ratio = Math.max(M1 / M2, M2 / M1)
          
          console.log(`Consistency check failed. Ratio: ${toFixedNumber(ratio, 2)}. Continuing to next measurement.`)
          
          const errorMessage = phrases.RC_objectSizeMismatch?.[RC.L]
            ?.replace('[[N1]]', toFixedNumber(ratio, 2).toString()) ||
            `Measurements are inconsistent. Ratio: ${toFixedNumber(ratio, 2)}`
          
          // Show popup (only accept Return/Enter, not spacebar)
          const preventSpacebar = (e) => {
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
            confirmButtonText: phrases.T_ok?.[RC.L] || phrases.RC_OK?.[RC.L] || 'OK',
            didOpen: () => {
              // Prevent spacebar from closing the popup
              document.addEventListener('keydown', preventSpacebar, true)
            },
            willClose: () => {
              // Clean up the event listener
              document.removeEventListener('keydown', preventSpacebar, true)
            }
          })
          
          // After popup, continue to next measurement (don't reset)
          cleanupMeasurement()
          measurementState.currentIteration++
          performMeasurement(RC, parent, options, callback, measurementState)
          return
        }
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

const setCardSizes = (RC, slider, card, arrow, aS, sizeFactor = 1) => {
  // Card - apply size factor for randomization
  const targetWidth =
    ((slider.offsetWidth - 30) *
      (slider.value / 100) *
      (window.innerWidth < 480 ? 2 : 1) +
    15) * sizeFactor
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

const setConnectorSizes = (slider, connector, sizeFactor = 1) => {
  // Apply size factor for randomization
  connector.style.width = `${remap(slider.value ** 1.5, 0, 1000, 50, 400) * sizeFactor}px`
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

  // Initial positioning without horizontal offset
  setObjectsPosition(elements, document.querySelector('#rc-size-slider'), 0)

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
  baseScreenData.measurements = [{
    ppi: toFixedNumber(ppi, toFixedN),
    object: measurement.object,
    timestamp: measurement.timestamp,
    used: true,
    screenData: _getScreenData(ppi, toFixedN).value,
  }]

  return baseScreenData
}

/**
 *
 * Get screen data from the 2 consistent measurements
 *
 */
const _getConsistentPairScreenData = (measurements, consistentPair, toFixedN) => {
  const ppi1 = consistentPair.ppis[0]
  const ppi2 = consistentPair.ppis[1]
  const meanPpi = Math.sqrt(ppi1 * ppi2) // Geometric mean
  
  // Calculate standard deviation of the 2 measurements
  const variance = (Math.pow(ppi1 - meanPpi, 2) + Math.pow(ppi2 - meanPpi, 2)) / 2
  const stdDev = Math.sqrt(variance)

  // Get base screen data using mean PPI
  const baseScreenData = _getScreenData(meanPpi, toFixedN)

  // Enhance with measurement data
  baseScreenData.value.screenPpiMean = toFixedNumber(meanPpi, toFixedN)
  baseScreenData.value.screenPpiStd = toFixedNumber(stdDev, toFixedN)
  baseScreenData.value.screenPpiMeasurements = [toFixedNumber(ppi1, toFixedN), toFixedNumber(ppi2, toFixedN)]
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
  const meanPpi = ppiValues.reduce((sum, val) => sum + val, 0) / ppiValues.length
  
  // Calculate standard deviation
  const variance = ppiValues.reduce((sum, val) => sum + Math.pow(val - meanPpi, 2), 0) / ppiValues.length
  const stdDev = Math.sqrt(variance)

  // Get base screen data using mean PPI
  const baseScreenData = _getScreenData(meanPpi, toFixedN)

  // Enhance with aggregated measurement data
  baseScreenData.value.screenPpiMean = toFixedNumber(meanPpi, toFixedN)
  baseScreenData.value.screenPpiStd = toFixedNumber(stdDev, toFixedN)
  baseScreenData.value.screenPpiMeasurements = ppiValues.map(ppi => toFixedNumber(ppi, toFixedN))
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

const setObjectsPosition = (objects, slider, horizontalOffset = 0) => {
  for (const i in objects) {
    objects[i].style.top = `${slider.getBoundingClientRect().top + 50}px`
    
    // Apply horizontal offset only to card and connectors (not arrow)
    // Also ensure the object stays within screen bounds
    if (horizontalOffset !== 0 && (i === 'card' || i === 'usba' || i === 'usbc')) {
      const objectRect = objects[i].getBoundingClientRect()
      const objectWidth = objectRect.width || 0
      const screenWidth = window.innerWidth
      
      // Constrain offset to keep object on screen
      // Left edge: object should not go off left side
      // Right edge: object should not go off right side
      const maxLeftOffset = -objectRect.left
      const maxRightOffset = screenWidth - objectRect.right
      const constrainedOffset = Math.max(maxLeftOffset, Math.min(maxRightOffset, horizontalOffset))
      
      objects[i].style.transform = `translateX(${constrainedOffset}px)`
    }
  }
}
