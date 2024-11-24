import RemoteCalibrator from '../core'
import { takeInput } from '../components/checkInput'
import {
  constructInstructions,
  safeExecuteFunc,
  sleep,
} from '../components/utils'
import { remoteCalibratorPhrases } from '../i18n/phrases'
import { setUpEasyEyesKeypadHandler } from '../extensions/keypadHandler'

RemoteCalibrator.prototype._checkDistance = async function (
  distanceCallback,
  distanceData,
  measureName, // 'measureDistance' OR 'trackDistance'
  checkCallback,
  calibrateTrackDistanceCheckCm = [],
  callbackStatic = () => {},
) {
  await this.getEquipment(() => {}, false, 'new')
  await trackDistanceCheck(
    this,
    distanceCallback,
    distanceData,
    measureName,
    checkCallback,
    calibrateTrackDistanceCheckCm,
    callbackStatic,
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
    if (RC.equipment?.value?.unit === 'inches') {
      calibrateTrackDistanceCheckCm = calibrateTrackDistanceCheckCm.map(cm =>
        Math.round(cm / 2.54),
      )
    }
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
    //convert back to cm to report
    RC.calibrateTrackDistanceRequestedCm = calibrateTrackDistanceCheckCm.map(
      v => (RC.equipment?.value?.unit === 'inches' ? Math.round(v * 2.54) : v),
    )
    RC.calibrateTrackDistanceMeasuredCm = []

    for (let cm of calibrateTrackDistanceCheckCm) {
      const index = calibrateTrackDistanceCheckCm.indexOf(cm) + 1
      updateProgressBar(
        (index / calibrateTrackDistanceCheckCm.length) * 100,
        index,
        calibrateTrackDistanceCheckCm.length,
      )
      updateViewingDistanceDiv(cm, RC.equipment?.value?.unit)
      const html = constructInstructions(
        remoteCalibratorPhrases.RC_produceDistanceTitle[RC.language.value]
          .replace('222', index)
          .replace('333', calibrateTrackDistanceCheckCm.length),
        remoteCalibratorPhrases.RC_produceDistance[RC.language.value]
          .replace('111', cm)
          .replace('AAA', RC.equipment?.value?.unit)
          .replace(/(?:\r\n|\r|\n)/g, '<br><br>'),
        false,
        '',
        'left',
      )
      RC._replaceBackground(html)

      //wait for return key press
      await new Promise(resolve => {
        document.addEventListener('keydown', function keydownListener(event) {
          if (event.key === 'Enter') {
            const distanceFromRC = !RC.viewingDistanceAllowedPreciseBool
              ? Math.round(RC.viewingDistanceCm.value)
              : RC.viewingDistanceCm.value.toFixed(1)
            RC.calibrateTrackDistanceMeasuredCm.push(distanceFromRC)
            document.removeEventListener('keydown', keydownListener)
            resolve()
          }
        })

        const removeKeypadHandler = setUpEasyEyesKeypadHandler(
          null,
          RC.keypadHandler,
          () => {
            const distanceFromRC = !RC.viewingDistanceAllowedPreciseBool
              ? Math.round(RC.viewingDistanceCm.value)
              : RC.viewingDistanceCm.value.toFixed(1)
            RC.calibrateTrackDistanceMeasuredCm.push(distanceFromRC)
            removeKeypadHandler()
            resolve()
          },
          false,
          ['return'],
        )
      })
    }
    RC.resumeNudger()
    removeProgressBar()
    removeViewingDistanceDiv()
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
  const viewingDistanceDiv = document.getElementById('viewing-distance-div')
  if (viewingDistanceDiv) {
    document.body.removeChild(viewingDistanceDiv)
  } else {
    console.warn('Viewing distance div does not exist.')
  }

  const unitsDiv = document.getElementById(
    'calibration-trackDistance-check-viewingDistance-units',
  )
  if (unitsDiv) {
    document.body.removeChild(unitsDiv)
  } else {
    console.warn('Units div does not exist.')
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

  progressBarText.innerText = `${current} of ${total}`
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
