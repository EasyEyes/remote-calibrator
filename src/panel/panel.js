import tinycolor from 'tinycolor2'

import { safeExecuteAsyncFunc, safeExecuteFunc } from '../components/utils'
import RemoteCalibrator from '../core'
import { _setDebugControl } from './panelDebugControl'
import { phrases } from '../i18n'

// Icons from Google Material UI
import Camera from '../media/photo-camera.svg'
import Phone from '../media/smartphone.svg'

import '../css/panel.scss'
import {
  _clearPanelIntervals,
  _finishStepAt,
  _getTaskName,
  _getTaskOptionsCallbacks,
  _isValidCustomizedName,
  _parseCustomizedName,
  _setLanguagePicker,
  _validateTask,
  _validTaskList,
} from './panelUtils'

RemoteCalibrator.prototype.removePanel = function () {
  if (!this._panelStatus.hasPanel) return false
  this._panel.panelObserver.unobserve(this._panel.panel)
  this._panel.panel.remove()

  this._panel.panel = null
  this._panel.panelObserver = null
  this._panel.panelTasks = []
  this._panel.panelParent = null
  this._panel.panelOptions = {}
  this._panel.panelCallback = null
  this._panel.panelResolve = null

  this._panelStatus.hasPanel = false
  this._panelStatus.panelFinished = false
  _clearPanelIntervals(this)

  return true
}

RemoteCalibrator.prototype.resetPanel = function (
  tasks = null,
  parent = null,
  options = null,
  callback = null,
  resolveOnFinish = null
) {
  if (!this._panelStatus.hasPanel) return false

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
  _clearPanelIntervals(this)
  return this.panel(t, this._panel.panelParent, o, c, r, true)
}

RemoteCalibrator.prototype.panel = async function (
  tasks,
  parent,
  options = {},
  callback = null,
  resolveOnFinish = null,
  __reset__ = false // ! Not available to users
) {
  if (this._panelStatus.hasPanel ^ __reset__) return false
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
      headline: phrases.RC_panelTitle[this.L],
      description: phrases.RC_panelIntro[this.L],
      showNextButton: false,
      nextHeadline: phrases.RC_panelTitleNext[this.L],
      nextDescription: phrases.RC_panelIntroNext[this.L],
      nextButton: phrases.RC_panelButton[this.L],
      color: '#3490de',
      debug: false,
      i18n: true,
      _demoActivateAll: false, // ! Private
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
  if (this.LD === this._CONST.RTL) panel.className += ' rc-lang-rtl'
  else panel.className += ' rc-lang-ltr'

  if (options.i18n) {
    panel.innerHTML += `<div class="rc-panel-language-parent" id="rc-panel-language-parent"></div>`
  }
  panel.innerHTML += `<h1 class="rc-panel-title" id="rc-panel-title">${options.headline}</h1>`
  panel.innerHTML += `<p class="rc-panel-description" id="rc-panel-description">${options.description}</p>`
  panel.innerHTML += '<div class="rc-panel-steps" id="rc-panel-steps"></div>'

  if (!__reset__) parentElement.appendChild(panel)
  else parentElement.replaceChild(panel, this._panel.panel) // ! reset

  const steps = panel.querySelector('#rc-panel-steps')

  // Observe panel size for adjusting steps
  const RC = this
  const panelObserver = new ResizeObserver(() => {
    _setStepsClassesSL(steps, panel.offsetWidth, RC.LD)
  })
  panelObserver.observe(panel)
  _setStepsClassesSL(steps, panel.offsetWidth, this.LD)

  if (tasks.length === 0) {
    steps.className += ' rc-panel-no-steps'
  } else {
    for (let t in tasks) {
      const b = _newStepBlock(this, t, tasks[t], options)
      steps.appendChild(b)
    }
  }

  if (options.showNextButton || options._demoActivateAll)
    steps.appendChild(_nextStepBlock(tasks.length, options))

  // Activate the first one
  let current = { index: 0, finished: [] }
  _activateStepAt(this, current, tasks, options, callback)

  this._panel.panel = panel
  this._panel.panelObserver = panelObserver
  this._panel.panelTasks = tasks
  this._panel.panelParent = parent

  const tempOptions = { ...options }
  if (options.headline === phrases.RC_panelTitle[this.L])
    delete tempOptions.headline
  if (options.description === phrases.RC_panelIntro[this.L])
    delete tempOptions.description
  if (options.nextHeadline === phrases.RC_panelTitleNext[this.L])
    delete tempOptions.nextHeadline
  if (options.nextDescription === phrases.RC_panelIntroNext[this.L])
    delete tempOptions.nextDescription
  if (options.nextButton === phrases.RC_panelButton[this.L])
    delete tempOptions.nextButton

  this._panel.panelOptions = tempOptions

  this._panel.panelCallback = callback
  this._panel.panelResolve = resolveOnFinish

  this._panelStatus.hasPanel = true
  this._panelStatus.panelFinished = false

  if (options.i18n)
    _setLanguagePicker(
      this,
      document.querySelector('#rc-panel-language-parent'),
      darkerColor
    )

  if (options.debug) _setDebugControl(this, panel, tasks, callback)

  if (resolveOnFinish === null) resolveOnFinish = true

  return new Promise(resolve => {
    const _ = setInterval(() => {
      if (this._panelStatus.panelFinished) {
        clearInterval(_)
        resolve(resolveOnFinish)
      }
    }, 100)
    this._panelStatus.panelResolveIntervals.push(_)
  })
}

const _newStepBlock = (RC, index, task, options) => {
  let useCode, use, useTip

  if (
    !_validTaskList[_getTaskName(task)] &&
    _isValidCustomizedName(_getTaskName(task))
  )
    useCode = -1
  else useCode = _validTaskList[_getTaskName(task)].use

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
      useTip = phrases.RC_panelUsesWebcam[RC.L]
      break
    case 3:
      use = Camera + Phone
      useTip = phrases.RC_panelUsesWebcamPhone[RC.L]
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
      _isValidCustomizedName(_getTaskName(task))
        ? _parseCustomizedName(_getTaskName(task))
        : phrases[_validTaskList[_getTaskName(task)].phraseHandle][RC.L]
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

const _setStepsClassesSL = (steps, panelWidth, LD) => {
  if (panelWidth < 640) {
    steps.classList.add('rc-panel-steps-s')
    steps.classList.remove('rc-panel-steps-l')

    steps.childNodes.forEach(e => {
      e.classList.add(`rc-lang-${LD.toLowerCase()}`)
    })
  } else {
    steps.classList.add('rc-panel-steps-l')
    steps.classList.remove('rc-panel-steps-s')

    steps.childNodes.forEach(e => {
      e.classList.remove(`rc-lang-ltr`)
      e.classList.remove(`rc-lang-rtl`)
    })
  }
}

const _activateStepAt = (RC, current, tasks, options, finalCallback) => {
  document.querySelectorAll('.rc-panel-step').forEach((e, ind) => {
    const eIndex = Number(e.dataset.index)

    if (!options._demoActivateAll) {
      // Default situation
      if (eIndex === current.index) {
        e.classList.replace('rc-panel-step-inactive', 'rc-panel-step-active')
        e.focus()

        if (eIndex !== tasks.length) {
          if (eIndex === tasks.length - 1 && !options.showNextButton) {
            // Last task without next button
            e.onclick = async () => {
              const currentTask = tasks[current.index]
              const currentTaskName = _getTaskName(currentTask)

              if (_isValidCustomizedName(currentTaskName)) {
                await safeExecuteAsyncFunc(currentTask.function)

                _finishStepAt(current.index) // fixedTaskCallback
                safeExecuteFunc(finalCallback, { timestamp: performance.now() }) // finalCallback
                RC._panelStatus.panelFinished = true // fixedFinalCallback
              } else {
                RC[_getTaskName(tasks[current.index])](
                  ..._getTaskOptionsCallbacks(
                    tasks[current.index],
                    // Fixed task callback
                    () => {
                      _finishStepAt(current.index)
                    },
                    finalCallback,
                    // Fixed final callback
                    () => {
                      RC._panelStatus.panelFinished = true
                    }
                  )
                )
              }
            }
          } else {
            // Interim tasks
            e.onclick = async () => {
              const currentTask = tasks[current.index]
              const currentTaskName = _getTaskName(currentTask)

              const fixedTaskCallback = () => {
                _finishStepAt(current.index)
                current.index++
                _activateStepAt(RC, current, tasks, options, finalCallback)
              }

              if (_isValidCustomizedName(currentTaskName)) {
                await safeExecuteAsyncFunc(currentTask.function)
                fixedTaskCallback()
              } else {
                RC[currentTaskName](
                  ..._getTaskOptionsCallbacks(
                    tasks[current.index],
                    // Fixed task callback
                    fixedTaskCallback
                  )
                )
              }
            }
          }
        } else if (eIndex === tasks.length && options.showNextButton) {
          // All tasks finished with next button
          // Change headline and description
          const { headline, nextHeadline, description, nextDescription } =
            options
          if (headline !== nextHeadline)
            document.querySelector('#rc-panel-title').innerHTML = nextHeadline
          if (description !== nextDescription)
            document.querySelector('#rc-panel-description').innerHTML =
              nextDescription

          e.onclick = () => {
            RC._panelStatus.panelFinished = true
            safeExecuteFunc(finalCallback, { timestamp: performance.now() })
          }
        }
      }
    } else {
      // Demo active all
      e.onclick = async () => {
        const currentTask = tasks[ind]
        const currentTaskName = _getTaskName(currentTask)

        if (_isValidCustomizedName(currentTaskName)) {
          await safeExecuteAsyncFunc(currentTask.function)
        } else {
          RC[_getTaskName(tasks[ind])](..._getTaskOptionsCallbacks(tasks[ind]))
        }

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
          RC._panelStatus.panelFinished = true
          safeExecuteFunc(finalCallback, { timestamp: performance.now() })
        }
      }
    }
  })
}
