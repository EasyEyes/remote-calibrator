/* eslint-disable */

const text = document.getElementById('gaze-position')
let startingStamp, averagingX, averagingY, averagingCount

const screenDiagonalIN = 27 // Test on the specific computer
const screenDiagonalCM = screenDiagonalIN * 2.54
const viewingDistanceCM = 40

const ppc = Math.hypot(screen.width, screen.height) / screenDiagonalCM

const codeToCenterXPX = screen.width / 2 - 100
const codeToCenterYPX = screen.height / 2 - 100

const codeToCenterXCM = codeToCenterXPX / ppc
const codeToCenterYCM = codeToCenterYPX / ppc

const codeToCenterXDEG =
  (Math.atan(codeToCenterXCM / viewingDistanceCM) * 180) / Math.PI

const codeToCenterYDEG =
  (Math.atan(codeToCenterYCM / viewingDistanceCM) * 180) / Math.PI

document.getElementById('code-degree').innerHTML = `QR Codes X &#177;${
  Math.round(codeToCenterXDEG * 1000000) / 1000000
}deg, Y &#177;${
  Math.round(codeToCenterYDEG * 1000000) / 1000000
}deg (27in screen, 40cm viewing distance, fullscreen) | PPI ${
  Math.hypot(screen.width, screen.height) / 27
}`

/* -------------------------------------------------------------------------- */
const gazeData = []
/* -------------------------------------------------------------------------- */

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
        const xPX = averagingX / averagingCount
        const yPX = window.innerHeight - averagingY / averagingCount // !

        text.innerHTML =
          remap(xPX, 100, window.innerWidth - 100, 0, 1) +
          ', ' +
          remap(yPX, 100, window.innerHeight - 100, 0, 1) +
          ' ' +
          parseTimestamp(data.timestamp)

        gazeData.push({
          value: {
            xPX: xPX,
            yPX: yPX,
            xNorm: remap(xPX, 100, window.innerWidth - 100, 0, 1),
            yNorm: remap(yPX, 100, window.innerHeight - 100, 0, 1),
            xDEG:
              (Math.atan(
                (xPX - window.innerWidth / 2) / ppc / viewingDistanceCM
              ) *
                180) /
              Math.PI,
            yDEG:
              (Math.atan(
                (yPX - window.innerHeight / 2) / ppc / viewingDistanceCM
              ) *
                180) /
              Math.PI,
          },
          timestamp: data.timestamp,
        })

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
  if (!gazeData.length) return
  const data = [...gazeData]
  let s = 'xPX,yPX,xNorm,yNorm,xDEG,yDEG,timestamp'
  for (let d of data) {
    s += '\n'
    s += `${d.value.xPX},${d.value.yPX},${d.value.xNorm},${d.value.yNorm},${
      d.value.xDEG
    },${d.value.yDEG},${parseTimestamp(d.timestamp)}`
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
