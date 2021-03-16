function getAndDisplayStaticDist(dist) {
  // You may do anything in this function,
  // i.e. sending data to the server
  const distP = document.createElement('p')
  distP.innerText = `The viewing distance is ${dist} cm.`
  document.body.appendChild(distP)
}

function calibrateViewingDistance() {
  calibration.staticDistance(getAndDisplayStaticDist)
}

/* -------------------------------------------------------------------------- */

function displayLiveDistance(dist) {}

function calibrateLiveViewingDistance() {
  calibration.liveDistance(displayLiveDistance)
}
