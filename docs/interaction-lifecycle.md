# RC interaction lifecycle and host coordination

Status: lifecycle observations are connected to the EasyEyes adapter. The host's
preserving fullscreen-pause controller is opt-in in development through
`?interactionMode=manage`; `?interactionMode=observe` only records diagnostics.
RC still owns its calibration flow, camera service and internal recovery UI.

## Public API

```js
const snapshot = RC.getInteractionSnapshot()
const unsubscribe = RC.onInteractionChange((snapshot, event) => {
  // event === null on initial subscription.
  // Use snapshot.version/sourceId/revision to validate observation continuity.
  // Observe only: do not open dialogs or advance the study from this callback.
})
// Later:
unsubscribe()
```

Subscriptions work before camera initialization. Each RC instance owns one
reporter. The reporter imports neither EasyEyes nor its coordinator. The host
adapter validates versions and revision continuity before accepting observations.

Snapshots and events are immutable. Each accepted change increments a revision.
Observers are invoked synchronously in revision order, are never awaited, and
their exceptions/rejections cannot stop RC. Reentrant notifications are queued;
a subscriber added during notification receives its captured current snapshot
before subsequent changes. No unbounded event history, participant data, device
identifiers, camera frames, timers, polling or per-frame reporting is added.

## What is reported

| Source                          | Observation boundary                                                                                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public selectCamera             | Begins after the initialized/already-selected checks; finishes after the existing video/background cleanup. Cached selection creates no scope. Errors preserve the original rejection.            |
| Calibration panel               | Begins after input validation; the existing completion callback requests completion. Empty/cached panels still call back and return as before. Reset/removal cancels the old panel claim.         |
| Camera dialogs                  | Choose Camera, Choose Screen, no-camera, permission explanation, startup retry, and the optional resolution page are reported.                                                                    |
| Glasses reminder                | Remains active until its result is available and its SweetAlert view is destroyed. Proceed's existing promise is not delayed by observation.                                                      |
| Recalibration                   | Begins before the existing start hook. Setup returning is not completion; the first live-frame callback requests completion. Startup failure/full distance teardown reports failure/cancellation. |
| Camera service                  | Reports ready, disconnected, reconnecting, failed or unknown independently of page scopes. Stale startup generations do not update the current report.                                            |
| Recovery UI                     | Awaiting Resume → attempting → retry/settling → ended. End requires the recovery flow's existing cleanup and destruction of its last dialog.                                                      |
| Choose Screen fullscreen intent | Begins before the existing intentional exit; ends on returning to Choose Camera or closing the picker. Actual browser fullscreen state remains a host observation.                                |
| Comprehensive RC quit cleanup   | Ends observation for that RC instance and invalidates remaining claims; delayed notifications cannot reopen them.                                                                                 |

Scopes have an ID, kind, explicit parent ID and phase. If a parent finishes while
a child dialog is still closing, it is marked settling and retires after the
child. Cancellation/failure outcomes describe the operation; they do not guarantee
that arbitrary legacy callbacks or resources were disposed. Observation performs
no resource cleanup itself.

Camera readiness does not release the current page or recovery interaction. In
particular, WebGazer reports successful reconnection before the minimum spinner
duration ends. Its additive optional recovery observer reports the later UI
boundary separately. Notifications from an older recovery cannot end a newer one.
If another disconnect starts before the preceding dialog finishes closing, RC
reports one continuous recovery interaction until the newest recovery releases
its UI. Its source generation still changes so older completion events are ignored.

## Coverage and limits

Version 1 advertises `coverage: 'partial'` deliberately. Empty scopes do not prove
that EasyEyes owns the page. The main camera/panel/recalibration paths are covered,
but standalone calibration/gaze methods, nudgers, internal camera-opinion overlays,
all intentional fullscreen exits and every exceptional legacy cleanup path still
need a coverage audit before enforcing policy. A legacy flow whose promise never
settles may remain active; this API does not repair that flow.

The calibration panel is a coarse parent scope; this change does not turn every
RC page into a state-machine state. Background tracking never implies a
participant-facing calibration scope. Hosts still own study-session termination;
RC's ended status is tied to its comprehensive quit cleanup.

Partial observations must not grant blanket ownership or mark coordinator
coverage known. The opt-in host policy uses explicit recovery and fullscreen
intent signals. Otherwise it presents an overlay that preserves the existing
page and pending dialog promise, including when ownership is unknown. The host
adapter retains bounded diagnostic traces for comparison with participant screens.

## Optional host coordination

```js
const detachHost = RC.attachInteractionHost({
  handlesFullscreenRecovery: true,
  isInputBlocked: () => hostInputIsBlocked(),
})
// On host-session cleanup:
detachHost()
```

The lease lets a host handle fullscreen restoration after camera recovery and
block RC keypad callbacks while its pause overlay is active. Detaching an older
lease cannot remove a newer host. Comprehensive RC cleanup also clears the lease.
Without a host, RC retains its existing fullscreen recovery fallback.

Camera reconnection restores the stream and notifies current subscribers. It no
longer replays the historical camera-resolution page from saved selection options;
doing so could revive a completed calibration preview during an acuity block.
An active camera-selection flow retains its own retry/subscription handling.
RC's internal sleep/recovery dialogs still use their existing UI lifecycle; the
host preserving overlay specifically addresses fullscreen interruptions.

### Page-scoped camera recovery

The object measurement step uses `subscribeCameraRecovery` to own its reconnect
callbacks. Its release function is shared by the step's contexts and is invoked
when measurements finish, before the glasses reminder, distance check or blindspot
flow opens. Cancellation and restart release it too. Release removes both camera
listeners, detaches the measurement keyboard handler and invalidates late callbacks.
While the step is active, recovery retains its existing measurement retry behavior.
A completed step cannot redraw its preview/circle or roll back accepted samples.

The host coordinator cannot enforce this through popup ordering alone: RC must
also retire the callbacks belonging to the page whose interaction has ended.

## Compatibility with the September 25 Choose Camera fix

Commit 5ad07d3 and cameraCommitGate remain authoritative for camera commits:
a windowed click/Enter can request fullscreen on that same gesture; Choose Screen
still ignores camera commits; failed fullscreen entry still rejects the commit.
The notification hooks add no awaited observer between a gesture and that gate.
The finite-coordinate and object-restart fixes from the same commit are untouched.

## Verification and release

The RC test entry includes contract tests, actual RC callback/return tests, dialog
lifetime tests and recovery bridge tests, alongside the existing cameraCommitGate,
camera monitor and recalibration regressions. Test both no observer and observers
that throw. Browser/hardware sleep-wake testing is still required before rollout.

Run the repository's test command in its supported Node environment. Test bundling
also compiles the RC integration and WebGazer additions. Source changes alone do
not update the published bundle or the RC version consumed by EasyEyes.

WebGazer is a Git submodule: the recovery observer and helper must be included in
the corresponding WebGazer change, then its revision pinned by RC before building
a release. Local bundles may be rebuilt for opt-in testing; this work does not
publish a release, change package versions or update the gitlink.
