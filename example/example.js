/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */

const experimentElement = document.getElementById('experiment')

/**
 *
 * Help format and print the data message.
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

/* Callback function */
function getAndDisplayStaticDist(data) {
  // You may do anything in this callback function,
  // i.e. sending data to the server
  const distP = document.createElement('p')
  distP.innerHTML = gotData(
    `The viewing distance is ${data.d}cm, measured at ${parseTimestamp(
      data.timestamp
    )}.`
  )
  experimentElement.appendChild(distP)
}

function calibrateViewingDistance() {
  calibration.staticDistance(getAndDisplayStaticDist)
}

/* -------------------------------------------------------------------------- */

/* Callback function */
function displayLiveDistance(dist) {}

function calibrateLiveViewingDistance() {
  calibration.liveDistance(displayLiveDistance)
}

/* -------------------------------------------------------------------------- */

/* Callback function */
function displayGazePosition(data) {
  let p = document.getElementById('gazePosition')
  if (!p) {
    p = document.createElement('p')
    p.id = 'gazePosition'
    experimentElement.appendChild(p)
  }
  p.innerHTML = gotData(
    `The gaze position is [${data.x}px, ${data.y}px] at ${parseTimestamp(
      data.timestamp
    )}.`
  )
}

function calibrateGazeTracking() {
  calibration.gazeTracking(displayGazePosition)
}
