/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */

const toolboxElement = document.getElementById('toolbox')
const experimentElement = document.getElementById('experiment')

/* --------------------------------- HELPERS -------------------------------- */

/**
 *
 * Help format the data message
 *
 */
function gotData(text) {
  return `<span class="toolbox-data">From RC</span>${text}`
}

/**
 *
 * Help parse the timestamp from the Toolbox
 *
 */
function parseTimestamp(timestamp) {
  return Math.round(timestamp)
}

/**
 *
 * Help parse the date (Date) from the Toolbox
 *
 */
function parseDate(timestamp) {
  return `${timestamp.getHours()}:${timestamp.getMinutes()}:${timestamp.getSeconds()}:${timestamp.getMilliseconds()}`
}

/**
 *
 * Help print the data
 *
 */
function printMessage(message, msgClass = null, onlyMsg = false) {
  const p = document.createElement('p')
  if (message === 'nodata')
    p.innerHTML = 'No data can be found. Need measurement or calibration first.'
  else if (!onlyMsg) p.innerHTML = gotData(message)
  else {
    p.classList.add(msgClass)
    p.innerHTML = message
  }
  experimentElement.appendChild(p)
  experimentElement.scrollTop = experimentElement.scrollHeight
  return p
}

/**
 *
 * Change class of the button
 *
 */
function changeClass(target, className) {
  let searchDepth = 2
  while (searchDepth > 0 && target.type !== 'submit') {
    searchDepth--
    target = target.parentNode
  }
  if (target.type !== 'submit') return

  if (target.classList.contains('disabled')) target.className = 'disabled'
  else target.className = ''

  target.classList.add(className)
  target.classList.add('demo-button')
}

function printCode(code, name) {
  printMessage(
    `📙 Code for <span style="color:#000">${name}</span>`,
    'code-title',
    true,
  )
  const pre = document.createElement('pre')
  pre.className = 'prettyprint'
  pre.innerHTML = code.replace('\n@', '')
  experimentElement.appendChild(pre)
  experimentElement.scrollTop = experimentElement.scrollHeight
  PR.prettyPrint()
  return pre
}

/* -------------------------------------------------------------------------- */

/**
 *
 * Init RemoteCalibrator
 *
 */
const _initializeCode = `RemoteCalibrator.init({}, id => {
  printMessage(
    \`Remote Calibrator initialized at \${parseTimestamp(
      id.timestamp
    )} (\${parseDate(id.date)}). Session id is \${
      id.value
    }. <span style="color: #ff9a00; font-weight: bold">This page is only to 
    demo (almost) all possible functionalities of EasyEyes Remote Calibrator. 
    Please visit our website <a href="https://easyeyes.app/remote-calibrator" 
    target="_blank" style="color: #ff9a00">https://easyeyes.app/remote-calibrator</a> 
    to learn more about this library and other modules EasyEyes offers.</span>\`
  )\n@
})`
function initialize(e) {
  eval(
    _initializeCode.replace(
      '@',
      `
  // Enable other buttons
  Array.from(document.getElementsByClassName('disabled')).forEach(element => {
    element.classList.remove('disabled')
  })
  // Disable init button
  changeClass(e.target, 'complete')
  document.getElementById('init-button').classList.add('disabled')
  document.getElementById('init-button').onclick = () => {}
  // Show result panel
  experimentElement.style.visibility = 'visible'
  experimentElement.style.display = 'block'
  experimentElement.style.opacity = 1`,
    ),
  )
}

function initializeCode() {
  printCode(_initializeCode, '.init()')
}

/**
 * Panel
 */
const _panelCode = `RemoteCalibrator.panel(
  [
    // Configure tasks
    'performance',
    {
      name: 'screenSize',
      callback: data => {
        printMessage(
          \`[CALLBACK] Screen size calibration finished! This message is printed in the 
          callback function. Only this task's callback is set up with a print function.\`
        )
      },
    },
    {
      name: 'trackGaze',
      callbackOnCalibrationEnd: data => {
        console.log(data)
      },
    },
    'measureDistance',
    {
      name: 'trackDistance',
      options: {
        nearPoint: false,
      },
      callbackStatic: data => {
        console.log(data)
      },
    },
  ],
  // Parent element
  '#experiment',
  // Configure the panel itself
  {
    i18n: true,
    debug: false,
  },
  // Panel callback after all the tasks are finished
  data => {
    printMessage(\`Panel finished at \${parseTimestamp(data.timestamp)}!\`)
  }
)`
function makePanel(e) {
  printMessage(
    'A highly-customizable step-by-step calibration panel will be added to the designated HTML node.',
  )
  eval(_panelCode)
  changeClass(e.target, 'complete')
}

function makePanelCode() {
  printCode(_panelCode, '.panel()')
}

/**
 *
 * Measure the display size
 *
 */
// function measureDisplaySize(e) {
//   RemoteCalibrator.displaySize(displayData => {
//     printMessage(
//       `Display size is ${displayData.value.displayWidthPx} px in width and ${
//         displayData.value.displayHeightPx
//       } px in height, measured at ${parseTimestamp(displayData.timestamp)}.`
//     )

//     changeClass(e.target, 'complete')
//   })
// }

/**
 *
 * Measure the screen size
 *
 */
const _measureScreenSizeCode = `RemoteCalibrator.screenSize({
  // check: true,
  checkCallback: (result) => {
    printMessage(
      \`The participant measured the arrow sizes with their own tools, and the reported value is 
      Horizontal: \${result.value.horizontal.numerical} \${result.value.horizontal.unit}, 
      Vertical: \${result.value.vertical.numerical} \${result.value.vertical.unit}, 
      while the calibrator got 
      Horizontal: \${result.value.horizontal.calibratorArrowWidthCm} cm, 
      Vertical: \${result.value.vertical.calibratorArrowHeightCm} cm.\`
    )
  }
}, screenData => {
  printMessage(
    \`Screen size is \${screenData.value.screenDiagonalIn} in [Width: \${
      screenData.value.screenWidthCm
    } cm, Height: \${screenData.value.screenHeightCm} cm, PPI: \${
      screenData.value.screenPpi
    }, PPI (Physical): \${
      screenData.value.screenPhysicalPpi
    }], measured at \${parseTimestamp(screenData.timestamp)}.\`
  )\n@
})`
function measureScreenSize(e) {
  eval(_measureScreenSizeCode.replace('@', `changeClass(e.target, 'complete')`))
}
function measureScreenSizeCode() {
  printCode(_measureScreenSizeCode, '.screenSize()')
}

/**
 *
 * Measure the viewing distance of the subject
 * ! You should always calibrate the screen size first
 *
 */
const _measureDistanceCallback = `const measureDistanceCallback = distanceData => {
  printMessage(
    \`The viewing distance is \${
      distanceData.value
    } cm, measured at \${parseTimestamp(distanceData.timestamp)}, by \${
      distanceData.method
    } method.\`
  )
}`
const _measureViewingDistanceCode = `RemoteCalibrator.measureDistance({
  check: false,
  checkCallback: (result) => {
    printMessage(
      \`The viewing distance measured by the participant is 
      \${result.value.numerical} \${result.value.unit}, 
      while the calibrator got \${result.value.calibratorCm} cm 
      (using \${result.value.calibratorMethod}).\`
    )
  }
}, distanceData => {
  measureDistanceCallback(distanceData)\n@
})`
function measureViewingDistance(e) {
  eval(
    `${_measureDistanceCallback}\n${_measureViewingDistanceCode.replace(
      '@',
      `changeClass(e.target, 'complete')`,
    )}`,
  )
}
function measureViewingDistanceCode() {
  printCode(
    `${_measureDistanceCallback}\n\n${_measureViewingDistanceCode}`,
    '.measureDistance()',
  )
}

/**
 *
 * Calibrate and start predicting the viewing distance of the subject
 *
 */
const _trackViewingDistanceCode = `let trackP // Not important, just a DOM element to store the log message\n
RemoteCalibrator.trackDistance(
  {
    showVideo: true,
    nearPoint: true,
    showNearPoint: true,
    desiredDistanceCm: 60,
    desiredDistanceMonitor: true,
    desiredDistanceMonitorCancelable: false,
    check: false,
    checkCallback: (result) => {
      printMessage(
        \`The viewing distance measured by the participant is 
        \${result.value.numerical} \${result.value.unit}, 
        while the calibrator got \${result.value.calibratorCm} cm 
        (using \${result.value.calibratorMethod}).\`
      )
    }
  },
  staticDistanceData => {
    measureDistanceCallback(staticDistanceData)
    trackP = printMessage(\`The dynamic viewing distance is cm at .\`)\n@
  },
  trackingDistanceData => {
    trackP.innerHTML = gotData(
      \`The dynamic viewing distance is \${
        trackingDistanceData.value.viewingDistanceCm
      } cm at \${parseTimestamp(trackingDistanceData.timestamp)}, measured by \${
        trackingDistanceData.method
      } method. The near point is at [\${trackingDistanceData.value.nearPointCm.x} cm, \${
        trackingDistanceData.value.nearPointCm.y
      } cm] compared to the center of the screen. Latency is \${
        trackingDistanceData.value.latencyMs
      } ms.\`
    )
  }
)`
function trackViewingDistance(e) {
  eval(
    `${_measureDistanceCallback}\n${_trackViewingDistanceCode.replace(
      '@',
      `changeClass(e.target, 'complete')`,
    )}`,
  )

  const target = e.target.tagName === 'BUTTON' ? e.target : e.target.parentNode
  target.parentNode.insertBefore(
    constructFunctionButton(
      ['End Distance', 'endDistance', 'endDistance', 'distance'],
      false,
    ),
    target.nextSibling,
  )
  target.parentNode.replaceChild(
    constructFunctionButton(
      ['Pause Distance', 'pauseDistance', 'pauseDistance', 'distance'],
      false,
    ),
    target,
  )
}
function trackViewingDistanceCode() {
  printCode(
    `${_measureDistanceCallback}\n\n${_trackViewingDistanceCode}`,
    '.trackDistance()',
  )
}

const _pauseDistanceCode = 'RemoteCalibrator.pauseDistance()'
function pauseDistance(e) {
  eval(_pauseDistanceCode)
  const target = e.target.tagName === 'BUTTON' ? e.target : e.target.parentNode

  target.parentNode.insertBefore(
    constructFunctionButton(
      ['Get Distance Now', 'getDistanceNow', 'getDistanceNow', 'distance'],
      false,
      'temp-distance-now',
    ),
    target.nextSibling,
  )

  target.parentNode.replaceChild(
    constructFunctionButton(
      ['Resume Distance', 'resumeDistance', 'resumeDistance', 'distance'],
      false,
    ),
    target,
  )
}
function pauseDistanceCode() {
  printCode(_pauseDistanceCode, '.pauseDistance()')
}

const _resumeDistanceCode = 'RemoteCalibrator.resumeDistance()'
function resumeDistance(e) {
  eval(_resumeDistanceCode)
  const target = e.target.tagName === 'BUTTON' ? e.target : e.target.parentNode
  target.parentNode.removeChild(document.querySelector('#temp-distance-now'))
  target.parentNode.replaceChild(
    constructFunctionButton(
      ['Pause Distance', 'pauseDistance', 'pauseDistance', 'distance'],
      false,
    ),
    target,
  )
}
function resumeDistanceCode() {
  printCode(_resumeDistanceCode, '.resumeDistance()')
}

const _endDistanceCode = 'RemoteCalibrator.endDistance()'
function endDistance(e) {
  eval(_endDistanceCode)
  const target = e.target.tagName === 'BUTTON' ? e.target : e.target.parentNode
  target.parentNode.insertBefore(
    constructFunctionButton(
      [
        'Track Distance<br />& Near Point',
        'trackDistance',
        'trackViewingDistance',
      ],
      false,
    ),
    target,
  )
  document.querySelectorAll('.distance').forEach(e => {
    e.parentNode.removeChild(e)
  })
}
function endDistanceCode() {
  printCode(_endDistanceCode, '.endDistance()')
}

const _getDistanceNowCode = 'RemoteCalibrator.getDistanceNow()'
function getDistanceNow() {
  eval(_getDistanceNowCode)
}
function getDistanceNowCode() {
  printCode(_getDistanceNowCode, '.getDistanceNow()')
}

/* -------------------------------------------------------------------------- */

/**
 *
 * Calibrate and start predicting the gaze position of the subject
 *
 */
const _trackGazeCode = `const gazeP = printMessage(\`The gaze position is [ px, px] at .\`) // Not important, just a DOM element to store the log message\n
RemoteCalibrator.trackGaze(
  {
    showVideo: false,
  },
  null, // callbackOnCalibrationEnd
  data => {
    gazeP.innerHTML = gotData(
      \`The gaze position is [\${data.value.x} px, \${
        data.value.y
      } px] at \${parseTimestamp(data.timestamp)}. Latency is \${
        data.value.latencyMs
      } ms.\`
    )
  }
)`
function trackGaze(e) {
  eval(_trackGazeCode)

  // const _getAccuracy = setInterval(() => {
  //   if (RemoteCalibrator.gazeAccuracyDeg) {
  //     clearInterval(_getAccuracy)
  //     printMessage(
  //       `The calibrated gaze accuracy is within ${RemoteCalibrator.gazeAccuracyDeg.value} degrees averaging over 50 predictions.`
  //     )
  //   }
  // }, 2000)

  const target = e.target.tagName === 'BUTTON' ? e.target : e.target.parentNode
  target.parentNode.insertBefore(
    constructFunctionButton(['End Gaze', 'endGaze', 'endGaze', 'gaze'], false),
    target.nextSibling,
  )
  target.parentNode.insertBefore(
    constructFunctionButton(
      ['Nudge Gaze', 'nudgeGaze', 'nudgeGaze', 'gaze'],
      false,
    ),
    target.nextSibling,
  )
  target.parentNode.replaceChild(
    constructFunctionButton(
      ['Pause Gaze', 'pauseGaze', 'pauseGaze', 'gaze'],
      false,
    ),
    target,
  )
}
function trackGazeCode() {
  printCode(_trackGazeCode, '.trackGaze()')
}

const _nudgeGazeCode = 'RemoteCalibrator.nudgeGaze()'
function nudgeGaze(e) {
  eval(_nudgeGazeCode)
}

/**
 *
 * Pause gaze
 *
 */
const _pauseGazeCode = 'RemoteCalibrator.pauseGaze()'
function pauseGaze(e) {
  eval(_pauseGazeCode)

  const target = e.target.tagName === 'BUTTON' ? e.target : e.target.parentNode

  target.parentNode.insertBefore(
    constructFunctionButton(
      ['Get Gaze Now', 'getGazeNow', 'getGazeNow', 'gaze'],
      false,
      'temp-gaze-now',
    ),
    target.nextSibling,
  )

  target.parentNode.replaceChild(
    constructFunctionButton(
      ['Resume Gaze', 'resumeGaze', 'resumeGaze', 'gaze'],
      false,
    ),
    target,
  )
}
function pauseGazeCode() {
  printCode(_pauseGazeCode, '.pauseGaze()')
}

/**
 * Resume gaze
 */
const _resumeGazeCode = 'RemoteCalibrator.resumeGaze()'
function resumeGaze(e) {
  eval(_resumeGazeCode)
  const target = e.target.tagName === 'BUTTON' ? e.target : e.target.parentNode
  target.parentNode.removeChild(document.querySelector('#temp-gaze-now'))
  target.parentNode.replaceChild(
    constructFunctionButton(
      ['Pause Gaze', 'pauseGaze', 'pauseGaze', 'gaze'],
      false,
    ),
    target,
  )
}
function resumeGazeCode() {
  printCode(_resumeGazeCode, '.resumeGaze()')
}

const _endGazeCode = 'RemoteCalibrator.endGaze()'
function endGaze(e) {
  eval(_endGazeCode)
  const target = e.target.tagName === 'BUTTON' ? e.target : e.target.parentNode
  target.parentNode.insertBefore(
    constructFunctionButton(['Track Gaze', 'trackGaze', 'trackGaze'], false),
    target,
  )
  document.querySelectorAll('.gaze').forEach(e => {
    e.parentNode.removeChild(e)
  })
}
function endGazeCode() {
  printCode(_endGazeCode, '.endGaze()')
}

const _getGazeNodeCode = 'RemoteCalibrator.getGazeNow()'
function getGazeNow() {
  eval(_getGazeNodeCode)
}
function getGazeNowCode() {
  printCode(_getGazeNodeCode, '.getGazeNow()')
}

/**
 * Performance
 */
const _testPerformanceCode = `RemoteCalibrator.performance({}, data => {
  printMessage(
    \`The ideal FPS (given the refresh rate of the display) is: \${data.value.idealFps}, 
    while under stressful computing, the actual FPS is: \${data.value.stressFps}. 
    It computes \${data.value.computeRandomMHz} million times of <code>Math.random()</code> per second, 
    and does the Array filling task 
    (<code>Array(5000).fill(Math.floor(Math.random() * 10))</code>) 
    \${data.value.computeArrayFillMHz} million times per second.\`
  )
})`
function testPerformance() {
  eval(_testPerformanceCode)
}
function testPerformanceCode() {
  printCode(_testPerformanceCode, '.performance()')
}

const _testPerformanceComputeCode = `RemoteCalibrator.performanceCompute(data => {
  printMessage(
    \`It computes \${data.value.computeRandomMHz} million times of <code>Math.random()</code> per second, 
    and does the Array filling task 
    (<code>Array(5000).fill(Math.floor(Math.random() * 10))</code>) 
    \${data.value.computeArrayFillMHz} million times per second.\`
  )
})`
function testPerformanceCompute() {
  eval(_testPerformanceComputeCode)
}
function testPerformanceComputeCode() {
  printCode(_testPerformanceComputeCode, '.performanceCompute()')
}

function testMultipleDisplay() {
  const experimentElement = document.getElementById('experiment')
  const p = document.createElement('p')
  p.innerHTML = 'This is a test for multiple displays.'
  experimentElement.appendChild(p)

  const verticalLineButton = document.createElement('button')
  verticalLineButton.innerHTML = 'Create Vertical Line'
  const explanationVertical = document.createElement('p')
  explanationVertical.innerHTML =
    'The below "Create Vertical Line" button makes use of <a href = "https://chatgpt.com/share/258baeac-47ce-44b4-9441-197b8c3c4713" target ="_blank"> this ChatGPT conversation</a> provided by Prof. Denis. It doesn\'t seem to work as intended. It only opens a new window in the same display.'
  verticalLineButton.onclick = () => {
    const verticalLineWindow = window.open(
      '',
      'Vertical Line',
      `width=${400},height=${400}`,
    )
    drawVerticalLine(verticalLineWindow)
    moveToDisplay(verticalLineWindow, 1)
  }

  verticalLineButton.style.marginLeft = '10px'
  experimentElement.appendChild(explanationVertical)
  experimentElement.appendChild(verticalLineButton)

  const verticalLineButton2 = document.createElement('button')
  verticalLineButton2.innerHTML = 'Create Vertical Line using Presentation API'
  const explanationVertical2 = document.createElement('p')
  explanationVertical2.innerHTML =
    'The below "Create Vertical Line using Presentation API" button makes use of <a href = "https://developer.mozilla.org/en-US/docs/Web/API/Presentation_API" target ="_blank"> Presentation API</a> This method opens up a browser dialogue box and asks the user to choose a display. Then it succesfully opens up a new full screen window in the selected display. It also has the ability to send data back and forth. It only works on Chrome 59+, Edge 79+ and Opera 46+.'

  verticalLineButton2.onclick = () => {
    const presentationRequest = new PresentationRequest('vertical_line.html')
    presentationRequest
      .start()
      .then(connection => {
        console.log('Presentation started:', connection)
        // You can communicate with the presentation window here
        connection.onconnect = () => {
          console.log('Connected to presentation:', connection)
          verticalLineButton2.innerHTML = 'Close Window'
          verticalLineButton2.onclick = () => {
            connection.terminate()
          }
        }
        connection.onterminate = () => {
          console.log('Presentation terminated:', connection)
          verticalLineButton2.innerHTML =
            'Create Vertical Line using Presentation API'
        }
      })
      .catch(error => {
        console.error('Error starting presentation:', error)
      })
  }

  experimentElement.appendChild(explanationVertical2)
  experimentElement.appendChild(verticalLineButton2)
}
function moveToDisplay(win, displayIndex) {
  const screenWidth = window.screen.width
  const screenHeight = window.screen.height

  switch (displayIndex) {
    case 0:
      win.moveTo(0, 0)
      break
    case 1:
      win.moveTo(screenWidth, 0)
      break
    case 2:
      win.moveTo(screenWidth * 2, 0)
      break
    default:
      win.moveTo(0, 0)
  }
  // win.resizeTo(screenWidth, screenHeight)
}

function drawVerticalLine(win) {
  win.document.write(
    '<html><head><title>Vertical Line</title></head><body></body></html>',
  )
  const canvas = win.document.createElement('canvas')
  canvas.width = 400
  canvas.height = 400
  win.document.body.appendChild(canvas)
  const context = canvas.getContext('2d')

  context.beginPath()
  context.moveTo(canvas.width / 2, 0)
  context.lineTo(canvas.width / 2, canvas.height)
  context.strokeStyle = 'black'
  context.lineWidth = 2
  context.stroke()
}

/* -------------------------------------------------------------------------- */

/**
 *
 * Get environment info
 *
 */
// function getEnvironment(e) {
//   RemoteCalibrator.environment(data => {
//     printMessage('Environment: ' + data.value.description + '.')

//     changeClass(e.target, 'complete')
//   })
// }
