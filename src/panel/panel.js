import RemoteCalibrator from '../core'
import text from '../text.json'

import './panel.scss'

RemoteCalibrator.prototype.panel = function (
  tasks,
  parent,
  options = {},
  callback
) {
  // Tasks
  if (!_validateTask(tasks)) {
    console.error('Invalid task name(s).')
    return
  }

  // Parent
  const parentElement = document.querySelector(parent)
  if (!parentElement) {
    console.error('Cannot find the parent element.')
    return
  }

  options = Object.assign(
    {
      headline: text.panel.headline,
      description: text.panel.description,
      _demoActivateAll: false,
    },
    options
  )

  const panel = document.createElement('div')
  panel.className = panel.id = 'rc-panel'
  panel.innerHTML = `<h1 class="rc-panel-title">${options.headline}</h1>`
  panel.innerHTML += `<p class="rc-panel-description">${options.description}</p>`
  panel.innerHTML += '<div class="rc-panel-steps" id="rc-panel-steps"></div>'
  parentElement.appendChild(panel)

  const steps = parentElement.querySelector('#rc-panel-steps')

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

  steps.appendChild(_nextStepBlock(tasks.length))

  // Activate the first one
  let current = { index: 0 }
  _activateStepAt(this, current, tasks, options, callback)
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
    name: 'Viewing Distance Tracking',
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
      use = '🖱️'
      useTip = 'Requires no extra device.'
      break
    case 1:
      use = '🖥️'
      useTip = 'Uses screen.'
      break
    case 2:
      use = '🖥️ 📷'
      useTip = 'Uses screen and webcam.'
      break
    case 3:
      use = '🖥️ 📷 📱'
      useTip = 'Uses screen, webcam, and smartphone.'
      break
    default:
      use = '🖱️'
      useTip = 'Requires no extra device.'
      break
  }

  const b = document.createElement('button')
  b.className =
    'rc-panel-step rc-panel-step-todo' +
    (options._demoActivateAll
      ? ' rc-panel-step-active'
      : ' rc-panel-step-inactive')
  b.dataset.index = index
  b.innerHTML = `<p class="rc-panel-step-header"><span class="rc-panel-step-index">${
    Number(index) + 1
  }</span><span class="rc-panel-step-use">${use}<span class="rc-panel-step-use-tip">${useTip}</span></span></p><p class="rc-panel-step-name">${
    _validTaskList[_getTaskName(task)].name
  }</p>`
  // b.disabled = true
  return b
}

const _nextStepBlock = index => {
  const b = document.createElement('button')
  b.className = 'rc-panel-step rc-panel-step-finish rc-panel-step-inactive'
  b.dataset.index = index
  b.innerHTML = '<p class="rc-panel-step-name">Next Step</p>'
  // b.disabled = false
  return b
}

const _setStepsClassesSL = (steps, panelWidth) => {
  if (panelWidth < 540) {
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
            _finishStepAt(current)
            current.index++
            _activateStepAt(RC, current, tasks, options, finalCallback)
          }
        } else {
          e.onclick = finalCallback
        }
      }
    } else {
      // Demo active all
      e.onclick = () => {
        RC[_getTaskName(tasks[ind])](..._getTaskOptionsCallbacks(tasks[ind]))
        _finishStepAt(ind)
      }
    }
  })
}

const _finishStepAt = current => {
  document.querySelectorAll('.rc-panel-step').forEach(e => {
    if (Number(e.dataset.index) === current.index) {
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
