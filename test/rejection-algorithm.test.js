/**
 * rejection-algorithm.test.js
 *
 * Deterministic unit tests for the core fOverWidth rejection algorithm.
 * Tests the tolerance checking (checkConsecutiveMeasurementTolerance) and
 * the location measurement state manager (createLocationMeasurementManager)
 * without any webcam, face detection, or DOM dependencies.
 *
 * Test plan:
 *   A — No rejections (baseline)
 *   B — One rejection: reject BOTH and restart from first rejected
 *   C — Multiple rejections in a row (state reset is correct)
 *   D — Boundary condition (exactly at threshold)
 *   E — Rejection in the middle of a longer sequence
 */

const assert = require('node:assert')

const {
  checkConsecutiveMeasurementTolerance,
  parseLocationsArray,
  parseLocationEye,
} = require('../src/distance/object/locationUtils')

const {
  createLocationMeasurementManager,
} = require('../src/distance/object/locationManager')

/* ============================================================================
 * Helper: simulate the calibration loop with injected fOverWidth values
 * ============================================================================
 *
 * This mirrors the real flow in distance.js:
 *   1. Get current location info
 *   2. Feed next fOverWidth from the sequence
 *   3. Check tolerance (first measurement always passes)
 *   4. If pass  → store measurement, advance to next location
 *   5. If fail  → rejectAndGoBack(1) (pop 1 stored + go back 1 index)
 *
 * The key insight: the current fOverWidth is NEVER stored before the tolerance
 * check, so on rejection we only need to pop 1 (the previous measurement).
 */
function simulateCalibrationLoop(
  locationString,
  allowedRatio,
  fOverWidthSequence,
) {
  const locations = parseLocationsArray(locationString)
  const manager = createLocationMeasurementManager(locations)

  let seqIdx = 0
  const rejections = []
  const log = []

  while (!manager.isComplete() && seqIdx < fOverWidthSequence.length) {
    const currentFOverWidth = fOverWidthSequence[seqIdx]
    seqIdx++

    const locInfo = manager.getCurrentLocationInfo()
    const prevF = manager.getPreviousFOverWidth()

    // Check tolerance with previous measurement
    const result = manager.checkTolerance(currentFOverWidth, allowedRatio)

    if (!result.pass) {
      // REJECT: current was never stored, pop 1 (the previous) and go back 1
      const entry = {
        action: 'reject',
        index: locInfo.index,
        locEye: locInfo.locEye,
        current: currentFOverWidth,
        previous: prevF,
        ratio: result.ratio,
      }
      log.push(entry)
      rejections.push(entry)
      manager.rejectAndGoBack(1)
    } else {
      // ACCEPT: store measurement and advance
      manager.storeMeasurement({
        fOverWidth: currentFOverWidth,
        factorCmPx: currentFOverWidth * 10, // dummy for test
      })
      log.push({
        action: 'accept',
        index: locInfo.index,
        locEye: locInfo.locEye,
        current: currentFOverWidth,
        previous: prevF,
      })
      manager.advanceToNext()
    }
  }

  return {
    manager,
    rejections,
    log,
    acceptedValues: manager.getCompletedMeasurements().map(m => m.fOverWidth),
    isComplete: manager.isComplete(),
    completedMeasurements: manager.getCompletedMeasurements(),
  }
}

/* ============================================================================
 * UNIT TESTS: checkConsecutiveMeasurementTolerance
 * ============================================================================ */

describe('Rejection Algorithm — Tolerance Function', function () {
  it('should always pass for the first measurement (previous is null)', function () {
    const result = checkConsecutiveMeasurementTolerance(100, null, 1.05)
    assert.strictEqual(result.pass, true)
    assert.strictEqual(result.ratio, null)
    assert.strictEqual(result.logRatio, null)
  })

  it('should always pass for the first measurement (previous is undefined)', function () {
    const result = checkConsecutiveMeasurementTolerance(100, undefined, 1.05)
    assert.strictEqual(result.pass, true)
  })

  it('should pass when ratio is within tolerance', function () {
    // 105/100 = 1.05, allowedRatio = 1.10 → pass
    const result = checkConsecutiveMeasurementTolerance(105, 100, 1.1)
    assert.strictEqual(result.pass, true)
  })

  it('should pass when values are identical', function () {
    const result = checkConsecutiveMeasurementTolerance(100, 100, 1.05)
    assert.strictEqual(result.pass, true)
    assert.ok(Math.abs(result.logRatio) < 1e-10) // effectively zero
  })

  it('should reject when ratio exceeds tolerance (current > previous)', function () {
    // 140/100 = 1.4, allowedRatio = 1.05 → reject
    const result = checkConsecutiveMeasurementTolerance(140, 100, 1.05)
    assert.strictEqual(result.pass, false)
    assert.ok(result.ratio > 1.05)
  })

  it('should reject when ratio exceeds tolerance (current < previous)', function () {
    // 100/140 ≈ 0.714, log10(100/140) ≈ -0.146, abs = 0.146 > log10(1.05) ≈ 0.021
    const result = checkConsecutiveMeasurementTolerance(100, 140, 1.05)
    assert.strictEqual(result.pass, false)
  })

  it('should pass at exactly the boundary (ratio == allowedRatio)', function () {
    // 110/100 = 1.10, allowedRatio = 1.10
    // log10(1.10) == log10(1.10), so logRatio <= logThreshold → pass
    const result = checkConsecutiveMeasurementTolerance(110, 100, 1.1)
    assert.strictEqual(
      result.pass,
      true,
      'Exactly at threshold should pass (<=, not <)',
    )
  })

  it('should reject just above the boundary', function () {
    // 111/100 = 1.11, allowedRatio = 1.10 → reject
    const result = checkConsecutiveMeasurementTolerance(111, 100, 1.1)
    assert.strictEqual(result.pass, false)
  })

  it('should use symmetric log comparison (order-independent)', function () {
    // abs(log10(a/b)) should equal abs(log10(b/a))
    const r1 = checkConsecutiveMeasurementTolerance(140, 100, 1.05)
    const r2 = checkConsecutiveMeasurementTolerance(100, 140, 1.05)
    assert.strictEqual(r1.pass, r2.pass, 'Symmetric: both should reject')
    assert.ok(
      Math.abs(r1.logRatio - r2.logRatio) < 1e-10,
      'logRatio should be identical',
    )
  })
})

/* ============================================================================
 * UNIT TESTS: parseLocationsArray
 * ============================================================================ */

describe('Rejection Algorithm — Location Parsing', function () {
  it('should parse comma-separated string', function () {
    const result = parseLocationsArray('camera, center, camera')
    assert.deepStrictEqual(result, ['camera', 'center', 'camera'])
  })

  it('should parse array with single comma-separated string', function () {
    const result = parseLocationsArray(['camera, center'])
    assert.deepStrictEqual(result, ['camera', 'center'])
  })

  it('should parse clean array', function () {
    const result = parseLocationsArray(['camera', 'center'])
    assert.deepStrictEqual(result, ['camera', 'center'])
  })

  it('should handle whitespace in comma-separated strings', function () {
    const result = parseLocationsArray('  camera ,  center ,  cameraLeftEye  ')
    assert.deepStrictEqual(result, ['camera', 'center', 'cameraLeftEye'])
  })

  it('should fallback to default for non-string/non-array', function () {
    const result = parseLocationsArray(42)
    assert.deepStrictEqual(result, ['camera', 'center'])
  })
})

/* ============================================================================
 * UNIT TESTS: createLocationMeasurementManager basics
 * ============================================================================ */

describe('Rejection Algorithm — Location Manager Basics', function () {
  it('should start at index 0', function () {
    const m = createLocationMeasurementManager(['camera', 'center'])
    assert.strictEqual(m.getCurrentIndex(), 0)
    assert.strictEqual(m.getTotalLocations(), 2)
    assert.strictEqual(m.isComplete(), false)
  })

  it('should return correct location info', function () {
    const m = createLocationMeasurementManager(['cameraLeftEye', 'center'])
    const info = m.getCurrentLocationInfo()
    assert.strictEqual(info.index, 0)
    assert.strictEqual(info.locEye, 'cameraLeftEye')
    assert.strictEqual(info.location, 'camera')
    assert.strictEqual(info.eye, 'left')
    assert.strictEqual(info.isFirst, true)
    assert.strictEqual(info.isLast, false)
  })

  it('should store and advance correctly', function () {
    const m = createLocationMeasurementManager(['camera', 'center'])
    m.storeMeasurement({ fOverWidth: 100, factorCmPx: 1000 })
    assert.strictEqual(m.getPreviousFOverWidth(), 100)

    const hasMore = m.advanceToNext()
    assert.strictEqual(hasMore, true)
    assert.strictEqual(m.getCurrentIndex(), 1)

    m.storeMeasurement({ fOverWidth: 105, factorCmPx: 1050 })
    const hasMore2 = m.advanceToNext()
    assert.strictEqual(hasMore2, false)
    assert.strictEqual(m.isComplete(), true)
  })

  it('getPreviousFOverWidth returns null when no measurements', function () {
    const m = createLocationMeasurementManager(['camera', 'center'])
    assert.strictEqual(m.getPreviousFOverWidth(), null)
  })

  it('rejectAndGoBack(1) should pop 1 and go back 1', function () {
    const m = createLocationMeasurementManager([
      'camera',
      'center',
      'cameraLeftEye',
    ])
    // Store 2 measurements, advance to index 2
    m.storeMeasurement({ fOverWidth: 100, factorCmPx: 1000 })
    m.advanceToNext() // index 1
    m.storeMeasurement({ fOverWidth: 102, factorCmPx: 1020 })
    m.advanceToNext() // index 2

    assert.strictEqual(m.getCurrentIndex(), 2)
    assert.strictEqual(m.getCompletedMeasurements().length, 2)

    // Reject 1 (the previous at index 1)
    m.rejectAndGoBack(1)

    assert.strictEqual(m.getCurrentIndex(), 1, 'Should go back to index 1')
    assert.strictEqual(
      m.getCompletedMeasurements().length,
      1,
      'Should have 1 measurement left',
    )
    assert.strictEqual(
      m.getCompletedMeasurements()[0].fOverWidth,
      100,
      'First measurement (100) should be preserved',
    )
  })

  it('rejectAndGoBack(1) at index 1 with 1 measurement should go to index 0', function () {
    const m = createLocationMeasurementManager(['camera', 'center'])
    m.storeMeasurement({ fOverWidth: 100, factorCmPx: 1000 })
    m.advanceToNext() // index 1

    m.rejectAndGoBack(1)
    assert.strictEqual(m.getCurrentIndex(), 0)
    assert.strictEqual(m.getCompletedMeasurements().length, 0)
  })

  it('reset should clear everything', function () {
    const m = createLocationMeasurementManager(['camera', 'center'])
    m.storeMeasurement({ fOverWidth: 100, factorCmPx: 1000 })
    m.advanceToNext()
    m.reset()
    assert.strictEqual(m.getCurrentIndex(), 0)
    assert.strictEqual(m.getCompletedMeasurements().length, 0)
  })
})

/* ============================================================================
 * INTEGRATION TESTS: Full calibration loop simulation
 * ============================================================================ */

describe('Rejection Algorithm — Test A: No rejections (baseline)', function () {
  // Config: locations = "camera, center, camera", allowedRatio = 1.50
  // Feed: [100, 105, 110]
  // Expected: no popup, 3 accepted values stored in order, loop ends

  const result = simulateCalibrationLoop(
    'camera, center, camera',
    1.5,
    [100, 105, 110],
  )

  it('should have no rejections', function () {
    assert.strictEqual(result.rejections.length, 0)
  })

  it('should accept all 3 values', function () {
    assert.deepStrictEqual(result.acceptedValues, [100, 105, 110])
  })

  it('should be complete', function () {
    assert.strictEqual(result.isComplete, true)
  })

  it('should have 3 log entries, all accepts', function () {
    assert.strictEqual(result.log.length, 3)
    assert.ok(result.log.every(e => e.action === 'accept'))
  })

  it('should have measurements for correct locations', function () {
    const locs = result.completedMeasurements.map(m => m.locEye)
    assert.deepStrictEqual(locs, ['camera', 'center', 'camera'])
  })
})

describe('Rejection Algorithm — Test B: One rejection, reset from first rejected', function () {
  // Config: locations = "camera, center, camera", allowedRatio = 1.05
  // Feed: [100, 140, 110, 112, 111]
  //
  // Flow:
  //   100 → accept (first, always passes)
  //   140 → compare vs 100: ratio 1.4 > 1.05 → REJECT BOTH → back to index 0
  //   110 → accept (new first at index 0)
  //   112 → compare vs 110: 112/110 ≈ 1.018 → accept
  //   111 → compare vs 112: 112/111 ≈ 1.009 → accept
  //
  // Expected:
  //   - exactly 1 rejection popup
  //   - final accepted set is [110, 112, 111]
  //   - 100 and 140 must NOT appear in final results

  const result = simulateCalibrationLoop(
    'camera, center, camera',
    1.05,
    [100, 140, 110, 112, 111],
  )

  it('should have exactly 1 rejection', function () {
    assert.strictEqual(result.rejections.length, 1)
  })

  it('rejection should show ratio 1.4 (140/100)', function () {
    assert.ok(Math.abs(result.rejections[0].ratio - 1.4) < 0.001)
    assert.strictEqual(result.rejections[0].current, 140)
    assert.strictEqual(result.rejections[0].previous, 100)
  })

  it('final accepted values should be [110, 112, 111]', function () {
    assert.deepStrictEqual(result.acceptedValues, [110, 112, 111])
  })

  it('100 and 140 must not appear in final results', function () {
    assert.ok(
      !result.acceptedValues.includes(100),
      '100 should not be in accepted',
    )
    assert.ok(
      !result.acceptedValues.includes(140),
      '140 should not be in accepted',
    )
  })

  it('should be complete', function () {
    assert.strictEqual(result.isComplete, true)
  })

  it('after rejection, UI should restart from index 0 (camera)', function () {
    // The third feed value (110) should be accepted at index 0 (camera)
    const acceptsAfterReject = result.log.filter(
      (e, i) => e.action === 'accept' && i > 0,
    )
    assert.strictEqual(
      acceptsAfterReject[0].index,
      0,
      'First accept after rejection should be at index 0',
    )
    assert.strictEqual(acceptsAfterReject[0].locEye, 'camera')
  })
})

describe('Rejection Algorithm — Test C: Multiple rejections in a row', function () {
  // Config: locations = "camera, center", allowedRatio = 1.05
  // Feed: [100, 130, 100, 140, 100, 103]
  //
  // Flow:
  //   100 → accept (first)
  //   130 → reject (130/100 = 1.3 > 1.05) → back to index 0
  //   100 → accept (new first at index 0)
  //   140 → reject (140/100 = 1.4 > 1.05) → back to index 0
  //   100 → accept (new first at index 0)
  //   103 → accept (103/100 = 1.03 ≤ 1.05)
  //
  // Expected:
  //   - 2 rejections
  //   - final pair is (100, 103)
  //   - no half-accepted leftover state

  const result = simulateCalibrationLoop(
    'camera, center',
    1.05,
    [100, 130, 100, 140, 100, 103],
  )

  it('should have exactly 2 rejections', function () {
    assert.strictEqual(result.rejections.length, 2)
  })

  it('final accepted values should be [100, 103]', function () {
    assert.deepStrictEqual(result.acceptedValues, [100, 103])
  })

  it('should be complete', function () {
    assert.strictEqual(result.isComplete, true)
  })

  it('should have no leftover state from previous attempts', function () {
    assert.strictEqual(result.completedMeasurements.length, 2)
    // Only the final successful pair
    assert.strictEqual(result.completedMeasurements[0].fOverWidth, 100)
    assert.strictEqual(result.completedMeasurements[1].fOverWidth, 103)
  })

  it('rejected values (130, 140) should not appear in final results', function () {
    assert.ok(!result.acceptedValues.includes(130))
    assert.ok(!result.acceptedValues.includes(140))
  })

  it('first rejection ratio should be 1.3', function () {
    assert.ok(Math.abs(result.rejections[0].ratio - 1.3) < 0.001)
  })

  it('second rejection ratio should be 1.4', function () {
    assert.ok(Math.abs(result.rejections[1].ratio - 1.4) < 0.001)
  })
})

describe('Rejection Algorithm — Test D: Boundary condition (exactly at threshold)', function () {
  // Config: locations = "camera, center", allowedRatio = 1.10
  // Feed: [100, 110] → ratio = 1.10 exactly
  //
  // Expected: accepted (because rule is <=, not <)

  const result = simulateCalibrationLoop('camera, center', 1.1, [100, 110])

  it('should have no rejections (exactly at threshold passes)', function () {
    assert.strictEqual(result.rejections.length, 0)
  })

  it('should accept both values', function () {
    assert.deepStrictEqual(result.acceptedValues, [100, 110])
  })

  it('should be complete', function () {
    assert.strictEqual(result.isComplete, true)
  })
})

describe('Rejection Algorithm — Test D2: Just above boundary should reject', function () {
  // Config: locations = "camera, center", allowedRatio = 1.10
  // Feed: [100, 111] → ratio = 1.11 > 1.10

  const result = simulateCalibrationLoop(
    'camera, center',
    1.1,
    [100, 111, 100, 109],
  )

  it('should have 1 rejection (just above threshold)', function () {
    assert.strictEqual(result.rejections.length, 1)
  })

  it('final accepted values should be from the retry', function () {
    assert.deepStrictEqual(result.acceptedValues, [100, 109])
  })
})

describe('Rejection Algorithm — Test E: Rejection in the middle of a longer sequence', function () {
  // Config: locations = "camera, center, cameraLeftEye, centerRightEye"
  //         allowedRatio = 1.05
  //
  // Feed: [100, 102, 150, 101, 103, 104]
  //
  // Flow:
  //   100 → accept at index 0 (camera)
  //   102 → accept at index 1 (center), compare vs 100: 1.02 ≤ 1.05
  //   150 → reject at index 2 (cameraLeftEye), compare vs 102: 150/102 ≈ 1.47 > 1.05
  //         → rejectAndGoBack(1): pop measurement at index 1 (102), go back to index 1
  //         → IMPORTANT: measurement at index 0 (camera=100) STAYS
  //   101 → accept at index 1 (center), compare vs 100: 1.01 ≤ 1.05
  //   103 → accept at index 2 (cameraLeftEye), compare vs 101: 103/101 ≈ 1.02 ≤ 1.05
  //   104 → accept at index 3 (centerRightEye), compare vs 103: 104/103 ≈ 1.01 ≤ 1.05
  //
  // Expected:
  //   - first measurement (camera=100) stays
  //   - rejection wipes the pair at indices 1 and 2 attempt
  //   - resume at first rejected point (center, index 1), NOT restart from beginning
  //   - final: [100, 101, 103, 104]

  const result = simulateCalibrationLoop(
    'camera, center, cameraLeftEye, centerRightEye',
    1.05,
    [100, 102, 150, 101, 103, 104],
  )

  it('should have exactly 1 rejection', function () {
    assert.strictEqual(result.rejections.length, 1)
  })

  it('rejection should be at index 2 (cameraLeftEye) with 150 vs 102', function () {
    assert.strictEqual(result.rejections[0].index, 2)
    assert.strictEqual(result.rejections[0].current, 150)
    assert.strictEqual(result.rejections[0].previous, 102)
  })

  it('first measurement (camera=100) should be preserved', function () {
    assert.strictEqual(result.acceptedValues[0], 100)
    assert.strictEqual(result.completedMeasurements[0].locEye, 'camera')
  })

  it('should resume at index 1 (center) after rejection, NOT index 0', function () {
    // After rejection, the next accept should be at index 1 (center)
    const rejectIdx = result.log.findIndex(e => e.action === 'reject')
    const nextAccept = result.log[rejectIdx + 1]
    assert.strictEqual(nextAccept.action, 'accept')
    assert.strictEqual(
      nextAccept.index,
      1,
      'Should resume at index 1 (center), not 0',
    )
    assert.strictEqual(nextAccept.locEye, 'center')
  })

  it('final accepted values should be [100, 101, 103, 104]', function () {
    assert.deepStrictEqual(result.acceptedValues, [100, 101, 103, 104])
  })

  it('should be complete with 4 measurements', function () {
    assert.strictEqual(result.isComplete, true)
    assert.strictEqual(result.completedMeasurements.length, 4)
  })

  it('locations should be in correct order', function () {
    const locs = result.completedMeasurements.map(m => m.locEye)
    assert.deepStrictEqual(locs, [
      'camera',
      'center',
      'cameraLeftEye',
      'centerRightEye',
    ])
  })
})

/* ============================================================================
 * EDGE CASE: Demonstrate that rejectAndGoBack(2) is WRONG
 * ============================================================================
 * This test directly verifies that using count=2 would break Test E.
 */

describe('Rejection Algorithm — rejectAndGoBack(2) is wrong for mid-sequence rejection', function () {
  it('rejectAndGoBack(2) at index 2 with 2 stored measurements overwrites a valid measurement', function () {
    const m = createLocationMeasurementManager([
      'camera',
      'center',
      'cameraLeftEye',
      'centerRightEye',
    ])

    // Accept at index 0
    m.storeMeasurement({ fOverWidth: 100, factorCmPx: 1000 })
    m.advanceToNext()

    // Accept at index 1
    m.storeMeasurement({ fOverWidth: 102, factorCmPx: 1020 })
    m.advanceToNext()

    // Now at index 2, tolerance check fails for fOverWidth=150
    // BUG: calling rejectAndGoBack(2) removes BOTH measurements
    m.rejectAndGoBack(2)

    // BUG: This removes the valid camera=100 measurement!
    assert.strictEqual(
      m.getCompletedMeasurements().length,
      0,
      'rejectAndGoBack(2) incorrectly removes all measurements',
    )
    assert.strictEqual(
      m.getCurrentIndex(),
      0,
      'rejectAndGoBack(2) incorrectly resets to index 0',
    )
    // This is WRONG behavior — the camera=100 measurement was valid and should be kept
  })

  it('rejectAndGoBack(1) correctly preserves earlier valid measurements', function () {
    const m = createLocationMeasurementManager([
      'camera',
      'center',
      'cameraLeftEye',
      'centerRightEye',
    ])

    // Accept at index 0
    m.storeMeasurement({ fOverWidth: 100, factorCmPx: 1000 })
    m.advanceToNext()

    // Accept at index 1
    m.storeMeasurement({ fOverWidth: 102, factorCmPx: 1020 })
    m.advanceToNext()

    // Now at index 2, tolerance check fails for fOverWidth=150
    // CORRECT: calling rejectAndGoBack(1) removes only the previous (102)
    m.rejectAndGoBack(1)

    assert.strictEqual(
      m.getCompletedMeasurements().length,
      1,
      'Should have 1 measurement left (camera=100)',
    )
    assert.strictEqual(
      m.getCompletedMeasurements()[0].fOverWidth,
      100,
      'camera=100 should be preserved',
    )
    assert.strictEqual(
      m.getCurrentIndex(),
      1,
      'Should go back to index 1 (center) to retry',
    )
  })
})

/* ============================================================================
 * GEOMETRIC MEAN CALCULATION
 * ============================================================================ */

describe('Rejection Algorithm — Final Calibration Calculation', function () {
  it('should compute correct geometric mean of fOverWidth values', function () {
    const m = createLocationMeasurementManager(['camera', 'center'])
    m.storeMeasurement({ fOverWidth: 100, factorCmPx: 1000 })
    m.advanceToNext()
    m.storeMeasurement({ fOverWidth: 104, factorCmPx: 1040 })
    m.advanceToNext()

    const cal = m.calculateFinalCalibration()
    assert.ok(cal !== null)
    assert.strictEqual(cal.totalMeasurements, 2)
    assert.deepStrictEqual(cal.allFOverWidths, [100, 104])

    // Geometric mean of 100, 104 = sqrt(100*104) = sqrt(10400) ≈ 101.98
    const expected = Math.sqrt(100 * 104)
    assert.ok(
      Math.abs(cal.geometricMeanFOverWidth - expected) < 0.01,
      `Geometric mean should be ~${expected.toFixed(2)}, got ${cal.geometricMeanFOverWidth}`,
    )
  })

  it('should return null when no measurements', function () {
    const m = createLocationMeasurementManager(['camera', 'center'])
    assert.strictEqual(m.calculateFinalCalibration(), null)
  })
})
