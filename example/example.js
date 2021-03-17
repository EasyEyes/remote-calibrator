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
function displayGazePosition() {}

function calibrateGazeTracking() {
  calibration.gazeTracking(displayGazePosition)
}
