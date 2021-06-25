/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */

const panelHolder = document.querySelector('#rc-panel-holder')
const resultsElement = document.querySelector('#rc-panel-results')
let resultsTitle, gazeMsg, distanceMsg

RemoteCalibrator.init({ id: 'session_demo' })
RemoteCalibrator.panel(
  [
    {
      name: 'screenSize',
      callback: data => {
        addTitle()
        printMessage(
          `Screen size is ${
            data.value.screenDiagonalIN
          }in, measured at ${parseTimestamp(data.timestamp)}.`
        )
      }, // If multiple, make a list
    },
    {
      name: 'trackGaze',
      callback: data => {
        if (!gazeMsg)
          gazeMsg = printMessage('The gaze position is [ px, px] at .')
        printMessage(
          `The gaze position is [${data.value.x}px, ${
            data.value.y
          }px] at ${parseTimestamp(data.timestamp)}.`,
          gazeMsg
        )
      },
    },
    {
      name: 'trackDistance',
      callbackTrack: data => {
        if (!distanceMsg)
          distanceMsg = printMessage('The dynamic viewing distance is cm at .')
        printMessage(
          `The dynamic viewing distance is ${data.value}cm at ${parseTimestamp(
            data.timestamp
          )}.`,
          distanceMsg
        )
      },
    },
  ],
  '#rc-panel-holder',
  {},
  () => {
    party.confetti(document.querySelector('.rc-panel-step-finish'), {
      count: party.variation.range(40, 60),
    })
  }
)

const addTitle = () => {
  panelHolder.style.marginBottom = '3rem'
  resultsElement.innerHTML +=
    '<h3 class="rc-results-title">Results from the Calibrator</h3>'
}

const printMessage = (msg, target = null) => {
  if (target) {
    target.innerHTML = msg
    return target
  }
  const p = document.createElement('p')
  p.className = 'rc-result'
  p.innerHTML = msg
  resultsElement.appendChild(p)
  return p
}

function parseTimestamp(timestamp) {
  return `${timestamp.getHours()}:${timestamp.getMinutes()}:${timestamp.getSeconds()}:${timestamp.getMilliseconds()}`
}
