/* eslint-disable */

const text = document.getElementById('gaze-position')

function go() {
  document.getElementById('start-button').style.display = 'none'
  RemoteCalibrator.init()
  RemoteCalibrator.trackGaze(
    {
      fullscreen: false,
      calibrationCount: 7,
    },
    data => {
      text.innerHTML = data.value.x + 'px, ' + data.value.y + 'px'
    }
  )
}
