export const distanceCalibrationAssetMap = {
  Instruction1_mp4:
    'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FInstruction%201.mp4?alt=media&token=b49555be-2763-4c45-ba25-7ea6a6832ac8',
  Instruction2_mp4:
    'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FInstruction%202.mp4?alt=media&token=bc068e99-7e7a-4c40-9393-5716fa73d6e3',
  Instruction3_mp4:
    'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FInstruction%203.mp4?alt=media&token=dae552b0-ebcd-41c3-ae9a-d5b7ca112345',
  Instruction4_mp4:
    'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FInstruction%204.mp4?alt=media&token=0c3e8d30-4d07-45d9-92a1-52b73f872543',
  Objects_png:
    'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FObjects.png?alt=media&token=bbd5cbd9-338d-455c-9817-699a9420a793',
}

export const test_assetMap = {
  LL1: 'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FInstruction%201.mp4?alt=media&token=b49555be-2763-4c45-ba25-7ea6a6832ac8',
  LL2: 'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FInstruction%202.mp4?alt=media&token=bc068e99-7e7a-4c40-9393-5716fa73d6e3',
  LL3: 'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FInstruction%203.mp4?alt=media&token=dae552b0-ebcd-41c3-ae9a-d5b7ca112345',
  LL4: 'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FInstruction%204.mp4?alt=media&token=0c3e8d30-4d07-45d9-92a1-52b73f872543',
  LL5: 'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FObjects.png?alt=media&token=bbd5cbd9-338d-455c-9817-699a9420a793',
}

export const test_phrases = {
  RC_UseObjectToSetViewingDistanceTapePage1: {
    en: `[[TT1]] GET READY
[[SS1]] Choose a common object about [[IN1]]–[[IN2]] inches ([[CM1]]–[[CM2]] cm) long — the longer, the better. Examples: ruler, book, magazine, clipboard, coat hanger, paper towel roll, wooden spoon, keyboard, string, or ribbon. Or fold in half a scarf, towel, or charging cable. 
\nAvoid sharp objects (like pencils).

\nYOUR TASK
\nAs explained below, you'll drag the tape to the left, to make room, and then pull its right end to match your object’s length.
[[LL5]]

[[TT2]] STEP BY STEP
[[SS1]] Line up your object's left end (←) with the tape's left end (←).
[[SS2]] If the right end is OFF-screen:
[[SS2.1]] Mark your object with your thumbnail at the largest visible number.
[[SS2.2]] Drag that number (and the tape) left, moving your thumbnail and object with it.
[[SS2.3]] Repeat until the object’s right end is on-screen.
[[SS3]] When the right end is ON-screen:
[[SS3.1]] Use ◀▶ or drag the tape’s right end to align with your object.
[[SS4]] Press SPACE to proceed.
\n🔉 You’ll hear a “kerchunk” sound to confirm.
[[LL1]]`,
  },
  RC_UseObjectToSetViewingDistanceRulerPage1: {
    en: `[[TT1]] GET READY
[[SS1]] Pick a common object about [[IN1]]–[[IN2]] inches ([[CM1]]–[[CM2]] cm) long — longer is better. Examples: long ruler, book, magazine, clipboard, coat hanger, wooden spoon, keyboard, string, or ribbon. Or fold in half a scarf or charging cable.
\nAvoid sharp objects (like pencils).
\nYou'll drag the on-screen "ruler" left a few times to make room, then pull its right end to match your object’s length.
\nThe ruler’s numbers are intentionally spaced far apart.
[[LL5]]

[[TT2]] STEP BY STEP
[[SS1]] Line up your object's left end (←) with the ruler's left end (←).
[[SS2]] If the object's right end extends beyond the screen:
[[SS2.1]] Use your thumbnail to mark your object at the ruler's largest visible number, initially "1".
[[SS2.2]] Move your thumbnail (and the object) toward the left edge of the screen (←).
[[SS2.3]] Drag that number (and the ruler) left until it again lines up with your thumbnail.
[[SS2.4]] Repeat these moves until the object’s right end is on the screen.
[[SS3]] Once the end is on the screen, use ◀ ▶ keys or drag the ruler’s right end to match your object's length.
[[SS4]] Press SPACE to proceed.
\n🔉 A “kerchunk” sound will acknowledge your setting.
[[LL1]]`,
  },
  RC_UseObjectToSetViewingDistanceTapePage2: {
    en: `[[TT1]] REMEASURE FOR BEST ACCURACY
[[SS1]] Line up your object's left end with the tape's left end.
[[SS2]] If the right end is OFF-screen:
[[SS2.1]] Use your thumbnail to mark your object at the tape's largest visible number.
[[SS2.2]] Drag that number (and the tape) left, moving your thumbnail and object with it.
[[SS2.3]] Repeat until the object’s right end is on-screen.
[[SS3]] When the right end is ON-screen:
[[SS3.1]] Use ◀▶ keys or drag the tape’s right end to align with your object.
[[SS4]] Press SPACE to proceed.
\n🔉 You’ll hear a “kerchunk” sound to confirm.
[[LL1]]`,
  },
  RC_UseObjectToSetViewingDistanceRulerPage2: {
    en: `[[TT1]] REMEASURE FOR BEST ACCURACY
[[SS1]] Line up your object's left end with the ruler's left end.
[[SS2]] If the right end is OFF-screen:
[[SS2.1]] Use your thumbnail to mark your object at the largest visible number.
[[SS2.2]] Drag that number (and the ruler) left, moving your thumbnail and object with it.
[[SS2.3]] Repeat until the object’s right end is on-screen.
[[SS3]] When the right end is ON-screen:
[[SS3.1]] Use ◀▶ or drag the ruler’s right end to align with your object.
[[SS4]] Press SPACE to proceed.
\n 🔉 You’ll hear a “kerchunk” sound to confirm.
[[LL1]]`,
  },
  RC_UseObjectToSetViewingDistancePage3: {
    en: `[[TT1]]EYE SNAPSHOT FOR DISTANCE MEASUREMENT
[[SS1]] On this page, you'll use the webcam to take a temporary snapshot of your eyes—just to measure your distance.
[[SS1.1]] The goal is eye tracking: The live video shows blue circles over your eyes.
[[SS1.2]] If tracking fails, the blue circles turn red and freeze, blocking the snapshot. To fix this, bring more of your face into view, until the circles turn blue and move again.
[[SS2]] Use the object you measured: Hold it with one end against the top-center of the screen (above the video) and the other end touching your face near your eye.
[[SS3]] Take the snapshot: Hold still, remove the object so your face is visible, and press SPACE.
\n🔉 You’ll hear the sound of a camera shutter.
[[LL2]]`,
  },
  RC_UseObjectToSetViewingDistanceLowerRightPage4: {
    en: `[[TT1]] LOWER-RIGHT CORNER MEASUREMENT
[[SS1]] Repeat for the lower-right corner of the screen (far corner of video).
[[SS2]] Use your object to set the same distance, now eye-to-corner.
[[SS3]] Hold still, uncover your face, and press SPACE.
[[LL3]]`,
  },
  RC_produceDistanceCameraTiltAndSwivel: {
    en: `[[TT1]] SCREEN TILT AND DISTANCE SETUP
[[SS1]] Tilt and swivel the screen until your eyes in the video are centered on the red cross.
[[SS2]] Check tracking: The video shows blue circles on your eyes. If they turn red and freeze, move more of your face into view.
[[SS3]] Set distance: Position one eye [[N11]] [[UUU]] from the camera (in top center of screen) using a tape or stick:
[[SS3.1]] Mark the desired length with your thumbnail.
[[SS3.2]] If using a stick or metal tape: Place the end at the camera and your thumbnail beside your eye.
[[SS3.3]] If using a cloth tape: Place your thumbnail at the camera and bring the tape’s free end to your eye.
[[SS4]] Skip the impossible: If a distance is too hard to measure, press ❌ or X to skip it.
[[SS5]] Take snapshot: Hold still, uncover your face, and press SPACE. (🔉 SPACE bar will play the sound of a camera shutter.)
[[SS6]] The green progress bar below tracks completion.
[[SS7]] Repeat for the next distance.
[[SS8]] Tip: If the phone keypad freezes, tap the address bar and press Go.
[[LL4]]`,
  },
  RC_produceDistanceCamera: {
    en: `[[TT1]] DISTANCE MEASUREMENT AND SNAPSHOT
[[SS1]] Check tracking: The video shows blue circles on your eyes. If they turn red and freeze, move more of your face into view.
[[SS2]] Set distance: Position one eye [[N11]] [[UUU]] from the camera (in top center of screen) using a tape or stick:
[[SS2.1]] Mark the desired length with your thumbnail.
[[SS2.2]] If using a stick or metal tape: Place the end at the camera and your thumbnail beside your eye.
[[SS2.3]] If using a cloth tape: Place your thumbnail at the camera and bring the tape’s free end to your eye.
[[SS3]] Skip the impossible: If a distance is too hard to measure, press ❌ or X to skip it.
[[SS4]] Take snapshot: Hold still, uncover your face, and press SPACE. (🔉 SPACE bar will play the sound of a camera shutter.)
[[SS5]] The green progress bar below tracks completion.
[[SS6]] Repeat for the next distance.
[[SS7]] Tip: If the phone keypad freezes, tap the address bar and press Go.
[[LL4]]`,
  },
  RC_produceDistanceTiltAndSwivel: {
    en: `[[TT1]] SCREEN ALIGNMENT AND DISTANCE MEASUREMENT
[[SS1]] Tilt and swivel the screen until your eyes in the video are centered on the red cross.
[[SS2]] Check tracking: The video shows blue circles on your eyes. If they turn red and freeze, move more of your face into view.
[[SS3]] Set distance: Position one eye [[N11]] [[UUU]] from the screen center using a tape or stick.
[[SS3.1]] Mark the desired length with your thumbnail.
[[SS3.2]] If using a stick or metal tape: Place the end at the screen center and your thumbnail beside your eye.
[[SS3.3]] If using a cloth tape: Place your thumbnail at the screen center and bring the tape’s free end to your eye.
[[SS4]] Skip the impossible: If a distance is too hard to measure, press ❌ or X to skip it.
[[SS5]] Take snapshot: Hold still, uncover your face, and press SPACE. (🔉 SPACE bar will play the sound of a camera shutter.)
[[SS6]] The green progress bar below tracks completion.
[[SS7]] Repeat for the next distance.
[[SS8]] Tip: If the phone keypad freezes, tap the address bar and press Go.
[[LL4]]`,
  },
  RC_produceDistance: {
    en: `[[TT1]] DISTANCE MEASUREMENT AND SNAPSHOT
[[SS1]] Check tracking: The video shows blue circles on your eyes. If they turn red and freeze, move more of your face into view.
[[SS2]] Set distance: Position one eye [[N11]] [[UUU]] from the screen center using a tape or stick:
[[SS2.1]] Mark the desired length with your thumbnail.
[[SS2.2]] If using a stick or metal tape: Place the end at the screen center and your thumbnail beside your eye.
[[SS2.3]] If using a cloth tape: Place your thumbnail at the screen center and bring the tape’s free end to your eye.
[[SS3]] Skip the impossible: If a distance is too hard to measure, press ❌ or X to skip it.
[[SS4]] Take snapshot: Hold still, uncover your face, and press SPACE. (🔉 SPACE bar will play the sound of a camera shutter.)
[[SS5]] The green progress bar below tracks completion.
[[SS6]] Repeat for the next distance.
[[SS7]] Tip: If the phone keypad freezes, tap the address bar and press Go.
[[LL4]]`,
  },
}
