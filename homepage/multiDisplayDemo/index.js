function createElement(type, props = {}, ...children) {
  const element = document.createElement(type)

  for (const [key, value] of Object.entries(props)) {
    if (key === 'style') {
      Object.assign(element.style, value)
    } else if (key.startsWith('on') && typeof value === 'function') {
      element.addEventListener(key.slice(2).toLowerCase(), value)
    } else {
      element[key] = value
    }
  }

  for (const child of children) {
    if (typeof child === 'string') {
      element.appendChild(document.createTextNode(child))
    } else if (child instanceof Node) {
      element.appendChild(child)
    }
  }

  return element
}

function createButton(text, onClick, style = {}) {
  return createElement('button', { onClick, style }, text)
}

function createExplanation(text, links = []) {
  const linkElements = links.map(link =>
    createElement('a', { href: link.url, target: '_blank' }, link.label),
  )
  return createElement('p', {}, text, ...linkElements)
}

// Window management
const openedWindows = {}

function openWindow(
  url,
  name,
  width = 800,
  height = 600,
  left = -4098,
  top = -72,
) {
  const options = `width=${width},height=${height},left=${left},top=${top}`
  return window.open(url, name, options)
}

function handleWindowOpen(url, name, displayText) {
  const win = openWindow(url, name)
  openedWindows[win.name] = win
  win.onload = () => {
    win.document.getElementById('display-text').innerHTML = displayText
  }
}

function moveToDisplay(win, displayIndex) {
  const screenWidth = window.screen.width
  const positions = [
    { left: 0, top: 0 },
    { left: screenWidth, top: 0 },
    { left: screenWidth * 2, top: 0 },
  ]
  const position = positions[displayIndex] || positions[0]
  win.moveTo(position.left, position.top)
}

function shrinkWindow(win) {
  if (win && !win.closed) {
    console.log('Shrinking window', win)

    win.resizeTo(800, 600)
    win.moveTo(100, 100)

    setTimeout(() => {
      win.resizeTo(1, 1)
      win.moveTo(window.screen.width - 2, window.screen.height - 2)
    }, 300)
  }
}

function expandWindow(win, width = 800, height = 600) {
  if (win && !win.closed) {
    win.resizeTo(width, height)
    win.focus()
  }
}

// Drawing functions
function drawVerticalLine(win) {
  const canvas = createElement('canvas', { width: 400, height: 400 })
  win.document.body.appendChild(canvas)
  const context = canvas.getContext('2d')
  context.beginPath()
  context.moveTo(canvas.width / 2, 0)
  context.lineTo(canvas.width / 2, canvas.height)
  context.strokeStyle = 'black'
  context.lineWidth = 2
  context.stroke()
}

// Presentation API functions
function handlePresentationStart(presentationRequest) {
  presentationRequest
    .start()
    .then(connection => {
      console.log('Presentation started', connection)
      setupPresentationConnection(connection)
    })
    .catch(error => console.error('Error starting presentation', error))
}

function setupPresentationConnection(connection) {
  connection.onconnect = () =>
    console.log('Connected to presentation', connection)
  connection.onterminate = () =>
    console.log('Presentation terminated', connection)
}

// ! Main function to test multiple displays
function testMultipleDisplay() {
  const experimentElement = document.getElementById('experiment')

  const multiDisplayPanel = createElement('div')
  multiDisplayPanel.classList.add('multi-display-panel')
  experimentElement.appendChild(multiDisplayPanel)

  multiDisplayPanel.appendChild(
    createElement(
      'p',
      {},
      'This is a demo of pushing content to multiple displays using RemoteCalibrator.',
    ),
  )

  const verticalLineButton = createButton('Create vertical line', () => {
    const verticalLineWindow = openWindow('', 'Vertical Line', 400, 400)
    drawVerticalLine(verticalLineWindow)
    moveToDisplay(verticalLineWindow, 1)
  })

  const verticalLineExplanation = createExplanation(
    '1. The "Create vertical line" button below makes use of ',
    [
      {
        url: 'https://chatgpt.com/share/258baeac-47ce-44b4-9441-197b8c3c4713',
        label: 'this ChatGPT conversation',
      },
    ],
  )
  multiDisplayPanel.appendChild(verticalLineExplanation)

  const vButtonsDiv = createElement('div', { className: 'buttons' })
  vButtonsDiv.appendChild(verticalLineButton)
  multiDisplayPanel.appendChild(vButtonsDiv)

  const presentationButton = createButton('Open on a new display', () => {
    const presentationRequest = new PresentationRequest(
      'multiDisplayDemo/verticalLine.html',
    )
    handlePresentationStart(presentationRequest)
  })

  const presentationExplanation = createExplanation(
    '2. The "Open on a new display" button below makes use of ',
    [
      {
        url: 'https://developer.mozilla.org/en-US/docs/Web/API/Presentation_API',
        label: 'Presentation API',
      },
    ],
  )
  multiDisplayPanel.appendChild(presentationExplanation)

  const pButtonsDiv = createElement('div', { className: 'buttons' })
  pButtonsDiv.appendChild(presentationButton)
  multiDisplayPanel.appendChild(pButtonsDiv)

  const displayOptionExplanation = createExplanation(
    '3. This builds on 1. It opens up new windows with instructions on which display to drag the screen to. ' +
      'Then it provides an option to send data to the open windows. In this demo, you can open two windows ' +
      '(one to drag to the left display and one to drag to the right display). Then you can input text in the text box and click "Display text". ' +
      'It chooses a random window to display the text',
  )
  multiDisplayPanel.appendChild(displayOptionExplanation)

  const windowButtonsDiv = createElement('div', { className: 'buttons' })
  const openLeftWindowButton = createButton('Open left window', () =>
    handleWindowOpen(
      'multiDisplayDemo/display.html',
      'Display 1',
      'Drag me to the LEFT',
    ),
  )
  const openRightWindowButton = createButton('Open right window', () =>
    handleWindowOpen(
      'multiDisplayDemo/display.html',
      'Display 2',
      'Drag me to the RIGHT',
    ),
  )

  windowButtonsDiv.appendChild(openLeftWindowButton)
  windowButtonsDiv.appendChild(openRightWindowButton)
  multiDisplayPanel.appendChild(windowButtonsDiv)

  const textInput = createElement('input', {
    type: 'text',
    id: 'text-to-display',
    placeholder: 'Enter text to display',
  })
  const displayTextButton = createButton('Display text', () => {
    const windows = Object.values(openedWindows)
    if (windows.length > 0) {
      const randomWindow = windows[Math.floor(Math.random() * windows.length)]
      displayTextInWindow(randomWindow)
    }
  })
  const getWindowLocationButton = createButton('Get window location', () => {
    const windows = Object.values(openedWindows)
    if (windows.length > 0) {
      const randomWindow = windows[Math.floor(Math.random() * windows.length)]
      console.log('Window location', randomWindow.screenX, randomWindow.screenY)
    }
  })
  const shrinkWindowButton = createButton('Shrink window', () => {
    const windows = Object.values(openedWindows)
    if (windows.length > 0) {
      shrinkWindow(windows[0])
    }
  })

  const buttonsDiv = createElement('div', { className: 'buttons' })
  buttonsDiv.appendChild(textInput)
  buttonsDiv.appendChild(displayTextButton)
  buttonsDiv.appendChild(getWindowLocationButton)
  buttonsDiv.appendChild(shrinkWindowButton)
  multiDisplayPanel.appendChild(buttonsDiv)
}

function displayTextInWindow(win) {
  const textElement = win.document.getElementById('display-text')
  if (textElement) {
    const text = document.getElementById('text-to-display').value

    textElement.style.fontSize = '20rem'
    textElement.innerHTML = text

    setTimeout(() => {
      textElement.innerHTML = ''
    }, 500)
  }
}
