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

RemoteCalibrator.prototype._checkDistance = async function (
  distanceCallback,
  distanceData,
  measureName, // 'measureDistance' OR 'trackDistance'
  checkCallback,
  calibrateTrackDistanceCheckCm = [],
  callbackStatic = () => {},
  calibrateTrackDistanceCheckSecs = 0,
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

const trackDistanceCheck = async (
  RC,
  distanceCallback,
  distanceData,
  measureName,
  checkCallback,
  calibrateTrackDistanceCheckCm, // list of distances to check
  callbackStatic,
  calibrateTrackDistanceCheckSecs = 0,
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
    createProgressBar()
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
        phrases.RC_produceDistanceTitle1[RC.language.value]
          .replace('222', index)
          .replace('333', calibrateTrackDistanceCheckCm.length),
        phrases.RC_produceDistance[RC.language.value]
          .replace('111', cm)
          .replace('AAA', RC.equipment?.value?.unit)
          .replace(/(?:\r\n|\r|\n)/g, '<br><br>'),
        false,
        'bodyText',
        'left',
        phrases.RC_produceDistanceTitle2[RC.language.value]
          .replace('222', index)
          .replace('333', calibrateTrackDistanceCheckCm.length),
      )
      RC._replaceBackground(html)

      //wait for return key press
      await new Promise(async resolve => {
        if (!calibrateTrackDistanceCheckSecs)
          calibrateTrackDistanceCheckSecs = 0

        setTimeout(async () => {
          function keyupListener(event) {
            if (event.key === 'Enter' && register) {
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
              if (value === 'return') {
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
            ['return', '❌'],
            RC,
            true,
          )

          document.addEventListener('keyup', keyupListener)
        }, calibrateTrackDistanceCheckSecs * 1000)
      })
    }

    removeProgressBar()
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
          '111',
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
            ['return'],
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
const createProgressBar = () => {
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
const removeProgressBar = () => {
  const progressBarContainer = document.getElementById('custom-progress-bar')
  if (progressBarContainer) {
    document.body.removeChild(progressBarContainer)
  } else {
    console.warn('Progress bar does not exist.')
  }
}
