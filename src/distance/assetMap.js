export const distanceCalibrationAssetMap = {
  Instruction1_mp4:
    'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FRevis1%2FIntroduction_1_(Revis_1).mp4?alt=media&token=b8af89f5-ee7c-4b6b-808d-7483e1640175',
  Instruction2_mp4:
    'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FRevis1%2FInstruction_2_(Revis_1).mp4?alt=media&token=ab543afc-b181-4a27-b330-621ffd4d1762',
  Instruction3_mp4:
    'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FRevis1%2FInstruction_3_(Revis_1).mp4?alt=media&token=ec6609c6-9f1d-4ce0-8a30-ae022e8176e9',
  Instruction4_mp4:
    'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FRevis1%2FInstruction_4.mp4?alt=media&token=f3f6b582-424a-44fb-916e-9a248ba2823e',
  Objects_png:
    'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FRevis1%2FObjects.png?alt=media&token=b337c36d-6991-4ef8-bb9a-29c2e503c8c3',
}

export const test_assetMap = {
  LL1: 'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FRevis1%2FIntroduction_1_(Revis_1).mp4?alt=media&token=b8af89f5-ee7c-4b6b-808d-7483e1640175',
  LL2: 'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FRevis1%2FInstruction_2_(Revis_1).mp4?alt=media&token=ab543afc-b181-4a27-b330-621ffd4d1762',
  LL3: 'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FRevis1%2FInstruction_3_(Revis_1).mp4?alt=media&token=ec6609c6-9f1d-4ce0-8a30-ae022e8176e9',
  LL4: 'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FRevis1%2FInstruction_4.mp4?alt=media&token=f3f6b582-424a-44fb-916e-9a248ba2823e',
  LL5: 'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FRevis1%2FObjects.png?alt=media&token=b337c36d-6991-4ef8-bb9a-29c2e503c8c3',
}

export const test_phrases = {
  RC_UseObjectToSetViewingDistanceTapePage1: {
    en: `[[TT1]] GET READY
[[SS1]] In the following steps, you'll use the on-screen ruler (below) to measure the length of an object that you'll choose.
\nPress the ▼ key to step to the next instruction. Press ▲ to go back one step.
[[LL5]]

[[TT2]] STEP BY STEP
[[SS1]] Pick a common object about [[IN1]]–[[IN2]] inches ([[CM1]]–[[CM2]] cm) long — longer is better (see picture). Avoid sharp objects (like pencils).
[[SS2]] Line up your object's left end (←) with the tape's left end (←).
[[SS3]] Repeat the following as long as the object's right end extends beyond the screen:
[[SS3.1]] Use your thumbnail to mark your object at the tape's largest visible number.
[[SS3.2]] Move your thumbnail (and the object) to the left side of the screen (←).
[[SS3.3]] Drag that number (and the tape) left until it again lines up with your thumbnail.
[[SS3.4]] Repeat these moves until the object’s right end is on the screen.
[[SS4]] Once the end is on the screen, use ◀ ▶ keys or drag the tape’s right end to match your object's length.
[[SS5]] Press SPACE to proceed.
\n🔉 A “kerchunk” sound will acknowledge your setting.
[[LL1]]`,
  },
  RC_UseObjectToSetViewingDistanceRulerPage1: {
    en: `[[TT1]]GET READY
[[SS1]] In the following steps, you'll use the on-screen ruler (below) to measure the length of an object that you'll choose. The ruler’s numbers are intentionally spaced far apart.
\nPress the ▼ key to step to the next instruction. Press ▲ to go back one step.
[[LL5]]

[[TT2]] STEP BY STEP
[[SS1]] Pick a common object about [[IN1]]–[[IN2]] inches ([[CM1]]–[[CM2]] cm) long — longer is better (see picture). Avoid sharp objects (like pencils).
[[SS2]] Line up your object's left end (←) with the ruler's left end (←).
[[SS3]] Repeat the following as long as the object's right end extends beyond the screen:
[[SS3.1]] Use your thumbnail to mark your object at the ruler's largest visible number, initially "1".
[[SS3.2]] Move your thumbnail (and the object) toward the left edge of the screen (←).
[[SS3.3]] Drag that number (and the ruler) left until it again lines up with your thumbnail.
[[SS3.4]] Repeat these moves until the object’s right end is on the screen.
[[SS4]] Once the end is on the screen, use ◀ ▶ keys to drag the ruler’s right end to match your object's length.
[[SS5]] Press SPACE to proceed.
\n🔉 A “kerchunk” sound will acknowledge your setting.
[[LL1]]`,
  },
  RC_UseObjectToSetViewingDistanceTapePage2: {
    en: `[[TT1]] REMEASURE FOR BEST ACCURACY
[[SS1]] Line up your object's left end with the tape's left left end.
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
\n🔉 You’ll hear a “kerchunk” sound to confirm.
[[LL1]]`,
  },
  RC_UseObjectToSetViewingDistancePage3: {
    en: `[[TT1]] EYE SNAPSHOT FOR DISTANCE MEASUREMENT
[[SS1]] On this page, you'll use the webcam to take a temporary snapshot of your eyes—just to measure your distance.
[[SS1.1]] The goal is eye tracking: The live video shows blue circles over your eyes.
[[SS1.2]] If tracking fails, the blue circles turn red and freeze, blocking the snapshot. To fix this, bring more of your face into view until the circles turn blue and move again.
[[SS2]] Use the object you measured: Hold it with one end against the top-center of the screen (above the video) and the other end touching your face near your eye.
[[SS3]] Take the snapshot: Hold still, remove the object so your face is visible, and press SPACE.
\n🔉 You’ll hear the sound of a camera shutter.
[[LL2]]`,
  },
  RC_UseObjectToSetViewingDistanceLowerRightPage4: {
    en: `[[TT1]] LOWER-RIGHT CORNER SNAPSHOT
[[SS1]] Repeat for the lower-right corner of the screen (far corner of video).
[[SS2]] Use your object to set the same distance, now eye-to-corner.
[[SS3]] Hold still, uncover your face, and press SPACE.
[[LL3]]`,
  },
  RC_produceDistanceCameraTiltAndSwivel: {
    en: `[[TT1]]
SCREEN ALIGNMENT AND CAMERA-CENTER MEASUREMENT
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
\nTip: If the phone keypad freezes, tap the address bar and press Go.
[[LL4]]`,
  },
  RC_produceDistanceCamera: {
    en: `[[TT1]]
CAMERA-CENTER DISTANCE MEASUREMENT
[[SS1]] Check tracking: The video shows blue circles on your eyes. If they turn red and freeze, move more of your face into view.
[[SS2]] Set distance: Position one eye [[N11]] [[UUU]] from the camera (in top center of screen) using a tape or stick:
[[SS2.1]] Mark the desired length with your thumbnail.
[[SS2.2]] If using a stick or metal tape: Place the end at the camera and your thumbnail beside your eye.
[[SS2.3]] If using a cloth tape: Place your thumbnail at the camera and bring the tape’s free end to your eye.
[[SS3]] Skip the impossible: If a distance is too hard to measure, press ❌ or X to skip it.
[[SS4]] Take snapshot: Hold still, uncover your face, and press SPACE. (🔉 SPACE bar will play the sound of a camera shutter.)
[[SS5]] The green progress bar below tracks completion.
[[SS6]] Repeat for the next distance.
\nTip: If the phone keypad freezes, tap the address bar and press Go.
[[LL4]]`,
  },
  RC_produceDistanceTiltAndSwivel: {
    en: `[[TT1]]
SCREEN-CENTER DISTANCE MEASUREMENT
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
\nTip: If the phone keypad freezes, tap the address bar and press Go.
[[LL4]]`,
  },
  RC_produceDistance: {
    en: `[[TT1]]
SCREEN-CENTER DISTANCE MEASUREMENT
[[SS1]] Check tracking: The video shows blue circles on your eyes. If they turn red and freeze, move more of your face into view.
[[SS2]] Set distance: Position one eye [[N11]] [[UUU]] from the screen center using a tape or stick:
[[SS2.1]] Mark the desired length with your thumbnail.
[[SS2.2]] If using a stick or metal tape: Place the end at the screen center and your thumbnail beside your eye.
[[SS2.3]] If using a cloth tape: Place your thumbnail at the screen center and bring the tape’s free end to your eye.
[[SS3]] Skip the impossible: If a distance is too hard to measure, press ❌ or X to skip it.
[[SS4]] Take snapshot: Hold still, uncover your face, and press SPACE. (🔉 SPACE bar will play the sound of a camera shutter.)
[[SS5]] The green progress bar below tracks completion.
[[SS6]] Repeat for the next distance.
\nTip: If the phone keypad freezes, tap the address bar and press Go.
[[LL4]]`,
  },
}
