import tinycolor from 'tinycolor2'

import RemoteCalibrator from '../core'
import text from '../text.json'

// Icons from Google Material UI
import Camera from '../media/photo_camera.svg'
import Phone from '../media/smartphone.svg'

import '../css/panel.scss'

RemoteCalibrator.prototype.removePanel = function () {
  if (!this._hasPanel) return false
  this._panel.panelObserver.unobserve(this._panel.panel)
  this._panel.panel.remove()

  this._panel.panel = null
  this._panel.panelObserver = null
  this._panel.panelTasks = []
  this._panel.panelParent = null
  this._panel.panelOptions = {}
  this._panel.panelCallback = null
  this._panel.panelResolve = null

  this._hasPanel = false
  this._panelFinished = false

  return true
}

RemoteCalibrator.prototype.resetPanel = function (
  tasks = null,
  parent = null,
  options = null,
  callback = null,
  resolveOnFinish = null
) {
  if (!this._hasPanel) return false

  const t = tasks || [...this._panel.panelTasks]
  const o = options || { ...this._panel.panelOptions }
  const c =
    callback && typeof callback === 'function'
      ? callback
      : this._panel.panelCallback
  const r = resolveOnFinish || this._panel.panelResolve

  // New parent
  if (parent !== null && parent !== this._panel.panelParent) {
    this.removePanel()
    return this.panel(t, parent, o, c, r)
  }
  // Current parent, just reset
  return this.panel(t, this._panel.panelParent, o, c, r, true)
}

RemoteCalibrator.prototype.panel = async function (
  tasks,
  parent,
  options = {},
  callback = null,
  resolveOnFinish = null,
  _reset = false // ! Not open for users
) {
  if (this._hasPanel ^ _reset) return false
  /**
   * has rest
   * t   f no
   * t   t ok
   * f   f ok
   * f   t no
   */

  // Tasks
  if (!_validateTask(tasks)) {
    console.error('Invalid task name(s).')
    return false
  }

  // Parent
  const parentElement = document.querySelector(parent)
  if (!parentElement) {
    console.error('Cannot find the parent element.')
    return false
  }

  options = Object.assign(
    {
      headline: text.panel.headline,
      description: text.panel.description,
      nextButton: text.panel.nextButton,
      color: '#3490de',
      _demoActivateAll: false, // ! Not open for users
    },
    options
  )

  // Set theme color
  const darkerColor = tinycolor(options.color).darken(20).toString()
  document.documentElement.style.setProperty(
    '--rc-panel-theme-color',
    options.color
  )
  document.documentElement.style.setProperty(
    '--rc-panel-darken-color',
    darkerColor
  )
  document.documentElement.style.setProperty(
    '--rc-panel-theme-color-semi',
    options.color + '66'
  )
  document.documentElement.style.setProperty(
    '--rc-panel-darken-color-semi',
    darkerColor + '88'
  )

  const panel = document.createElement('div')
  panel.className = panel.id = 'rc-panel'
  panel.innerHTML = `<h1 class="rc-panel-title">${options.headline}</h1>`
  panel.innerHTML += options.description
    ? `<p class="rc-panel-description">${options.description}</p>`
    : ''
  panel.innerHTML += '<div class="rc-panel-steps" id="rc-panel-steps"></div>'

  if (!_reset) parentElement.appendChild(panel)
  else parentElement.replaceChild(panel, this._panel.panel) // ! reset

  const steps = panel.querySelector('#rc-panel-steps')

  // Observe panel size for adjusting steps
  const panelObserver = new ResizeObserver(() => {
    _setStepsClassesSL(steps, panel.offsetWidth)
  })
  panelObserver.observe(panel)
  _setStepsClassesSL(steps, panel.offsetWidth)

  if (tasks.length === 0) {
    steps.className += ' rc-panel-no-steps'
  } else {
    for (let t in tasks) {
      const b = _newStepBlock(t, tasks[t], options)
      steps.appendChild(b)
    }
  }

  steps.appendChild(_nextStepBlock(tasks.length, options))

  // Activate the first one
  let current = { index: 0, finished: [] }
  _activateStepAt(this, current, tasks, options, callback)

  this._panel.panel = panel
  this._panel.panelObserver = panelObserver
  this._panel.panelTasks = tasks
  this._panel.panelParent = parent
  this._panel.panelOptions = options
  this._panel.panelCallback = callback
  this._panel.panelResolve = resolveOnFinish

  this._hasPanel = true
  this._panelFinished = false

  if (resolveOnFinish === null) resolveOnFinish = true

  return new Promise(resolve => {
    const _ = setInterval(() => {
      if (this._panelFinished) {
        clearInterval(_)
        resolve(resolveOnFinish)
      }
    }, 300)
  })
}

/**
 * USE
 * 0 - Nothing
 * 1 - Screen
 * 2 - Screen and webcam
 * 3 - Screen, webcam, and smartphone
 */
const _validTaskList = {
  screenSize: {
    use: 1,
    name: 'Screen Size',
  },
  displaySize: {
    use: 0,
    name: 'Display Size',
  },
  measureDistance: {
    use: 2,
    name: 'Viewing Distance',
  },
  trackDistance: {
    use: 2,
    name: 'Head Tracking',
  },
  trackGaze: {
    use: 2,
    name: 'Gaze Tracking',
  },
  environment: {
    use: 0,
    name: 'System Information',
  },
}
const _validTaskListNames = Object.keys(_validTaskList)

const _validateTask = task => {
  if (!Array.isArray(task)) return false
  for (let t of task) {
    if (
      typeof t === 'object' &&
      (t === null || !_validTaskListNames.includes(t.name))
    )
      return false
    else if (typeof t === 'string' && !_validTaskListNames.includes(t))
      return false
  }
  return true
}

const _newStepBlock = (index, task, options) => {
  let useCode = _validTaskList[_getTaskName(task)].use
  let use, useTip

  switch (useCode) {
    case 0:
      use = ''
      useTip = ''
      break
    case 1:
      use = ''
      useTip = ''
      break
    case 2:
      use = Camera
      useTip = 'Uses webcam.'
      break
    case 3:
      use = Camera + Phone
      useTip = 'Uses webcam and smartphone.'
      break
    default:
      use = ''
      useTip = ''
      break
  }

  const b = document.createElement('button')
  b.className =
    'rc-panel-step rc-panel-step-todo' +
    (options._demoActivateAll
      ? ' rc-panel-step-active'
      : ' rc-panel-step-inactive')
  b.dataset.index = index
  b.innerHTML =
    (use.length ? `<p class="rc-panel-step-use">${use}</p>` : '') +
    `<p class="rc-panel-step-name">${Number(index) + 1}&nbsp;&nbsp;${
      _validTaskList[_getTaskName(task)].name
    }</p>` +
    (use.length ? `<p class="rc-panel-step-use-tip">${use} ${useTip}</p>` : '')
  // b.disabled = true
  return b
}

const _nextStepBlock = (index, options) => {
  const b = document.createElement('button')
  b.className = 'rc-panel-step rc-panel-next-button rc-panel-step-inactive'
  b.dataset.index = index
  b.innerHTML = `<p class="rc-panel-step-name">${options.nextButton}</p>`
  // b.disabled = false
  return b
}

const _setStepsClassesSL = (steps, panelWidth) => {
  if (panelWidth < 640) {
    steps.classList.add('rc-panel-steps-s')
    steps.classList.remove('rc-panel-steps-l')
  } else {
    steps.classList.add('rc-panel-steps-l')
    steps.classList.remove('rc-panel-steps-s')
  }
}

const _activateStepAt = (RC, current, tasks, options, finalCallback) => {
  document.querySelectorAll('.rc-panel-step').forEach((e, ind) => {
    if (!options._demoActivateAll) {
      // Default situation
      if (Number(e.dataset.index) === current.index) {
        e.classList.replace('rc-panel-step-inactive', 'rc-panel-step-active')
        if (Number(e.dataset.index) !== tasks.length) {
          e.onclick = () => {
            RC[_getTaskName(tasks[current.index])](
              ..._getTaskOptionsCallbacks(tasks[current.index])
            )
            _finishStepAt(current.index)
            current.index++
            _activateStepAt(RC, current, tasks, options, finalCallback)
          }
        } else {
          e.onclick = () => {
            RC._panelFinished = true
            if (finalCallback && typeof finalCallback === 'function')
              finalCallback()
          }
        }
      }
    } else {
      // Demo active all
      e.onclick = () => {
        RC[_getTaskName(tasks[ind])](..._getTaskOptionsCallbacks(tasks[ind]))
        _finishStepAt(ind)
        current.finished.push(_getTaskName(tasks[ind]))
        // Check if all finished
        for (let t of tasks) {
          if (!current.finished.includes(_getTaskName(t))) return
        }
        // If so, activate the next step button
        let finalButton = document.querySelector('.rc-panel-next-button')
        finalButton.classList.replace(
          'rc-panel-step-inactive',
          'rc-panel-step-active'
        )
        finalButton.onclick = () => {
          RC._panelFinished = true
          if (finalCallback && typeof finalCallback === 'function')
            finalCallback()
        }
      }
    }
  })
}

const _finishStepAt = index => {
  document.querySelectorAll('.rc-panel-step').forEach(e => {
    if (Number(e.dataset.index) === index) {
      e.classList.replace('rc-panel-step-todo', 'rc-panel-step-finished')
      e.classList.replace('rc-panel-step-active', 'rc-panel-step-inactive')
    }
  })
}

const _getTaskName = task => {
  if (typeof task === 'string') return task
  return task.name
}

const _getTaskOptionsCallbacks = task => {
  if (typeof task === 'string') return []

  if (['displaySize', 'environment'].includes(task.name)) {
    return [task.callback || null]
  } else if (['screenSize', 'trackGaze'].includes(task.name)) {
    return [task.options || {}, task.callback || null]
  } else if (['trackDistance'].includes(task.name)) {
    return [
      task.options || {},
      task.callbackStatic || null,
      task.callbackTrack || null,
    ]
  }
}
