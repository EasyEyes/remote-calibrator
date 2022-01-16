import { Synth, Volume } from 'tone'

const feedbackSynth = new Synth({
  oscillator: {
    type: 'sine',
  },
  envelope: { attack: 0.001, decay: 0.001, sustain: 1, release: 0.001 },
}).connect(new Volume(-17).toDestination())

const softFeedbackSynth = new Synth({
  oscillator: {
    type: 'sine',
  },
}).connect(new Volume(-5).toDestination())

export const soundFeedback = (style = 0) => {
  switch (style) {
    case 0:
      feedbackSynth.triggerAttackRelease(2000, 0.05)
      return

    case 1:
      // Negative feedback
      feedbackSynth.triggerAttackRelease(500, 0.5)
      return

    case 2:
      // Purr
      feedbackSynth.triggerAttackRelease(200, 0.6)
      return

    case 3:
      softFeedbackSynth.triggerAttackRelease(200, 0.2)
      return

    default:
      feedbackSynth.triggerAttackRelease(2000, 0.05)
      return
  }
}
