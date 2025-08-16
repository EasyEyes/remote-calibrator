import RemoteCalibrator from '../core'
import { takeInput } from '../components/checkInput'
import {
  constructInstructions,
  safeExecuteFunc,
  sleep,
} from '../components/utils'
import { remoteCalibratorPhrases } from '../i18n/phrases'
import { setUpEasyEyesKeypadHandler } from '../extensions/keypadHandler'
import { phrases } from '../i18n/schema'
import Swal from 'sweetalert2'
import { swalInfoOptions } from '../components/swalOptions'
import { setDefaultVideoPosition } from '../components/video'

RemoteCalibrator.prototype._checkDistance = async function (
  distanceCallback,
  distanceData,
  measureName, // 'measureDistance' OR 'trackDistance'
  checkCallback,
  calibrateTrackDistanceCheckCm = [],
  callbackStatic = () => {},
  calibrateTrackDistanceCheckSecs = 0,
  calibrateTrackDistanceCheckLengthCm = [],
) {
  await this.getEquipment(
    async () => {
      return await trackDistanceCheck(
        this,
        distanceCallback,
        distanceData,
        measureName,
        checkCallback,
        calibrateTrackDistanceCheckCm,
        callbackStatic,
        calibrateTrackDistanceCheckSecs,
        calibrateTrackDistanceCheckLengthCm,
      )
    },
    false,
    'new',
  )
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

// Helper function to create yellow tape rectangle (extracted from object test)
const createYellowTapeRectangle = (RC) => {
  // Get the screen's pixels per millimeter (for accurate physical placement)
  const ppi = RC.screenPpi.value
  const pxPerMm = ppi / 25.4  // Note: 25.4 mm = 1 inch, so pxPerMm = ppi / 25.4

  // The left vertical line is always 5mm from the left edge of the screen
  let leftLinePx = Math.round(5 * pxPerMm) // 5mm from left
  const screenWidth = window.innerWidth

  // The right vertical line starts at 2/3 of the screen width
  let rightLinePx = Math.round((screenWidth * 2) / 3)

  // Calculate the vertical position for all elements (10% lower than center)
  const screenCenterY = window.innerHeight * 0.6

  // Create the main container
  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.top = '0'
  container.style.left = '0'
  container.style.width = '100vw'
  container.style.height = '100vh'
  container.style.userSelect = 'none'
  container.style.overflow = 'hidden'
  container.style.zIndex = '1000'

  // Calculate 3/4 inch in pixels for line height
  const threeQuarterInchesInPx = Math.round(0.75 * ppi)
  const lineThickness = 3

  // Style for both vertical lines
  const verticalLineStyle = `
    position: absolute; 
    top: ${screenCenterY}px; 
    transform: translateY(-50%); 
    height: ${threeQuarterInchesInPx}px; 
    width: ${lineThickness}px; 
    background: rgb(0, 0, 0); 
    border-radius: 2px; 
    z-index: 1;
  `

  // Left vertical line
  const leftLine = document.createElement('div')
  leftLine.style = verticalLineStyle + `left: ${leftLinePx}px; cursor: ew-resize;`
  container.appendChild(leftLine)

  // Right vertical line
  const rightLine = document.createElement('div')
  rightLine.style = verticalLineStyle + `left: ${rightLinePx}px; cursor: ew-resize;`
  container.appendChild(rightLine)

  // Rectangle background fill
  const rectangleBackground = document.createElement('div')
  rectangleBackground.style.position = 'absolute'
  rectangleBackground.style.left = `${leftLinePx}px`
  rectangleBackground.style.width = `${rightLinePx - leftLinePx + lineThickness}px`
  rectangleBackground.style.top = `calc(${screenCenterY}px - ${threeQuarterInchesInPx / 2}px)`
  rectangleBackground.style.height = `${threeQuarterInchesInPx}px`
  rectangleBackground.style.background = 'rgba(255, 221, 51, 0.95)'
  rectangleBackground.style.borderRadius = '2px'
  rectangleBackground.style.zIndex = '0'
  container.appendChild(rectangleBackground)

  // Top horizontal line
  const topHorizontalLine = document.createElement('div')
  topHorizontalLine.style.position = 'absolute'
  topHorizontalLine.style.left = `${leftLinePx}px`
  topHorizontalLine.style.width = `${rightLinePx - leftLinePx + lineThickness}px`
  topHorizontalLine.style.top = `calc(${screenCenterY}px - ${threeQuarterInchesInPx / 2}px)`
  topHorizontalLine.style.height = `${lineThickness}px`
  topHorizontalLine.style.background = 'rgb(0, 0, 0)'
  topHorizontalLine.style.borderRadius = '2px'
  topHorizontalLine.style.zIndex = '1'
  container.appendChild(topHorizontalLine)

  // Bottom horizontal line
  const bottomHorizontalLine = document.createElement('div')
  bottomHorizontalLine.style.position = 'absolute'
  bottomHorizontalLine.style.left = `${leftLinePx}px`
  bottomHorizontalLine.style.width = `${rightLinePx - leftLinePx + lineThickness}px`
  bottomHorizontalLine.style.top = `calc(${screenCenterY}px + ${threeQuarterInchesInPx / 2}px - ${lineThickness}px)`
  bottomHorizontalLine.style.height = `${lineThickness}px`
  bottomHorizontalLine.style.background = 'rgb(0, 0, 0)'
  bottomHorizontalLine.style.borderRadius = '2px'
  bottomHorizontalLine.style.zIndex = '1'
  container.appendChild(bottomHorizontalLine)

  // Function to update rectangle when lines move
  function updateRectangleLines() {
    rectangleBackground.style.left = `${leftLinePx}px`
    rectangleBackground.style.width = `${rightLinePx - leftLinePx + lineThickness}px`
    topHorizontalLine.style.left = `${leftLinePx}px`
    topHorizontalLine.style.width = `${rightLinePx - leftLinePx + lineThickness}px`
    bottomHorizontalLine.style.left = `${leftLinePx}px`
    bottomHorizontalLine.style.width = `${rightLinePx - leftLinePx + lineThickness}px`
  }

  // Dragging functionality for right line
  let dragging = false
  rightLine.addEventListener('mousedown', e => {
    dragging = true
    document.body.style.cursor = 'ew-resize'
    e.preventDefault()
  })

  const mouseMoveHandler = e => {
    if (!dragging) return
    let x = e.clientX
    x = Math.max(leftLinePx + 10, Math.min(x, screenWidth))
    rightLinePx = x
    rightLine.style.left = `${rightLinePx}px`
    updateRectangleLines()
  }

  const mouseUpHandler = () => {
    dragging = false
    document.body.style.cursor = ''
  }

  window.addEventListener('mousemove', mouseMoveHandler)
  window.addEventListener('mouseup', mouseUpHandler)

  // Dragging functionality for left line
  let leftDragging = false
  leftLine.addEventListener('mousedown', e => {
    leftDragging = true
    document.body.style.cursor = 'ew-resize'
    e.preventDefault()
  })

  const leftMouseMoveHandler = e => {
    if (!leftDragging) return
    let x = e.clientX
    x = Math.max(0, Math.min(x, rightLinePx - 2))
    leftLinePx = x
    leftLine.style.left = `${leftLinePx}px`
    updateRectangleLines()
  }

  const leftMouseUpHandler = () => {
    leftDragging = false
    document.body.style.cursor = ''
  }

  window.addEventListener('mousemove', leftMouseMoveHandler)
  window.addEventListener('mouseup', leftMouseUpHandler)

  // Keyboard handling for arrow keys
  let arrowKeyDown = false
  let arrowIntervalFunction = null
  let currentArrowKey = null

  const arrowDownFunction = e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    if (arrowKeyDown) return

    arrowKeyDown = true
    currentArrowKey = e.key

    if (arrowIntervalFunction) {
      clearInterval(arrowIntervalFunction)
    }

    arrowIntervalFunction = setInterval(() => {
      if (currentArrowKey === 'ArrowLeft') {
        rightLinePx -= 5
        helpMoveRightLine()
      } else if (currentArrowKey === 'ArrowRight') {
        rightLinePx += 5
        helpMoveRightLine()
      }
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

  const helpMoveRightLine = () => {
    const minX = leftLinePx + 10
    const maxX = screenWidth
    rightLinePx = Math.max(minX, Math.min(rightLinePx, maxX))
    rightLine.style.left = `${rightLinePx}px`
    updateRectangleLines()
  }

  document.addEventListener('keydown', arrowDownFunction)
  document.addEventListener('keyup', arrowUpFunction)

  // Cleanup function
  const cleanup = () => {
    window.removeEventListener('mousemove', mouseMoveHandler)
    window.removeEventListener('mouseup', mouseUpHandler)
    window.removeEventListener('mousemove', leftMouseMoveHandler)
    window.removeEventListener('mouseup', leftMouseUpHandler)
    document.removeEventListener('keydown', arrowDownFunction)
    document.removeEventListener('keyup', arrowUpFunction)
    if (arrowIntervalFunction) {
      clearInterval(arrowIntervalFunction)
    }
    if (container.parentNode) {
      container.parentNode.removeChild(container)
    }
  }

  // Function to get current length in cm
  const getCurrentLengthPx = () => {
    const objectLengthPx = rightLinePx - leftLinePx
    return objectLengthPx
  }

  return {
    container,
    cleanup,
    getCurrentLengthPx
  }
}

// Function to create the length display div (similar to viewing distance but for top half of right side)
const createLengthDisplayDiv = () => {
  // Check if the div already exists
  if (document.getElementById('length-display-div')) {
    console.warn('Length display div already exists.')
    return
  }

  const lengthContainer = document.createElement('div')
  lengthContainer.id = 'calibration-checkSize-lengthDisplay-container'
  lengthContainer.className = 'calibration-checkSize-lengthDisplay-container'

  // Create the div element for the length value
  const lengthDisplayDiv = document.createElement('p')
  lengthDisplayDiv.id = 'length-display-p'
  lengthDisplayDiv.className = 'calibration-checkSize-lengthDisplay'

  // Create p for units
  const units = document.createElement('p')
  units.id = 'calibration-checkSize-lengthDisplay-units'
  units.className = 'calibration-checkSize-lengthDisplay-units'

  // Append to the container
  lengthContainer.appendChild(lengthDisplayDiv)
  lengthContainer.appendChild(units)
  document.body.appendChild(lengthContainer)
}

const removeLengthDisplayDiv = () => {
  const lengthDisplayDiv = document.getElementById('length-display-p')
  const unitsDiv = document.getElementById('calibration-checkSize-lengthDisplay-units')
  const lengthContainer = document.getElementById('calibration-checkSize-lengthDisplay-container')

  if (lengthDisplayDiv) {
    lengthDisplayDiv.remove()
  }

  if (unitsDiv) {
    unitsDiv.remove()
  }

  if (lengthContainer) {
    lengthContainer.remove()
  }
}

const adjustLengthFontSize = (lengthDiv, unitsDiv) => {
  const container = lengthDiv.parentElement
  const containerWidth = container.offsetWidth
  const containerHeight = container.offsetHeight

  let fontSize = containerWidth // Start with the width as a base for font size
  lengthDiv.style.fontSize = `${fontSize}px`
  unitsDiv.style.fontSize = `${fontSize * 0.5}px`

  // Adjust dynamically to prevent overflow in width or height
  while (
    (lengthDiv.scrollWidth > containerWidth ||
      unitsDiv.scrollWidth > containerWidth ||
      lengthDiv.offsetHeight + unitsDiv.offsetHeight > containerHeight) &&
    fontSize > 10
  ) {
    fontSize -= 1
    lengthDiv.style.fontSize = `${fontSize}px`
    unitsDiv.style.fontSize = `${fontSize * 0.5}px`
  }
}

const updateLengthDisplayDiv = (length, units) => {
  const lengthDisplayDiv = document.getElementById('length-display-p')

  if (!lengthDisplayDiv) {
    console.warn(
      'Length display div does not exist. Call createLengthDisplayDiv() first.',
    )
    return
  }

  lengthDisplayDiv.innerText = length

  const unitsDiv = document.getElementById('calibration-checkSize-lengthDisplay-units')

  if (!unitsDiv) {
    console.warn('Units div does not exist.')
    return
  }

  unitsDiv.innerText = units

  adjustLengthFontSize(lengthDisplayDiv, unitsDiv)
}

const checkSize = async (RC, calibrateTrackDistanceCheckLengthCm = []) => {
  // Use the already calculated values from screen calibration
  const pxPerCm = RC.screenPpi.value / 2.54 // pixels per cm from calibrated PPI (Note: 2.54 cm = 1 inch)
  const screenWidthCm = RC.screenWidthCm.value // already calculated during screen calibration
  console.log("//.screenWidthCm", screenWidthCm)
  const rulerLengthCm = RC.equipment?.value?.length
  const maxLengthCm = Math.min(rulerLengthCm, screenWidthCm)

  // Process calibrateTrackDistanceCheckLengthCm the same way as calibrateTrackDistanceCheckCm
  let processedLengthCm = calibrateTrackDistanceCheckLengthCm.map(cm =>
    RC.equipment?.value?.unit === 'inches'
      ? Math.floor(Number(cm) / 2.54) 
      : Math.floor(Number(cm)),
  )

  processedLengthCm = processedLengthCm.filter(
    cm => cm > 0 && cm <= maxLengthCm,
  )

  console.log("//.processedLengthCm", processedLengthCm)

  if (processedLengthCm.length === 0) {
    console.warn('No valid lengths to check.')
    return
  }

  // Initialize arrays to store length data (similar to distance tracking)
  RC.calibrateTrackLengthMeasuredCm = []
  RC.calibrateTrackLengthRequestedCm = []
  RC.calibrateTrackDistancePxPerCm = []

  // Create the length display div
  createLengthDisplayDiv()

  // Loop through each length value to create dynamic pages
  for (let i = 0; i < processedLengthCm.length; i++) {
    const cm = processedLengthCm[i]
    const index = i + 1

    // Update the length display with the current required length
    updateLengthDisplayDiv(cm, RC.equipment?.value?.unit)

    // Create the page content with dynamic replacements
    const html = constructInstructions(
      phrases.RC_SetLengthTitle[RC.language.value]
        .replace('[[N11]]', index)
        .replace('[[N22]]', processedLengthCm.length),
      phrases.RC_SetLength[RC.language.value]
        .replace('[[N33]]', cm)
        .replace('[[UUU]]', RC.equipment?.value?.unit)
        .replace(/(?:\r\n|\r|\n)/g, '<br><br>'),
      false,
      'bodyText',
      'left'
    )
    
    RC._replaceBackground(html)

    // Create and display the yellow tape rectangle
    const yellowTape = createYellowTapeRectangle(RC)
    RC.background.appendChild(yellowTape.container)

    // Wait for space key press for each page
    await new Promise((resolve) => {
      let register = true

      function keyupListener(event) {
        if (event.key === ' ' && register) {
          register = false
          // Store the requested length (and measured length from yellow tape)
          const measuredLength = yellowTape.getCurrentLengthPx()
          RC.calibrateTrackLengthMeasuredCm.push(Number(measuredLength.toFixed(1)))
          RC.calibrateTrackLengthRequestedCm.push(
            Number(
              RC.equipment?.value?.unit === 'inches'
                ? (cm * 2.54).toFixed(1)
                : cm.toFixed(1),
            ),
          )
          RC.calibrateTrackDistancePxPerCm.push((Number(measuredLength.toFixed(1)) / cm).toFixed(1))
          console.log("//RC.calibrateTrackLengthMeasuredCm", RC.calibrateTrackLengthMeasuredCm)
          console.log("//RC.calibrateTrackLengthRequestedCm", RC.calibrateTrackLengthRequestedCm)
          console.log("//RC.calibrateTrackDistancePxPerCm", RC.calibrateTrackDistancePxPerCm)

          document.removeEventListener('keyup', keyupListener)
          removeKeypadHandler()
          yellowTape.cleanup() // Clean up the yellow tape
          resolve()
        }
      }

      // Set up keypad handler for space key (for devices with keypad)
      const removeKeypadHandler = setUpEasyEyesKeypadHandler(
        null,
        RC.keypadHandler,
        value => {
          if (value === 'space' && register) {
            register = false
            // Store the requested length (and measured length from yellow tape)
            const measuredLength = yellowTape.getCurrentLengthPx()
            RC.calibrateTrackLengthMeasuredCm.push(Number(measuredLength.toFixed(1)))
            RC.calibrateTrackLengthRequestedCm.push(
              Number(
                RC.equipment?.value?.unit === 'inches'  
                  ? (cm * 2.54).toFixed(1)
                  : cm.toFixed(1),
              )
            )
            console.log("...RC.calibrateTrackLengthMeasuredCm", RC.calibrateTrackLengthMeasuredCm)
            console.log("...RC.calibrateTrackLengthRequestedCm", RC.calibrateTrackLengthRequestedCm)
            
            removeKeypadHandler()
            document.removeEventListener('keyup', keyupListener)
            yellowTape.cleanup() // Clean up the yellow tape
            resolve()
          }
        },
        false,
        ['space'],
        RC,
        true,
      )

      document.addEventListener('keyup', keyupListener)
    })
  }

  // Clean up the length display div when done
  removeLengthDisplayDiv()
}

const trackDistanceCheck = async (
  RC,
  distanceCallback,
  distanceData,
  measureName,
  checkCallback,
  calibrateTrackDistanceCheckCm, // list of distances to check
  callbackStatic,
  calibrateTrackDistanceCheckSecs = 0,
  calibrateTrackDistanceCheckLengthCm = [], // list of lengths to check
) => {
  const isTrack = measureName === 'trackDistance'

  const quit = () => {
    RC._removeBackground()
    if (!isTrack) safeExecuteFunc(distanceCallback, distanceData, false)
    callbackStatic()
  }

  // Start tracking right away
  if (isTrack) safeExecuteFunc(distanceCallback, distanceData, false)

  //if participant has equipment
  //if the unit is inches, convert calibrateTrackDistanceCheckCm to inches and round to integer
  //discard negative, zero, and values exceeding equipment length
  if (RC.equipment?.value?.has) {
    // Show dummy test page right after equipment is confirmed
    RC.pauseNudger()
    await checkSize(RC, calibrateTrackDistanceCheckLengthCm)
    RC.resumeNudger()

    calibrateTrackDistanceCheckCm = calibrateTrackDistanceCheckCm.map(cm =>
      RC.equipment?.value?.unit === 'inches'
        ? Math.round(Number(cm) / 2.54)
        : Math.round(Number(cm)),
    )

    calibrateTrackDistanceCheckCm = calibrateTrackDistanceCheckCm.filter(
      cm => cm > 0 && cm <= RC.equipment?.value?.length,
    )

    if (calibrateTrackDistanceCheckCm.length === 0) {
      console.warn('No valid distances to check.')
      quit()
      return
    }

    RC._removeBackground()
    RC.pauseNudger()
    createProgressBar(RC)
    createViewingDistanceDiv()
    RC.calibrateTrackDistanceMeasuredCm = []
    RC.calibrateTrackDistanceRequestedCm = []
    let skippedDistancesCount = 0

    for (let i = 0; i < calibrateTrackDistanceCheckCm.length; i++) {
      let register = true
      const cm = calibrateTrackDistanceCheckCm[i]
      const index = i + 1

      updateProgressBar(
        (index / calibrateTrackDistanceCheckCm.length) * 100,
        index,
        calibrateTrackDistanceCheckCm.length,
      )
      updateViewingDistanceDiv(cm, RC.equipment?.value?.unit)
      const html = constructInstructions(
        phrases.RC_produceDistanceTitle[RC.language.value]
          .replace('[[N22]]', index)
          .replace('[[N33]]', calibrateTrackDistanceCheckCm.length),
        phrases.RC_produceDistance[RC.language.value]
          .replace('[[N11]]', cm)
          .replace('[[UUU]]', RC.equipment?.value?.unit)
          .replace(/(?:\r\n|\r|\n)/g, '<br><br>'),
        false,
        'bodyText',
        'left',
      )
      RC._replaceBackground(html)

      //wait for return key press
      await new Promise(async resolve => {
        if (!calibrateTrackDistanceCheckSecs)
          calibrateTrackDistanceCheckSecs = 0

        setTimeout(async () => {
          function keyupListener(event) {
            if (event.key === ' ' && register) {
              register = false
              const distanceFromRC = RC.viewingDistanceCm.value.toFixed(1)
              RC.calibrateTrackDistanceMeasuredCm.push(Number(distanceFromRC))
              RC.calibrateTrackDistanceRequestedCm.push(
                Number(
                  RC.equipment?.value?.unit === 'inches'
                    ? (cm * 2.54).toFixed(1)
                    : cm.toFixed(1),
                ),
              )
              document.removeEventListener('keydown', keyupListener)
              removeKeypadHandler()
              resolve()
            }
            //check for the x key to skip
            else if (event.key === 'x' && register) {
              register = false
              skippedDistancesCount++
              //remove distance from requested list
              calibrateTrackDistanceCheckCm.splice(i, 1)
              i--
              document.removeEventListener('keydown', keyupListener)
              removeKeypadHandler()
              resolve()
            }
          }
          const removeKeypadHandler = setUpEasyEyesKeypadHandler(
            null,
            RC.keypadHandler,
            value => {
              if (value === 'space') {
                const distanceFromRC = RC.viewingDistanceCm.value.toFixed(1)
                RC.calibrateTrackDistanceMeasuredCm.push(distanceFromRC)
                RC.calibrateTrackDistanceRequestedCm.push(
                  RC.equipment?.value?.unit === 'inches'
                    ? (cm * 2.54).toFixed(1)
                    : cm.toFixed(1),
                )
                removeKeypadHandler()
                document.removeEventListener('keyup', keyupListener)
                resolve()
              }
              //check for the x key to skip
              else if (value === '❌') {
                skippedDistancesCount++
                //remove distance from requested list
                calibrateTrackDistanceCheckCm.splice(i, 1)
                i--
                removeKeypadHandler()
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
        }, calibrateTrackDistanceCheckSecs * 1000)
      })
    }

    removeProgressBar(RC)
    removeViewingDistanceDiv()
    //join the arrays into a string
    //show thank you message
    await Swal.fire({
      ...swalInfoOptions(RC, {
        showIcon: false,
      }),
      title:
        '<p class="heading2">' +
        phrases.RC_AllDistancesRecorded[RC.language.value].replace(
          '[[N11]]',
          RC.calibrateTrackDistanceRequestedCm.length,
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
  quit()
}

// Function to create the div and start updating the value
const createViewingDistanceDiv = () => {
  // Check if the div already exists
  if (document.getElementById('viewing-distance-div')) {
    console.warn('Viewing distance div already exists.')
    return
  }

  const distanceContainer = document.createElement('viewing-distance-div')
  distanceContainer.id =
    'calibration-trackDistance-check-viewingDistance-container'
  distanceContainer.className =
    'calibration-trackDistance-check-viewingDistance-container'

  // Create the div element
  const viewingDistanceDiv = document.createElement('p')
  viewingDistanceDiv.id = 'viewing-distance-p'
  viewingDistanceDiv.className =
    'calibration-trackDistance-check-viewingDistance'

  //create p for units
  const units = document.createElement('p')
  units.id = 'calibration-trackDistance-check-viewingDistance-units'
  units.className = 'calibration-trackDistance-check-viewingDistance-units'

  // Append to the body
  distanceContainer.appendChild(viewingDistanceDiv)
  distanceContainer.appendChild(units)
  document.body.appendChild(distanceContainer)
}

const removeViewingDistanceDiv = () => {
  const viewingDistanceDiv = document.getElementById('viewing-distance-p')
  const unitsDiv = document.getElementById(
    'calibration-trackDistance-check-viewingDistance-units',
  )
  const distanceContainer = document.getElementById(
    'calibration-trackDistance-check-viewingDistance-container',
  )

  if (viewingDistanceDiv) {
    viewingDistanceDiv.remove()
  }

  if (unitsDiv) {
    unitsDiv.remove()
  }

  if (distanceContainer) {
    distanceContainer.remove()
  }
}

const adjustFontSize = (distanceDiv, unitsDiv) => {
  const container = distanceDiv.parentElement
  const containerWidth = container.offsetWidth
  const containerHeight = container.offsetHeight

  let fontSize = containerWidth // Start with the width as a base for font size
  distanceDiv.style.fontSize = `${fontSize}px`
  unitsDiv.style.fontSize = `${fontSize * 0.5}px`

  // Adjust dynamically to prevent overflow in width or height
  while (
    (distanceDiv.scrollWidth > containerWidth ||
      unitsDiv.scrollWidth > containerWidth ||
      distanceDiv.offsetHeight + unitsDiv.offsetHeight > containerHeight) &&
    fontSize > 10
  ) {
    fontSize -= 1
    distanceDiv.style.fontSize = `${fontSize}px`
    unitsDiv.style.fontSize = `${fontSize * 0.5}px`
  }
}

const updateViewingDistanceDiv = (distance, units) => {
  const viewingDistanceDiv = document.getElementById('viewing-distance-p')

  if (!viewingDistanceDiv) {
    console.warn(
      'Viewing distance div does not exist. Call createViewingDistanceDiv() first.',
    )
    return
  }

  viewingDistanceDiv.innerText = distance

  const unitsDiv = document.getElementById(
    'calibration-trackDistance-check-viewingDistance-units',
  )

  if (!unitsDiv) {
    console.warn('Units div does not exist.')
    return
  }

  unitsDiv.innerText = units

  adjustFontSize(viewingDistanceDiv, unitsDiv)
}

// Function to create the progress bar div
const createProgressBar = RC => {
  // Check if the progress bar already exists
  if (document.getElementById('custom-progress-bar')) {
    console.warn('Progress bar already exists.')
    return
  }

  // Create the progress bar container
  const progressBarContainer = document.createElement('div')
  progressBarContainer.id = 'custom-progress-bar'
  progressBarContainer.className =
    'calibration-trackDistance-check-progessBar-container'

  // Create the progress bar element
  const progressBar = document.createElement('div')
  progressBar.id = 'calibration-trackDistance-check-progessBar'
  progressBar.className = 'calibration-trackDistance-check-progessBar'

  const progressBarText = document.createElement('p')
  progressBarText.id = 'calibration-trackDistance-check-progessBar-text'
  progressBarText.className = 'calibration-trackDistance-check-progessBar-text'

  // Append the progress bar to the container
  progressBarContainer.appendChild(progressBar)
  progressBarContainer.appendChild(progressBarText)
  document.body.appendChild(progressBarContainer)

  // Reposition video to center when progress bar is created
  const videoContainer = document.getElementById('webgazerVideoContainer')
  if (videoContainer && RC) {
    setDefaultVideoPosition(RC, videoContainer)
  }
}

// Function to update the progress
const updateProgressBar = (progress, current, total) => {
  const progressBar = document.getElementById(
    'calibration-trackDistance-check-progessBar',
  )

  //update the progress bar text
  const progressBarText = document.getElementById(
    'calibration-trackDistance-check-progessBar-text',
  )

  if (!progressBar || !progressBarText) {
    console.warn('Progress bar does not exist. Call createProgressBar() first.')
    return
  }

  // Ensure progress is within bounds [0, 100]
  const sanitizedProgress = Math.min(100, Math.max(0, progress))
  progressBar.style.width = `${sanitizedProgress}%`

  progressBarText.innerText = `${current}/${total}`
}

// Function to remove the progress bar
const removeProgressBar = RC => {
  const progressBarContainer = document.getElementById('custom-progress-bar')
  if (progressBarContainer) {
    document.body.removeChild(progressBarContainer)

    // Reposition video back to top when progress bar is removed
    const videoContainer = document.getElementById('webgazerVideoContainer')
    if (videoContainer && RC) {
      setDefaultVideoPosition(RC, videoContainer)
    }
  } else {
    console.warn('Progress bar does not exist.')
  }
}
