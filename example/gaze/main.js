/* eslint-disable */

const text = document.getElementById('gaze-position')
let startingStamp, averagingX, averagingY, averagingCount

function go() {
  document.getElementById('start-button').style.display = 'none'
  RemoteCalibrator.init()
  RemoteCalibrator.trackGaze(
    {
      fullscreen: false,
      calibrationCount: 7,
      pipWidthPX: 104,
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
          remap(
            averagingX / averagingCount,
            100,
            window.innerWidth - 100,
            0,
            1
          ) +
          ', ' +
          remap(
            window.innerHeight - averagingY / averagingCount - 100,
            0,
            window.innerHeight - 200,
            0,
            1
          ) +
          ' ' +
          parseTimestamp(data.timestamp)

        startingStamp = data.timestamp
        averagingX = averagingY = averagingCount = 0
        averagingX += data.value.x
        averagingY += data.value.y
        averagingCount++
      }
    }
  )
}

function parseTimestamp(t) {
  return `${t.getHours()}:${t.getMinutes()}:${t.getSeconds()}.${t.getMilliseconds()}`
}

function download() {
  if (!RemoteCalibrator._gazePositionData.length) return
  const data = [...RemoteCalibrator._gazePositionData]
  let s = 'x,y,timestamp'
  for (let d of data) {
    s += '\n'
    s += `${remap(d.value.x, 100, window.innerWidth - 100, 0, 1)},${remap(
      window.innerHeight - d.value.y - 100,
      0,
      window.innerHeight - 200,
      0,
      1
    )},${parseTimestamp(d.timestamp)}`
  }
  downloadString(s, 'text/csv', 'calibrator-data.csv')
}

// https://gist.github.com/danallison/3ec9d5314788b337b682
function downloadString(text, fileType, fileName) {
  var blob = new Blob([text], { type: fileType })

  var a = document.createElement('a')
  a.download = fileName
  a.href = URL.createObjectURL(blob)
  a.dataset.downloadurl = [fileType, a.download, a.href].join(':')
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(function () {
    URL.revokeObjectURL(a.href)
  }, 1500)
}

/* --------------------------------- HELPER --------------------------------- */

// https://github.com/LingDong-/q5xjs/blob/bc5fdbff75b7dc893cf470ac1f7045f8af59198a/q5.js#L276
function remap(value, istart, istop, ostart, ostop) {
  return (
    ostart + (ostop - ostart) * (((value - istart) * 1.0) / (istop - istart))
  )
}
