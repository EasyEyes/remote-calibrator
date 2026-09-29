/**
 * Host-neutral, observation-only RC lifecycle contract (version 1).
 * No DOM, timers, study policy, participant data, or retained event history.
 */
let nextSourceId = 0

export function createInteractionLifecycle({ onObserverError } = {}) {
  const sourceId = `rc-${++nextSourceId}`
  let nextId = 0
  let dispatching = false
  const observers = new Set()
  const queue = []
  const pendingEnds = new Map()
  let snapshot = freeze({
    version: 1,
    sourceId,
    revision: 0,
    status: 'active',
    coverage: 'partial',
    scopes: [],
    camera: 'unknown',
    recovery: null,
    fullscreenIntents: [],
  })

  function freeze(value) {
    for (const key of ['scopes', 'fullscreenIntents']) {
      value[key].forEach(Object.freeze)
      Object.freeze(value[key])
    }
    if (value.recovery) Object.freeze(value.recovery)
    return Object.freeze(value)
  }

  function report(error) {
    try {
      const result = onObserverError?.(error)
      if (result) void Promise.resolve(result).catch(() => {})
    } catch (_) {
      /* Observation cannot interrupt RC. */
    }
  }

  function notify(observer, state, event) {
    try {
      const result = observer(state, event)
      if (result) void Promise.resolve(result).catch(report)
    } catch (error) {
      report(error)
    }
  }

  function drain() {
    if (dispatching) return
    dispatching = true
    try {
      while (queue.length) {
        const { state, event, targets } = queue.shift()
        for (const entry of targets) {
          if (observers.has(entry)) notify(entry.fn, state, event)
        }
      }
    } finally {
      dispatching = false
    }
  }

  function publish(type, detail, patch) {
    snapshot = freeze({
      ...snapshot,
      ...patch,
      revision: snapshot.revision + 1,
    })
    const event = Object.freeze({
      ...detail,
      type,
      version: 1,
      sourceId,
      revision: snapshot.revision,
    })
    queue.push({ state: snapshot, event, targets: [...observers] })
    drain()
  }

  function endScope(id, outcome = 'completed') {
    const scope = snapshot.scopes.find(item => item.id === id)
    if (!scope || snapshot.status !== 'active') return
    if (snapshot.scopes.some(item => item.parentId === id)) {
      if (pendingEnds.has(id)) return
      pendingEnds.set(id, outcome)
      publish(
        'scope.settling',
        { id, outcome },
        {
          scopes: snapshot.scopes.map(item =>
            item.id === id ? { ...item, phase: 'settling' } : item,
          ),
        },
      )
      return
    }
    pendingEnds.delete(id)
    publish(
      'scope.end',
      { id, outcome },
      {
        scopes: snapshot.scopes.filter(item => item.id !== id),
      },
    )
    if (pendingEnds.has(scope.parentId)) {
      const parentOutcome = pendingEnds.get(scope.parentId)
      pendingEnds.delete(scope.parentId)
      endScope(scope.parentId, parentOutcome)
    }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(fn) {
      const entry = { fn }
      observers.add(entry)
      queue.push({ state: snapshot, event: null, targets: [entry] })
      drain()
      return () => observers.delete(entry)
    },
    beginScope(kind, parentId = null) {
      if (snapshot.status !== 'active') return null
      // A stale parent must not be mistaken for a still-active interaction.
      if (
        parentId !== null &&
        !snapshot.scopes.some(
          item => item.id === parentId && item.phase === 'active',
        )
      )
        parentId = null
      const id = ++nextId
      const scope = { id, kind, parentId, phase: 'active' }
      publish(
        'scope.begin',
        { ...scope },
        { scopes: [...snapshot.scopes, scope] },
      )
      return id
    },
    endScope,
    camera(status) {
      if (snapshot.status !== 'active' || snapshot.camera === status) return
      publish('camera.changed', { status }, { camera: status })
    },
    beginRecovery() {
      if (snapshot.status !== 'active' || snapshot.recovery) return null
      const id = ++nextId
      publish(
        'recovery.begin',
        { id, phase: 'awaiting-resume' },
        {
          recovery: { id, phase: 'awaiting-resume' },
        },
      )
      return id
    },
    recoveryPhase(id, phase) {
      if (
        snapshot.status !== 'active' ||
        snapshot.recovery?.id !== id ||
        snapshot.recovery.phase === phase
      )
        return
      publish('recovery.phase', { id, phase }, { recovery: { id, phase } })
    },
    endRecovery(id, outcome) {
      if (snapshot.status !== 'active' || snapshot.recovery?.id !== id) return
      publish('recovery.end', { id, outcome }, { recovery: null })
    },
    beginFullscreenIntent(kind) {
      if (snapshot.status !== 'active') return null
      const id = ++nextId
      publish(
        'fullscreen.intent.begin',
        { id, kind },
        {
          fullscreenIntents: [...snapshot.fullscreenIntents, { id, kind }],
        },
      )
      return id
    },
    endFullscreenIntent(id) {
      if (
        snapshot.status !== 'active' ||
        !snapshot.fullscreenIntents.some(item => item.id === id)
      )
        return
      publish(
        'fullscreen.intent.end',
        { id },
        {
          fullscreenIntents: snapshot.fullscreenIntents.filter(
            item => item.id !== id,
          ),
        },
      )
    },
    terminate() {
      if (snapshot.status === 'ended') return
      pendingEnds.clear()
      publish(
        'session.ended',
        {},
        {
          status: 'ended',
          scopes: [],
          recovery: null,
          fullscreenIntents: [],
        },
      )
    },
  }
}

/** Explicit enclosing flows; background camera tracking is never a parent. */
export function interactionParent(RC) {
  return (
    RC._cameraSelectionInteraction ??
    RC._recalibrationInteraction ??
    RC._panelInteraction ??
    null
  )
}

/** Retire a dialog only after its result AND DOM destruction are observed. */
export function observeDialog(RC, kind, parentId = interactionParent(RC)) {
  const lifecycle = RC._interactionLifecycle
  const id = lifecycle?.beginScope(kind, parentId)
  let destroyed = false
  let outcome = null
  const finish = () => {
    if (destroyed && outcome) lifecycle?.endScope(id, outcome)
  }
  return {
    id,
    didDestroy() {
      destroyed = true
      finish()
    },
    settled(result) {
      outcome = result?.isConfirmed ? 'completed' : 'cancelled'
      finish()
    },
    failed(error) {
      lifecycle?.endScope(id, 'failed')
      throw error
    },
  }
}
