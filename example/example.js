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
  p.innerHTML = gotData(message)
  experimentElement.appendChild(p)
  return p
}

/* -------------------------------------------------------------------------- */

/**
 *
 * Init RemoteCalibrator
 *
 */
function init() {
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
 * Get the display size
 *
 */
function getDisplaySize() {
  RemoteCalibrator.displaySize(displayData => {
    printMessage(
      `Display size is ${displayData.displayWidthPX}px in width and ${
        displayData.displayHeightPX
      }px in height, measured at ${parseTimestamp(displayData.timestamp)}.`
    )
  })
}

/**
 *
 * Calibrate the screen size
 *
 */
function calibrateScreenSize() {
  RemoteCalibrator.screenSize({}, screenData => {
    printMessage(
      `Screen size is ${screenData.screenDiagonalIN}in [Width: ${
        screenData.screenWidthCM
      }cm, Height: ${screenData.screenHeightCM}cm, PPI: ${
        screenData.screenPPI
      }, PPI (Physical): ${
        screenData.screenPhysicalPPI
      }], measured at ${parseTimestamp(screenData.timestamp)}.`
    )
  })
}

/**
 *
 * Calibrate the viewing distance of the subject
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
      `The gaze position is [${data.x}px, ${data.y}px] at ${parseTimestamp(
        data.timestamp
      )}.`
    )
  })
}
