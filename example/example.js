/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */

const experimentElement = document.getElementById('experiment')

/* --------------------------------- HELPERS -------------------------------- */

/**
 *
 * Help format the data message
 *
 */
function gotData(text) {
  return `<span class="toolbox-data">Data from Toolbox</span>` + text
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
      `RemoteCalibrator initialized at ${parseTimestamp(
        id.timestamp
      )}. Subject id is ${id.value}.`
    )

    changeClass(e.target, 'complete')

    Array.from(document.getElementsByClassName('disabled')).forEach(element => {
      element.className = ''
    })
    document.getElementById('init-button').classList.add('disabled')
  })
}

/**
 *
 * Measure the display size
 *
 */
function measureDisplaySize(e) {
  RemoteCalibrator.displaySize(displayData => {
    printMessage(
      `Display size is ${displayData.value.displayWidthPX}px in width and ${
        displayData.value.displayHeightPX
      }px in height, measured at ${parseTimestamp(displayData.timestamp)}.`
    )

    changeClass(e.target, 'complete')
  })
}

/**
 *
 * Measure the screen size
 *
 */
function measureScreenSize(e) {
  RemoteCalibrator.screenSize({}, screenData => {
    printMessage(
      `Screen size is ${screenData.value.screenDiagonalIN}in [Width: ${
        screenData.value.screenWidthCM
      }cm, Height: ${screenData.value.screenHeightCM}cm, PPI: ${
        screenData.value.screenPPI
      }, PPI (Physical): ${
        screenData.value.screenPhysicalPPI
      }], measured at ${parseTimestamp(screenData.timestamp)}.`
    )

    changeClass(e.target, 'complete')
  })
}

/**
 *
 * Measure the viewing distance of the subject
 * ! You should always calibrate the screen size first
 *
 */
function measureViewingDistance(e) {
  RemoteCalibrator.measureDistance({}, distanceData => {
    printMessage(
      `The viewing distance is ${
        distanceData.value
      }cm, measured at ${parseTimestamp(distanceData.timestamp)}.`
    )

    changeClass(e.target, 'complete')
  })
}

/**
 *
 * Calibrate and start predicting the viewing distance of the subject
 *
 */
function trackViewingDistance(e) {
  RemoteCalibrator.trackDistance({}, data => {
    changeClass(e.target, 'complete')
  })
}

/**
 *
 * Calibrate and start predicting the gaze position of the subject
 *
 */
function trackGaze(e) {
  const gazeP = printMessage(`The gaze position is [ px, px] at .`)
  RemoteCalibrator.trackGaze({}, data => {
    gazeP.innerHTML = gotData(
      `The gaze position is [${data.value.x}px, ${
        data.value.y
      }px] at ${parseTimestamp(data.timestamp)}.`
    )

    changeClass(e.target, 'complete')
  })
}

/* -------------------------------------------------------------------------- */

/**
 *
 * Get environment info
 *
 */
function getEnvironment(e) {
  RemoteCalibrator.environment(data => {
    printMessage('Environment: ' + data.value.description + '.')

    changeClass(e.target, 'complete')
  })
}
