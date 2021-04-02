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

/* -------------------------------------------------------------------------- */

/**
 *
 * Init RemoteCalibrator
 *
 */
function initialization() {
  RemoteCalibrator.init({}, id => {
    printMessage(
      `RemoteCalibrator initialized at ${parseTimestamp(
        id.timestamp
      )}. Subject id is ${id.value}.`
    )
  })

  Array.from(document.getElementsByClassName('disabled')).forEach(element => {
    element.className = ''
  })
  document.getElementById('init-button').className = 'disabled'
}

/**
 *
 * Measure the display size
 *
 */
function measureDisplaySize() {
  RemoteCalibrator.displaySize(displayData => {
    printMessage(
      `Display size is ${displayData.value.displayWidthPX}px in width and ${
        displayData.value.displayHeightPX
      }px in height, measured at ${parseTimestamp(displayData.timestamp)}.`
    )
  })
}

/**
 *
 * Measure the screen size
 *
 */
function measureScreenSize() {
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
  })
}

/**
 *
 * Measure the viewing distance of the subject
 * ! You should always calibrate the screen size first
 *
 */
function measureViewingDistance() {
  RemoteCalibrator.measureDistance({}, distanceData => {
    printMessage(
      `The viewing distance is ${
        distanceData.value
      }cm, measured at ${parseTimestamp(distanceData.timestamp)}.`
    )
  })
}

/**
 *
 * Calibrate and start predicting the viewing distance of the subject
 *
 */
function trackViewingDistance() {
  RemoteCalibrator.trackDistance({}, data => {})
}

/**
 *
 * Calibrate and start predicting the gaze position of the subject
 *
 */
function startGazeTracking() {
  const gazeP = printMessage(`The gaze position is [ px, px] at .`)
  RemoteCalibrator.gazeTracking({}, data => {
    gazeP.innerHTML = gotData(
      `The gaze position is [${data.value.x}px, ${
        data.value.y
      }px] at ${parseTimestamp(data.timestamp)}.`
    )
  })
}

/* -------------------------------------------------------------------------- */

/**
 *
 * Get environment info
 *
 */
function getEnvironment() {
  RemoteCalibrator.environment(data => {
    printMessage('Environment: ' + data.value.description + '.')
  })
}
