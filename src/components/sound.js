import { Synth } from 'tone'

const feedbackSynth = new Synth({
  oscillator: {
    type: 'sine',
  },
  envelope: { attack: 0.001, decay: 0.001, sustain: 1, release: 0.001 },
}).toDestination()

export const soundFeedback = () => {
  feedbackSynth.triggerAttackRelease(2000, 0.05)
}
