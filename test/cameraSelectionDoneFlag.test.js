const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

// ─────────────────────────────────────────────────────────────────────────────
// Camera-selection done-flag semantics (field/sim bug, EasyEyes 2026-10-02:
// every simulated distance-calibration session ended at the compatibility
// step with zero camera UI shown).
//
//  D1  `RC._cameraSelectionDone` is the "skip future camera selection"
//      fast-path flag. It was set whenever a camera-selection flow returned
//      WITHOUT `experimentEnded` — including when the flow ended with NO
//      camera selected (dismissed popup, undriven early popup, early
//      bail-outs that resolve null). The later `selectCamera` call then hit
//      the fast path and returned `{ selectedCamera: null, alreadyDone:
//      true }`, which EasyEyes maps to "no camera detected" and ends the
//      session — no UI, no retry, no trial ever runs.
//
//  D2  distanceTrack.js set the flag UNCONDITIONALLY — even when the flow
//      reported `experimentEnded`.
//
// Contract: the done flag means "a camera WAS selected and locked in".
// A camera-less outcome must leave it false so the next selectCamera runs
// the full flow again (at a moment the host app chooses).
// ─────────────────────────────────────────────────────────────────────────────

const srcOf = f => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8')

/** All assignment lines for the flag in a source file (comments stripped). */
const flagAssignmentsIn = src =>
  src
    .split('\n')
    .map((line, i) => ({
      line: line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, ''),
      no: i + 1,
    }))
    .filter(({ line }) => /\._cameraSelectionDone\s*=\s*true/.test(line))

/** The guard condition directly above an assignment (nearest `if` line). */
const guardAbove = (lines, idx) => {
  for (let j = idx - 1; j >= 0 && j >= idx - 4; j--) {
    const m = /\bif\s*\((.*)\)/.exec(lines[j].line)
    if (m) return m[1]
  }
  return null
}

describe('camera selection done-flag semantics', function () {
  const cases = [
    ['cameraSelection.js', srcOf('cameraSelection.js')],
    ['panel/panel.js', srcOf('panel/panel.js')],
    ['distance/distanceTrack.js', srcOf('distance/distanceTrack.js')],
  ]

  it('every true-assignment is guarded by an actually-selected camera', function () {
    for (const [file, src] of cases) {
      const lines = src.split('\n').map((line, i) => ({
        line: line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, ''),
        no: i + 1,
      }))
      const assigns = flagAssignmentsIn(src)
      assert.ok(
        assigns.length > 0,
        `${file}: expected at least one _cameraSelectionDone = true assignment`,
      )
      for (const a of assigns) {
        const guard = guardAbove(lines, a.no - 1)
        assert.ok(
          guard !== null,
          `${file}:${a.no}: assignment must sit under an if-guard`,
        )
        assert.match(
          guard,
          /selectedCamera/,
          `${file}:${a.no}: guard must require an actually-selected camera — ` +
            `!experimentEnded alone marks camera-less flows done (the "already ` +
            `completed" fast path then returns selectedCamera:null and hosts end ` +
            `the session as no-camera)`,
        )
      }
    }
  })

  it('the selectCamera fast path cannot fire without a selected camera', function () {
    const src = srcOf('cameraSelection.js')
    // With the guards above, the flag is only ever true alongside a selected
    // camera; the fast path's `this.selectedCamera || null` is then always a
    // real camera. Belt: also never advertise alreadyDone when camera-less.
    assert.doesNotMatch(
      src,
      /alreadyDone:\s*true[\s\S]{0,120}selectedCamera:\s*(null|this\.selectedCamera\s*\|\|\s*null)/,
      'the fast path must not pair alreadyDone:true with a null camera',
    )
  })

  it('distanceTrack no longer sets the flag when the experiment ended', function () {
    const src = srcOf('distance/distanceTrack.js')
    const lines = src.split('\n').map(l => l.replace(/\/\/.*$/, ''))
    const idx = lines.findIndex(l =>
      /\._cameraSelectionDone\s*=\s*true/.test(l),
    )
    assert.ok(idx >= 0, 'expected the assignment in distanceTrack.js')
    const nearby = lines.slice(Math.max(0, idx - 4), idx + 1).join('\n')
    assert.match(
      nearby,
      /selectedCamera/,
      'distanceTrack assignment must check selectedCamera (was unconditional, ' +
        'marking done even on experimentEnded)',
    )
  })
})
