/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */

function gotData(text) {
  return `<b>[Got data from the Toolbox]</b> ` + text
}

/* Callback function */
function getAndDisplayStaticDist(dist) {
  // You may do anything in this callback function,
  // i.e. sending data to the server
  const distP = document.createElement('p')
  distP.innerHTML = gotData(`The viewing distance is ${dist} cm.`)
  document.body.appendChild(distP)
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
function displayGazePosition([x, y]) {
  let p = document.getElementById('gazePosition')
  if (!p) {
    p = document.createElement('p')
    document.body.appendChild(p)
  }
  p.innerHTML = gotData(`The gaze position is ${x}, ${y}`)
}

function calibrateGazeTracking() {
  calibration.gazeTracking(displayGazePosition)
}
