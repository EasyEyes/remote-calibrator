import { safeExecuteFunc, _copy } from '../components/utils'
import { _isValidCustomizedName } from './panelUtils'

export const _setDebugControl = (RC, panel, panelTasks, panelCallback) => {
  const debugControlElement = document.createElement('div')
  debugControlElement.className = 'rc-panel-debug-control'
  debugControlElement.innerHTML = `<h2>🐛 DEBUG CONTROL</h2><p class="rc-panel-debug-bold-text">Set&nbsp;&nbsp;<code>{ debug: false }</code>&nbsp;&nbsp;for production mode!</p>`

  panel.appendChild(debugControlElement)
  const debugControlRows = [] // Array of task names

  for (let task of panelTasks) {
    let taskName = task.name ? task.name : task

    const rowElement = document.createElement('div')
    rowElement.className = 'rc-panel-debug-control-task-row'
    rowElement.id = 'rc-debugger-row-' + taskName

    let taskDefault = RC._debuggerDefault[taskName]

    if (taskDefault) {
      debugControlElement.innerHTML += `<h3>${taskName}</h3>`

      const inputTypes = {
        n: 'number',
        s: 'string',
      }

      switch (taskName) {
        case 'screenSize':
          for (let valueName in taskDefault.value) {
            rowElement.innerHTML += _createValueElement(
              taskName,
              valueName,
              taskDefault.value[valueName],
              '.value.' + valueName,
              inputTypes.n
            )
          }
          break

        case 'measureDistance':
          rowElement.innerHTML += _createValueElement(
            taskName,
            'value',
            taskDefault.value,
            '.value',
            inputTypes.n
          )
          rowElement.innerHTML += _createValueElement(
            taskName,
            'method',
            taskDefault.method,
            '.method',
            inputTypes.s,
            true
          )
          break

        case 'trackDistance':
          rowElement.innerHTML += _createValueElement(
            taskName,
            'viewingDistanceCm',
            taskDefault.value.viewingDistanceCm,
            '.value',
            inputTypes.n
          )
          rowElement.innerHTML += _createValueElement(
            taskName,
            'PDCm',
            taskDefault.value.PDCm,
            '.value',
            inputTypes.n
          )
          rowElement.innerHTML += _createValueElement(
            taskName,
            'nearPointCm.x',
            taskDefault.value.nearPointCm.x,
            '.value.x',
            inputTypes.n
          )
          rowElement.innerHTML += _createValueElement(
            taskName,
            'nearPointCm.y',
            taskDefault.value.nearPointCm.y,
            '.value.y',
            inputTypes.n
          )
          rowElement.innerHTML += _createValueElement(
            taskName,
            'latencyMs',
            taskDefault.value.latencyMs,
            '.latencyMs',
            inputTypes.n
          )
          rowElement.innerHTML += _createValueElement(
            taskName,
            'method',
            taskDefault.method,
            '.method',
            inputTypes.s,
            true
          )
          break

        case 'trackGaze':
          rowElement.innerHTML += _createValueElement(
            taskName,
            'x',
            taskDefault.value.x,
            '.value.x',
            inputTypes.n
          )
          rowElement.innerHTML += _createValueElement(
            taskName,
            'y',
            taskDefault.value.y,
            '.value.y',
            inputTypes.n
          )
          rowElement.innerHTML += _createValueElement(
            taskName,
            'latencyMs',
            taskDefault.value.latencyMs,
            '.value.latencyMs',
            inputTypes.n
          )
          break

        case 'performance':
          rowElement.innerHTML += _createValueElement(
            taskName,
            'computeArrayFillMHz',
            taskDefault.value.computeArrayFillMHz,
            '.value.computeArrayFillMHz',
            inputTypes.n
          )
          rowElement.innerHTML += _createValueElement(
            taskName,
            'computeRandomMHz',
            taskDefault.value.computeRandomMHz,
            '.value.computeRandomMHz',
            inputTypes.n
          )
          rowElement.innerHTML += _createValueElement(
            taskName,
            'idealFps',
            taskDefault.value.idealFps,
            '.value.idealFps',
            inputTypes.n
          )
          rowElement.innerHTML += _createValueElement(
            taskName,
            'stressFps',
            taskDefault.value.stressFps,
            '.value.stressFps',
            inputTypes.n
          )
          break

        default:
          break
      }

      debugControlElement.appendChild(rowElement)
      debugControlRows.push(taskName)
    } else if (_isValidCustomizedName(taskName)) {
      const filteredName = taskName.replace(/[[ \]]/g, '')
      debugControlElement.innerHTML += `<h3>${
        filteredName.charAt(0).toLowerCase() + filteredName.slice(1)
      }</h3>`
      rowElement.innerHTML +=
        ': ( Customized task result values cannot be pre-filled.'

      debugControlElement.appendChild(rowElement)
      debugControlRows.push(taskName)
    }
  }

  const debuggerNext = document.createElement('button')
  debuggerNext.className = 'rc-panel-debug-control-next'
  debuggerNext.innerHTML = 'Simulate calibration and continue'
  debuggerNext.onclick = () => {
    _wrapValues(RC, debugControlRows)
    // Final callback
    safeExecuteFunc(panelCallback, { timestamp: performance.now() })
    // Fixed final callback
    RC._panelStatus.panelFinished = true
  }
  debugControlElement.appendChild(debuggerNext)
}

const _createValueElement = (
  taskName,
  name,
  defaultValue,
  source,
  type,
  readonly = false
) => {
  return `<div class="value-element">
  <input type="text" id="${taskName}-${name.replace(
    '.',
    '-'
  )}" value="${defaultValue}" data-source="${source}" data-type="${type}"${
    readonly ? 'readonly' : ''
  } />
  <p>${name}</p>
</div>`
}

/* -------------------------------------------------------------------------- */

const _wrapValues = (RC, rowTaskNames) => {
  for (let task of rowTaskNames) {
    const taskRow = document.querySelector('#rc-debugger-row-' + task)
    const newData = {}
    switch (task) {
      case 'screenSize':
        newData.value = {}
        _putData(RC, newData, taskRow)
        RC.newScreenData = _copy(newData)
        break

      case 'measureDistance':
        _putData(RC, newData, taskRow)
        RC.newViewingDistanceData = _copy(newData)
        break

      case 'trackDistance':
        RC.newViewingDistanceData = {
          value: _get(taskRow, '#trackDistance-viewingDistanceCm'),
          latencyMs: _get(taskRow, '#trackDistance-latencyMs'),
          method: _get(taskRow, '#trackDistance-method', 'string'),
          timestamp: RC._debuggerDefault.timestamp,
        }
        RC.newNearPointData = {
          value: {
            x: _get(taskRow, '#trackDistance-nearPointCm-x'),
            y: _get(taskRow, '#trackDistance-nearPointCm-y'),
          },
          timestamp: RC._debuggerDefault.timestamp,
        }
        RC.newPDData = {
          value: _get(taskRow, '#trackDistance-PDCm'),
          timestamp: RC._debuggerDefault.timestamp,
        }
        break

      case 'trackGaze':
        newData.value = {}
        _putData(RC, newData, taskRow)
        RC.newGazePositionData = _copy(newData)
        break

      case 'performance':
        newData.value = {}
        _putData(RC, newData, taskRow)
        RC.newPerformanceData = _copy(newData)
        break

      default:
        break
    }
  }
}

const _get = (parent, id) => {
  const ele = parent.querySelector(id)
  return ele.dataset.type === 'number' ? Number(ele.value) : ele.value
}

const _putData = (RC, newData, taskRow) => {
  for (let ele of taskRow.childNodes) {
    const eleInput = ele.querySelector('input')
    try {
      eval(
        `newData${eleInput.dataset.source} = eleInput.dataset.type === 'number' ? Number(eleInput.value) : eleInput.value`
      )
    } catch (err) {
      err
    }

    newData.timestamp = RC._debuggerDefault.timestamp
  }
  return newData
}
