import { phrases } from '../i18n/schema'
import RemoteCalibrator from '../core'

const RC = RemoteCalibrator

export const distanceCalibrationAssetMap = {
  Instruction1_1:
    'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FRevis2%2FInstruction%201.1.mp4?alt=media&token=487e8498-41e8-409d-a93f-d4cfd24630a8',
  Instruction1_2:
    'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FRevis2%2FInstruction%201.2.mp4?alt=media&token=1bbabd66-1b31-42cf-9344-e8df8fdb55e7',
  Instruction1_3:
    'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FRevis2%2FInstruction%201.3.mp4?alt=media&token=237d5024-bcd2-4315-9cd9-020a30765a5c',
  Instruction1_4:
    'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FRevis2%2FInstruction%201.4.mp4?alt=media&token=40d4c197-2c4c-4b79-a8e4-3a085a26529f',
  Instruction1_5:
    'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FRevis2%2FInstruction_1.5.mp4?alt=media&token=ed833e71-9b8c-4088-bf37-1b03ceca684c',
  Instruction1_6:
    'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FRevis2%2FInstruction_1.6.mp4?alt=media&token=e6230fd1-f24a-48b5-8394-48cbc9c79c7e',
  Instruction4:
    'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FRevis2%2FInstruction%204%20(Revis%202).mp4?alt=media&token=803b2cfe-52d3-43d7-9f97-f36bf8e844a6',
  Instruction_stiff_1_1:
    'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FRevis2%2FInstruction%20stiff%201.1.mp4?alt=media&token=15ba0ae2-8c91-4af1-ac76-f382950eda5d',
  Objects_png:
    'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FStiff%20objects.png?alt=media&token=8acfda00-fb5d-444c-8976-0835a3881512',
  Image1_1:
    'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FRevis2%2FImage_1.1.png?alt=media&token=e113bd5f-c16c-49af-97b6-471050e94d8c',
  Instruction_stiff_1_2:
    'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/s[…]ia&token=8180ddbf-20a5-44a2-934c-90d052a5fdcf',
}

export const test_assetMap = {
  LL1: 'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FRevis2%2FInstruction%201.1.mp4?alt=media&token=487e8498-41e8-409d-a93f-d4cfd24630a8',
  LL2: 'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FRevis2%2FInstruction%201.2.mp4?alt=media&token=1bbabd66-1b31-42cf-9344-e8df8fdb55e7',
  LL3: 'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FRevis2%2FInstruction%201.3.mp4?alt=media&token=237d5024-bcd2-4315-9cd9-020a30765a5c',
  LL4: 'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FRevis2%2FInstruction%201.4.mp4?alt=media&token=40d4c197-2c4c-4b79-a8e4-3a085a26529f',
  LL5: 'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FRevis2%2FInstruction_1.5.mp4?alt=media&token=ed833e71-9b8c-4088-bf37-1b03ceca684c',
  LL6: 'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FRevis2%2FInstruction_1.6.mp4?alt=media&token=e6230fd1-f24a-48b5-8394-48cbc9c79c7e',
  LL7: 'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FRevis2%2FInstruction%204%20(Revis%202).mp4?alt=media&token=803b2cfe-52d3-43d7-9f97-f36bf8e844a6',
  LL8: 'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FRevis2%2FInstruction%20stiff%201.1.mp4?alt=media&token=15ba0ae2-8c91-4af1-ac76-f382950eda5d',
  LL9: 'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FStiff%20objects.png?alt=media&token=8acfda00-fb5d-444c-8976-0835a3881512',
  LL10: 'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FRevis2%2FImage_1.1.png?alt=media&token=e113bd5f-c16c-49af-97b6-471050e94d8c',
  LL11: 'https://easyeyes-cors-proxy-1cf4742aef20.herokuapp.com/https://firebasestorage.googleapis.com/v0/b/speaker-calibration.firebasestorage.app/o/Instructions%2FRevis2%2FInstruction%20stiff%201.2.mp4?alt=media&token=8180ddbf-20a5-44a2-934c-90d052a5fdcf',
}

// Reference phrases from main i18n system instead of hardcoding
// This allows you to maintain all text in one place (i18n/schema.js or phrases system)
export const test_phrases = {
  // Link Markdown versions to main phrase system
  // The FULL phrase object is referenced (with all languages: en, es, etc.)
  // distance.js will handle language selection with [RC.L] or .en
  RC_UseObjectToSetViewingDistanceTapePage1_MD: phrases.RC_UseObjectToSetViewingDistanceTapeStepperPage1,
  RC_UseObjectToSetViewingDistanceRulerPage1_MD: phrases.RC_UseObjectToSetViewingDistanceRulerStepperPage1,
  RC_UseObjectToSetViewingDistanceTapePage2_MD: phrases.RC_UseObjectToSetViewingDistanceTapeStepperPage2,
  RC_UseObjectToSetViewingDistanceRulerPage2_MD: phrases.RC_UseObjectToSetViewingDistanceRulerStepperPage2,
  RC_UseObjectToSetViewingDistancePage3_MD: phrases.RC_UseObjectToSetViewingDistancePage3,
  RC_UseObjectToSetViewingDistanceLowerRightPage4_MD: phrases.RC_UseObjectToSetViewingDistanceStepperPage4,
  RC_produceDistanceCameraTiltAndSwivel_MD: phrases.RC_produceDistanceCameraTiltAndSwivel,
  RC_produceDistanceCamera_MD: phrases.RC_produceDistanceCamera,
  RC_produceDistanceTiltAndSwivel_MD: phrases.RC_produceDistanceTiltAndSwivel,
  RC_produceDistance_MD: phrases.RC_produceDistance,
  
//   // Legacy phrases (kept for backward compatibility)
//   RC_UseObjectToSetViewingDistanceTapePage1: {
//     en: `[[TT1]]
// [[SS1]] In the following steps, you’ll use the on-screen tape (below) to measure the length of an object that you’ll provide.
// \nPress the ▼ key to step to next instruction. Press ▲ to go back.

// [[TT2]]
// [[SS1]] 1. Find an object about [[IN1]]–[[IN2]] inches ([[CM1]]–[[CM2]] cm) long — longer is better (see picture). Avoid sharp objects (like pencils).
// [[SS2]] 2. Line up your object’s left end (←) with the tape’s left end (←).
// [[LL1]]
// [[SS3]] 3. Repeat the following as long as the object’s right end extends beyond the screen:
// [[LL10]]
// [[SS3.1]] ⭘ Use your thumbnail to mark your object at the tape’s largest visible number. Remember the number.
// [[LL2]]
// [[SS3.2]] ⭘ Click the big yellow :arrow_left: button, and wait for the ruler to slide and extend.
// [[SS3.3]] ⭘ Re-align your thumbnail (and object) with the number.
// [[LL4]]
// [[SS3.4]] ⭘ Repeat these moves until the object’s right end is on the screen.
// [[LL10]]
// [[SS4]] 4. Once the end is on the screen, use :arrow_backward: :arrow_forward: keys or drag the tape’s right end to to match your object’s length.
// [[LL5]]
// [[SS5]] 5. Press SPACE to record the setting.
// \n6. 🔉 A “kerchunk” sound will confirm the setting.
// [[LL6]]`,
//   },
//   RC_UseObjectToSetViewingDistanceRulerPage1: {
//     en: `[[TT1]] 
// [[SS1]] You’ll use the on-screen ruler (below) to measure an object you provide. The ruler’s numbers are intentionally spaced far apart.
// \nPress ▼ to advance, ▲ to go back.

// [[TT2]]
// [[SS1]] 1. Get an object [[IN1]]–[[IN2]] inches ([[CM1]]–[[CM2]] cm) long — longer is better (see picture). Avoid sharp objects.
// [[LL9]]
// [[SS2]] 2. Align your object’s left end (←) with the ruler’s left end (←).
// [[LL1]]
// [[SS3]] 3. If the object extends off the right side, repeat:
// [[LL10]]
// [[SS3.1]] ⭘ Mark your object with your thumbnail at the largest visible number (initially “1”). Remember the number.
// [[LL2]]
// [[SS3.2]] ⭘ Click the big yellow :arrow_left: button, and wait for the ruler to slide and extend.
// [[SS3.3]] ⭘ Re-align your thumbnail (and object) with the remembered number.
// [[LL4]]
// [[SS3.4]] ⭘ Repeat until the object’s right end is on the screen.
// [[LL10]]
// [[SS4]] 4. Once the end is on the screen, use ◀ ▶ keys to align the ruler’s right end with your object's right end.
// [[LL5]]
// [[SS5]] 5. Press SPACE to record the setting.
// \n6. 🔉 A “kerchunk” sound will confirm the setting.
// [[LL6]]`,
//   },
//   RC_UseObjectToSetViewingDistanceTapePage2: {
//     en: `[[TT1]] REMEASURE FOR BEST ACCURACY
// [[SS1]] 1. Line up your object's left end with the tape's left end.
// [[LL1]]
// [[SS2]] 2. While the object extends off the right side, repeat:
// [[SS2.1]] ⭘ Mark your object with your thumbnail at the largest visible number (initially “1”). Remember the number.
// [[LL2]]
// [[SS2.2]] ⭘ Click the big yellow ⬅ button, and wait for the ruler to slide and extend.
// [[SS2.3]] ⭘ Re-align your thumbnail (and object) with the number.
// [[LL4]]
// [[SS2.4]] ⭘ Repeat until the object’s right end is on the screen.
// [[LL10]]
// [[SS3]] 3. Once the end is on the screen, use ◀ ▶ keys to align the tape’s right end with your object's right end.
// [[LL5]]
// [[SS4]] 4. Press SPACE to record the setting.
// \n5. 🔉 The “kerchunk” sound confirms.
// [[LL6]]`,
//   },
//   RC_UseObjectToSetViewingDistanceRulerPage2: {
//     en: `[[TT1]] REMEASURE FOR BEST ACCURACY
// [[SS1]] 1. Line up your object's left end with the ruler's left end.
// [[LL1]]
// [[SS2]] 2. While the object extends off the right side, repeat:
// [[LL10]]
// [[SS2.1]] ⭘ Mark your object with your thumbnail at the largest visible number (initially “1”). Remember the number.
// [[LL2]]
// [[SS2.2]] ⭘ Click the big yellow ⬅ button, and wait for the ruler to slide and extend.
// [[SS2.3]] ⭘ Re-align your thumbnail (and object) with the number.
// [[LL4]]
// [[SS2.4]] ⭘ Repeat until the object’s right end is on the screen.
// [[LL10]]
// [[SS3]] 3. Once the end is on the screen, use ◀ ▶ keys to align the ruler’s right end with your object's right end.
// [[LL5]]
// [[SS4]] 4. Press SPACE to record the setting.
// \n5. 🔉 The “kerchunk” sound confirms.
// [[LL6]]`,
//   },
//   RC_UseObjectToSetViewingDistancePage3: {
//     en: `[[TT1]] EYE SNAPSHOT FOR DISTANCE MEASUREMENT
// [[SS1]] 1. On this page, you'll use the webcam to take a temporary snapshot of your eyes—just to measure your distance.
// [[SS1.1]] ⭘ The goal is eye tracking: The live video shows blue circles over your eyes.
// [[SS1.2]] ⭘ If tracking fails, the blue circles turn red and freeze, blocking the snapshot. To fix this, bring more of your face into view, until the circles turn blue and move again.

// [[SS2]] 2. Use the object you measured: Hold it with one end against the top-center of the screen (above the video) and the other end touching your face near your eye.
// [[SS2.1]] ⭘ If your object is stiff: Hold it with one hand, near your eye. This leaves your other hand free.
// [[LL8]]
// [[SS2.2]] ⭘ If your object is not stiff, like string: Hold it with two hands.
// [[SS3]] 3. Take the snapshot: Hold still, remove object so your face is visible, and press SPACE.
// \nIf your object is not stiff, such as string: Hold your head still, as one of your hands releases the string and moves to the keyboard to press the SPACE key.
// \n4. 🔉 You’ll hear the sound of a camera shutter.
// [[LL11]]
// `,
//   },
//   RC_UseObjectToSetViewingDistanceLowerRightPage4: {
//     en: `[[TT1]] LOWER-RIGHT CORNER SNAPSHOT
// [[SS1]] 1. Repeat for the lower-right corner of the screen (far corner of video).
// [[SS2]] 2. Use your object to set the same distance, now eye-to-corner.
// [[SS3]] 3. Hold still, uncover your face, and press SPACE.`,
//   },
//   RC_produceDistanceCameraTiltAndSwivel: {
//     en: `[[TT1]]
// SCREEN ALIGNMENT AND CAMERA-CENTER MEASUREMENT
// [[SS1]] 1. Tilt and swivel the screen until your eyes in the video are centered on the red cross.
// [[SS2]] 2. Check tracking: The video shows blue circles on your eyes. If they turn red and freeze, move more of your face into view.
// [[SS3]] 3. Set distance: Position one eye [[N11]] [[UUU]] from the camera (in top center of screen) using a tape or stick:
// [[SS3.1]] ⭘ Mark the desired length with your thumbnail.
// [[LL7]]
// [[SS3.2]] ⭘ If using a stick or metal tape: Place the end at the camera and your thumbnail beside your eye.
// [[SS3.3]] ⭘ If using a cloth tape: Place your thumbnail at the camera and bring the tape’s free end to your eye.
// [[SS4]] 4. Skip the impossible: If a distance is too hard to measure, press ❌ or X to skip it.
// [[SS5]] 5. Take snapshot: Hold still, uncover your face, and press SPACE. (🔉 SPACE bar will play the sound of a camera shutter.)
// [[SS6]] 6. The green progress bar below tracks completion.
// [[SS7]] 7. Repeat for the next distance.
// \nTip: If the phone keypad freezes, tap the address bar and press Go.
// `,
//   },
//   RC_produceDistanceCamera: {
//     en: `[[TT1]] CAMERA-CENTER DISTANCE MEASUREMENT
// [[SS1]] 1. Check tracking: The video shows blue circles on your eyes. If they turn red and freeze, move more of your face into view.
// [[SS2]] 2. Set distance: Position one eye [[N11]] [[UUU]] from the camera (in top center of screen) using a tape or stick:
// [[SS2.1]] ⭘ Mark the desired length with your thumbnail.
// [[LL7]]
// [[SS2.2]] ⭘ If using a stick or metal tape: Place the end at the camera and your thumbnail beside your eye.
// [[SS2.3]] ⭘ If using a cloth tape: Place your thumbnail at the camera and bring the tape’s free end to your eye.
// [[SS3]] 3. Skip the impossible: If a distance is too hard to measure, press ❌ or X to skip it.
// [[SS4]] 4. Take snapshot: Hold still, uncover your face, and press SPACE. (🔉 SPACE bar will play the sound of a camera shutter.)
// \n5. The green progress bar below tracks completion.
// \n6. Repeat for the next distance.
// \nTip: If the phone keypad freezes, tap the address bar and press Go.`,
//   },
//   RC_produceDistanceTiltAndSwivel: {
//     en: `[[TT1]]
// SCREEN-CENTER DISTANCE MEASUREMENT
// [[SS1]] 1. Tilt and swivel the screen until your eyes in the video are centered on the red cross.
// [[SS2]] 2. Check tracking: The video shows blue circles on your eyes. If they turn red and freeze, move more of your face into view.
// [[SS3]] 3. Set distance: Position one eye [[N11]] [[UUU]] from the screen center using a tape or stick.
// [[SS3.1]] ⭘ Mark the desired length with your thumbnail.
// [[LL7]]
// [[SS3.2]] ⭘ If using a stick or metal tape: Place the end at the screen center and your thumbnail beside your eye.
// [[SS3.3]] ⭘ If using a cloth tape: Place your thumbnail at the screen center and bring the tape’s free end to your eye.
// [[SS4]] 4. Skip the impossible: If a distance is too hard to measure, press ❌ or X to skip it.
// [[SS5]] 5. Take snapshot: Hold still, uncover your face, and press SPACE. (🔉 SPACE bar will play the sound of a camera shutter.)
// [[SS6]] 6. The green progress bar below tracks completion.
// [[SS7]] 7. Repeat for the next distance.
// \nTip: If the phone keypad freezes, tap the address bar and press Go.
// `,
//   },
//   RC_produceDistance: {
//     en: `[[TT1]]
// SCREEN-CENTER DISTANCE MEASUREMENT
// [[SS1]] 1. Check tracking: The video shows blue circles on your eyes. If they turn red and freeze, move more of your face into view.
// [[SS2]] 2. Set distance: Position one eye [[N11]] [[UUU]] from the screen center using a tape or stick:
// [[SS2.1]] ⭘ Mark the desired length with your thumbnail.
// [[LL7]]
// [[SS2.2]] ⭘ If using a stick or metal tape: Place the end at the screen center and your thumbnail beside your eye.
// [[SS2.3]] ⭘ If using a cloth tape: Place your thumbnail at the screen center and bring the tape's free end to your eye.
// [[SS3]] 3. Skip the impossible: If a distance is too hard to measure, press ❌ or X to skip it.
// [[SS4]] 4. Take snapshot: Hold still, uncover your face, and press SPACE. (🔉 SPACE bar will play the sound of a camera shutter.)
// [[SS5]] 5. The green progress bar below tracks completion.
// [[SS6]] 6. Repeat for the next distance.
// \nTip: If the phone keypad freezes, tap the address bar and press Go.
// `,
//   },
}
