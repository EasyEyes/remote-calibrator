/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */

const experimentElement = document.getElementById('experiment')

/**
 *
 *
 *
 */
function init() {
  RemoteCalibrator.init({}, data => {
    printMessage(`RemoteCalibrator initialized. Subject id is ${data.id}.`)
  })
}

/**
 *
 * Help format the data message.
 *
 */
function gotData(text) {
  return `<span class="toolbox-data">Data from Toolbox</span>` + text
}

/**
 *
 * Help parse the timestamp from the Toolbox.
 *
 */
function parseTimestamp(timestamp) {
  return `${timestamp.getHours()}:${timestamp.getMinutes()}:${timestamp.getSeconds()}:${timestamp.getMilliseconds()}`
}

/**
 *
 * Help print the data.
 *
 */
function printMessage(message) {
  const p = document.createElement('p')
  p.innerHTML = gotData(message)
  experimentElement.appendChild(p)
  return p
}

/**
 *
 * Calibrate the screen size.
 *
 */
function calibrateScreenSize() {
  RemoteCalibrator.screenSize(data => {
    printMessage(
      `Screen size is ${data.diagonal}in [Width: ${data.width}in, Height: ${
        data.height
      }in, PPI: ${data.ppi}, PPI (Physical): ${
        data.rppi
      }], measured at ${parseTimestamp(data.timestamp)}.`
    )
  })
}

/**
 *
 * Calibrate the viewing distance of the subject.
 * ! You should always calibrate the screen size first
 *
 */
function calibrateViewingDistance() {
  RemoteCalibrator.staticDistance(data => {
    printMessage(
      `The viewing distance is ${data.d}cm, measured at ${parseTimestamp(
        data.timestamp
      )}.`
    )
  })
}

/**
 *
 * Calibrate and start predicting the viewing distance of the subject.
 *
 */
function trackViewingDistance() {
  RemoteCalibrator.trackDistance(data => {})
}

/**
 *
 * Calibrate and start predicting the gaze position of the subject.
 *
 */
function startGazeTracking() {
  const gazeP = printMessage(`The gaze position is [ px, px] at .`)
  RemoteCalibrator.gazeTracking(data => {
    gazeP.innerHTML = gotData(
      `The gaze position is [${data.x}px, ${data.y}px] at ${parseTimestamp(
        data.timestamp
      )}.`
    )
  })
}
