/* eslint-disable */

const text = document.getElementById('gaze-position')
let startingStamp, averagingX, averagingY, averagingCount

function go() {
  document.getElementById('start-button').style.display = 'none'
  RemoteCalibrator.init()
  RemoteCalibrator.trackGaze(
    {
      fullscreen: false,
      calibrationCount: 1,
    },
    data => {
      if (!startingStamp) {
        startingStamp = data.timestamp
        averagingX = averagingY = averagingCount = 0
      }

      if (data.timestamp - startingStamp < 100) {
        averagingX += data.value.x
        averagingY += data.value.y
        averagingCount++
      } else {
        text.innerHTML =
          Math.round((10 * averagingX) / averagingCount) / 10 +
          'px, ' +
          Math.round((10 * averagingY) / averagingCount) / 10 +
          'px  ' +
          `${data.timestamp.getHours()}:${data.timestamp.getMinutes()}:${data.timestamp.getSeconds()}.${data.timestamp.getMilliseconds()}`

        startingStamp = data.timestamp
        averagingX = averagingY = averagingCount = 0
        averagingX += data.value.x
        averagingY += data.value.y
        averagingCount++
      }
    }
  )
}
