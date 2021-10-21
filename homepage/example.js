/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */

const toolboxElement = document.getElementById('toolbox')
const experimentElement = document.getElementById('experiment')

/* --------------------------------- HELPERS -------------------------------- */

/**
 *
 * Help format the data message
 *
 */
function gotData(text) {
  return `<span class="toolbox-data">From RC</span>` + text
}

/**
 *
 * Help parse the timestamp from the Toolbox
 *
 */
function parseTimestamp(timestamp) {
  return `${timestamp.getHours()}:${timestamp.getMinutes()}:${timestamp.getSeconds()}:${timestamp.getMilliseconds()}`
}

/**
 *
 * Help print the data
 *
 */
function printMessage(message) {
  const p = document.createElement('p')
  if (message === 'nodata')
    p.innerHTML = 'No data can be found. Need measurement or calibration first.'
  else p.innerHTML = gotData(message)
  experimentElement.appendChild(p)
  experimentElement.scrollTop = experimentElement.scrollHeight
  return p
}

/**
 *
 * Change class of the button
 *
 */
function changeClass(target, className) {
  let searchDepth = 2
  while (searchDepth > 0 && target.type !== 'submit') {
    searchDepth--
    target = target.parentNode
  }
  if (target.type !== 'submit') return

  if (target.classList.contains('disabled')) target.className = 'disabled'
  else target.className = ''

  target.classList.add(className)
}

/* -------------------------------------------------------------------------- */

/**
 *
 * Init RemoteCalibrator
 *
 */
function initialize(e) {
  RemoteCalibrator.init({}, id => {
    printMessage(
      `Remote Calibrator initialized at ${parseTimestamp(
        id.timestamp
      )}. Session id is ${
        id.value
      }. <span style="color: #ff9a00; font-weight: bold">This page is only to demo (almost) all possible functionalities of EasyEyes Remote Calibrator. Please visit our website <a href="https://easyeyes.app/remote-calibrator" target="_blank" style="color: #ff9a00">https://easyeyes.app/remote-calibrator</a> to learn more about this library and other modules EasyEyes offers.</span>`
    )

    changeClass(e.target, 'complete')

    Array.from(document.getElementsByClassName('disabled')).forEach(element => {
      element.className = ''
    })
    document.getElementById('init-button').classList.add('disabled')

    // toolboxElement.className += ' initialized'
    experimentElement.style.visibility = 'visible'
    experimentElement.style.display = 'block'
    experimentElement.style.opacity = 1
  })
}

/**
 * Panel
 */
function makePanel(e) {
  printMessage(
    'A highly-customizable step-by-step calibration panel will be added to the designated HTML node.'
  )
  RemoteCalibrator.panel(
    [
      {
        name: 'screenSize',
        callback: data => {
          printMessage(
            `[CALLBACK] Screen size calibration finished! This message is printed in the callback function. Only this task's callback is set up with a print function.`
          )
        },
      },
      {
        name: 'trackGaze',
        callbackOnCalibrationEnd: data => {
          console.log(data)
        },
      },
      'measureDistance',
      {
        name: 'trackDistance',
        options: {
          nearPoint: false,
        },
        callbackStatic: data => {
          console.log(data)
        },
      },
    ],
    '#experiment',
    {},
    data => {
      printMessage(`Panel finished at ${parseTimestamp(data.timestamp)}!`)
    }
  )
  changeClass(e.target, 'complete')
}

/**
 *
 * Measure the display size
 *
 */
// function measureDisplaySize(e) {
//   RemoteCalibrator.displaySize(displayData => {
//     printMessage(
//       `Display size is ${displayData.value.displayWidthPx} px in width and ${
//         displayData.value.displayHeightPx
//       } px in height, measured at ${parseTimestamp(displayData.timestamp)}.`
//     )

//     changeClass(e.target, 'complete')
//   })
// }

/**
 *
 * Measure the screen size
 *
 */
function measureScreenSize(e) {
  RemoteCalibrator.screenSize({}, screenData => {
    printMessage(
      `Screen size is ${screenData.value.screenDiagonalIn} in [Width: ${
        screenData.value.screenWidthCm
      } cm, Height: ${screenData.value.screenHeightCm} cm, PPI: ${
        screenData.value.screenPpi
      }, PPI (Physical): ${
        screenData.value.screenPhysicalPpi
      }], measured at ${parseTimestamp(screenData.timestamp)}.`
    )

    changeClass(e.target, 'complete')
  })
}

const measureDistanceCallback = distanceData => {
  printMessage(
    `The viewing distance is ${
      distanceData.value
    } cm, measured at ${parseTimestamp(distanceData.timestamp)}, by ${
      distanceData.method
    } method.`
  )
}

/**
 *
 * Measure the viewing distance of the subject
 * ! You should always calibrate the screen size first
 *
 */
function measureViewingDistance(e) {
  RemoteCalibrator.measureDistance({}, distanceData => {
    measureDistanceCallback(distanceData)
    changeClass(e.target, 'complete')
  })
}

/**
 *
 * Calibrate and start predicting the viewing distance of the subject
 *
 */
function trackViewingDistance(e) {
  let trackP
  RemoteCalibrator.trackDistance(
    {
      showVideo: false,
      nearPoint: true,
      showNearPoint: true,
      desiredDistanceCm: 40,
      desiredDistanceMonitor: true,
    },
    distanceData => {
      measureDistanceCallback(distanceData)
      changeClass(e.target, 'complete')
      trackP = printMessage(`The dynamic viewing distance is cm at .`)
    },
    data => {
      trackP.innerHTML = gotData(
        `The dynamic viewing distance is ${
          data.value.viewingDistanceCm
        } cm at ${parseTimestamp(data.timestamp)}, measured by ${
          data.method
        } method. The near point is at [${data.value.nearPointCm.x} cm, ${
          data.value.nearPointCm.y
        } cm] compared to the center of the screen.`
      )
    }
  )

  const target = e.target.tagName === 'BUTTON' ? e.target : e.target.parentNode
  target.parentNode.insertBefore(
    constructFunctionButton(
      ['End Distance', 'endDistance', 'endDistance', 'distance'],
      false
    ),
    target.nextSibling
  )
  target.parentNode.replaceChild(
    constructFunctionButton(
      ['Pause Distance', 'pauseGDistance', 'pauseDistance', 'distance'],
      false
    ),
    target
  )
}

function pauseDistance(e) {
  RemoteCalibrator.pauseDistance()
  const target = e.target.tagName === 'BUTTON' ? e.target : e.target.parentNode

  target.parentNode.insertBefore(
    constructFunctionButton(
      ['Get Distance Now', 'getDistanceNow', 'getDistanceNow', 'distance'],
      false,
      'temp-distance-now'
    ),
    target.nextSibling
  )

  target.parentNode.replaceChild(
    constructFunctionButton(
      ['Resume Distance', 'resumeDistance', 'resumeDistance', 'distance'],
      false
    ),
    target
  )
}

function resumeDistance(e) {
  RemoteCalibrator.resumeDistance()
  const target = e.target.tagName === 'BUTTON' ? e.target : e.target.parentNode
  target.parentNode.removeChild(document.querySelector('#temp-distance-now'))
  target.parentNode.replaceChild(
    constructFunctionButton(
      ['Pause Distance', 'pauseDistance', 'pauseDistance', 'distance'],
      false
    ),
    target
  )
}

function endDistance(e) {
  RemoteCalibrator.endDistance()
  const target = e.target.tagName === 'BUTTON' ? e.target : e.target.parentNode
  target.parentNode.insertBefore(
    constructFunctionButton(
      [
        'Track Distance<br />& Near Point',
        'trackDistance',
        'trackViewingDistance',
      ],
      false
    ),
    target
  )
  document.querySelectorAll('.distance').forEach(e => {
    e.parentNode.removeChild(e)
  })
}

function getDistanceNow() {
  RemoteCalibrator.getDistanceNow()
}

/* -------------------------------------------------------------------------- */

/**
 *
 * Calibrate and start predicting the gaze position of the subject
 *
 */
function trackGaze(e) {
  const gazeP = printMessage(`The gaze position is [ px, px] at .`)
  RemoteCalibrator.trackGaze(
    {
      showVideo: false,
    },
    null,
    data => {
      gazeP.innerHTML = gotData(
        `The gaze position is [${data.value.x} px, ${
          data.value.y
        } px] at ${parseTimestamp(data.timestamp)}.`
      )
    }
  )

  const _getAccuracy = setInterval(() => {
    if (RemoteCalibrator.gazeAccuracyDeg) {
      clearInterval(_getAccuracy)
      printMessage(
        `The calibrated gaze accuracy is within ${RemoteCalibrator.gazeAccuracyDeg.value} degrees averaging over 50 predictions.`
      )
    }
  }, 2000)

  const target = e.target.tagName === 'BUTTON' ? e.target : e.target.parentNode
  target.parentNode.insertBefore(
    constructFunctionButton(['End Gaze', 'endGaze', 'endGaze', 'gaze'], false),
    target.nextSibling
  )
  target.parentNode.replaceChild(
    constructFunctionButton(
      ['Pause Gaze', 'pauseGaze', 'pauseGaze', 'gaze'],
      false
    ),
    target
  )
}

/**
 *
 * Pause gaze
 *
 */
function pauseGaze(e) {
  RemoteCalibrator.pauseGaze()
  const target = e.target.tagName === 'BUTTON' ? e.target : e.target.parentNode

  target.parentNode.insertBefore(
    constructFunctionButton(
      ['Get Gaze Now', 'getGazeNow', 'getGazeNow', 'gaze'],
      false,
      'temp-gaze-now'
    ),
    target.nextSibling
  )

  target.parentNode.replaceChild(
    constructFunctionButton(
      ['Resume Gaze', 'resumeGaze', 'resumeGaze', 'gaze'],
      false
    ),
    target
  )
}

/**
 * Resume gaze
 */
function resumeGaze(e) {
  RemoteCalibrator.resumeGaze()
  const target = e.target.tagName === 'BUTTON' ? e.target : e.target.parentNode
  target.parentNode.removeChild(document.querySelector('#temp-gaze-now'))
  target.parentNode.replaceChild(
    constructFunctionButton(
      ['Pause Gaze', 'pauseGaze', 'pauseGaze', 'gaze'],
      false
    ),
    target
  )
}

function endGaze(e) {
  RemoteCalibrator.endGaze()
  const target = e.target.tagName === 'BUTTON' ? e.target : e.target.parentNode
  target.parentNode.insertBefore(
    constructFunctionButton(['Track Gaze', 'trackGaze', 'trackGaze'], false),
    target
  )
  document.querySelectorAll('.gaze').forEach(e => {
    e.parentNode.removeChild(e)
  })
}

function getGazeNow() {
  RemoteCalibrator.getGazeNow()
}

/* -------------------------------------------------------------------------- */

/**
 *
 * Get environment info
 *
 */
// function getEnvironment(e) {
//   RemoteCalibrator.environment(data => {
//     printMessage('Environment: ' + data.value.description + '.')

//     changeClass(e.target, 'complete')
//   })
// }
