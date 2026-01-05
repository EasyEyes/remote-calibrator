/**
 * PanelState - Tracks the state of calibration tasks in the panel
 *
 * This module provides state management for the calibration panel,
 * tracking task status, results, and enabling state logging.
 */

export const TaskStatus = Object.freeze({
  PENDING: 'pending',
  ACTIVE: 'active',
  DONE: 'done',
})

export class PanelState {
  constructor() {
    this.reset()
  }

  /**
   * Reset all state to initial values
   */
  reset() {
    this.status = {} // taskId -> TaskStatus
    this.results = {} // taskId -> task result data
    this.taskOrder = [] // ordered list of task IDs
    this.activeTask = null
    this.startTime = null
    this.taskTimestamps = {} // taskId -> { start, end }
  }

  /**
   * Initialize state from panel tasks
   * @param {Array} tasks - Array of task configurations
   */
  initFromTasks(tasks) {
    this.reset()
    this.startTime = performance.now()

    for (const task of tasks) {
      const taskId = this._getTaskId(task)
      this.status[taskId] = TaskStatus.PENDING
      this.results[taskId] = null
      this.taskOrder.push(taskId)
      this.taskTimestamps[taskId] = { start: null, end: null }
    }
  }

  /**
   * Extract task ID from task config
   * @param {string|object} task
   * @returns {string}
   */
  _getTaskId(task) {
    return typeof task === 'string' ? task : task.name
  }

  /**
   * Mark a task as active (started)
   * @param {string} taskId
   */
  setActive(taskId) {
    // Mark previous active task as pending if it wasn't completed
    if (this.activeTask && this.status[this.activeTask] === TaskStatus.ACTIVE) {
      this.status[this.activeTask] = TaskStatus.PENDING
    }

    this.activeTask = taskId
    this.status[taskId] = TaskStatus.ACTIVE
    this.taskTimestamps[taskId] = {
      start: performance.now(),
      end: null,
    }
  }

  /**
   * Mark a task as completed and store its result
   * @param {string} taskId
   * @param {any} result - The task result data
   */
  completeTask(taskId, result) {
    this.status[taskId] = TaskStatus.DONE
    this.results[taskId] = result

    if (this.taskTimestamps[taskId]) {
      this.taskTimestamps[taskId].end = performance.now()
    }

    if (this.activeTask === taskId) {
      this.activeTask = null
    }

    // Log the result data
    console.log(`[PanelState] Task "${taskId}" result:`, result)
  }

  /**
   * Get the result of a specific task
   * @param {string} taskId
   * @returns {any}
   */
  getTaskResult(taskId) {
    return this.results[taskId]
  }

  /**
   * Check if all tasks are complete
   * @returns {boolean}
   */
  isAllComplete() {
    return this.taskOrder.every(
      taskId => this.status[taskId] === TaskStatus.DONE,
    )
  }

  /**
   * Get count of completed tasks
   * @returns {number}
   */
  getCompletedCount() {
    return this.taskOrder.filter(
      taskId => this.status[taskId] === TaskStatus.DONE,
    ).length
  }

  /**
   * Get a snapshot of the current state
   * @returns {object}
   */
  getSnapshot() {
    return {
      timestamp: performance.now(),
      elapsedMs: this.startTime ? performance.now() - this.startTime : 0,
      activeTask: this.activeTask,
      completedCount: this.getCompletedCount(),
      totalTasks: this.taskOrder.length,
      tasks: this.taskOrder.map(taskId => ({
        id: taskId,
        status: this.status[taskId],
        hasResult: this.results[taskId] !== null,
        duration:
          this.taskTimestamps[taskId]?.end && this.taskTimestamps[taskId]?.start
            ? this.taskTimestamps[taskId].end -
              this.taskTimestamps[taskId].start
            : null,
      })),
    }
  }

  /**
   * Log the current state to console
   * @param {string} context - Description of when this log is happening
   * @returns {object} - The snapshot that was logged
   */
  logState(context = '') {
    const snapshot = this.getSnapshot()
    console.log('========================================')
    console.log(`[PanelState] ${context}`)
    console.log(
      `  Progress: ${snapshot.completedCount}/${snapshot.totalTasks} tasks completed`,
    )
    console.log(`  Elapsed: ${(snapshot.elapsedMs / 1000).toFixed(1)}s`)
    console.log('  Tasks:')
    snapshot.tasks.forEach(task => {
      const statusIcon =
        task.status === 'done' ? '✓' : task.status === 'active' ? '►' : '○'
      const duration = task.duration
        ? ` (${(task.duration / 1000).toFixed(1)}s)`
        : ''
      console.log(`    ${statusIcon} ${task.id}: ${task.status}${duration}`)
    })
    console.log('========================================')
    return snapshot
  }
}

/**
 * Factory function to create a new PanelState instance
 * @returns {PanelState}
 */
export function createPanelState() {
  return new PanelState()
}
