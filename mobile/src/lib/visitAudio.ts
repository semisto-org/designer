// The sound of a site visit: what the owner and the designer say on the
// walk, recorded with the screen off (iOS « audio » background mode, an
// Android foreground service), paused and resumed at will. One recorder
// lives for the whole visit, outside any screen, so that closing the map
// or opening a note does not stop it. At the end of the visit the file is
// kept with the photos waiting to be sent, then filed in the map's
// documents (SiteVisit#attach_audio!).
import { AudioModule, AudioQuality, IOSOutputFormat, requestRecordingPermissionsAsync, setAudioModeAsync, type AudioRecorder, type RecordingOptions } from 'expo-audio'
import { Platform } from 'react-native'
import { report } from './monitoring'
import { keepAudio } from './storage'

// Speech, not music: mono AAC at 64 kb/s, about 30 MB an hour.
const COMMON = { extension: '.m4a', sampleRate: 44100, numberOfChannels: 1, bitRate: 64000, isMeteringEnabled: false, directory: 'document' as const }
const OPTIONS = (Platform.OS === 'ios'
  ? { ...COMMON, outputFormat: IOSOutputFormat.MPEG4AAC, audioQuality: AudioQuality.MEDIUM }
  : { ...COMMON, outputFormat: 'mpeg4', audioEncoder: 'aac' }) as unknown as Partial<RecordingOptions>

let recorder: AudioRecorder | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

export type AudioState = { live: boolean; recording: boolean; seconds: number }

async function mode(recording: boolean) {
  await setAudioModeAsync({ allowsRecording: recording, allowsBackgroundRecording: recording, playsInSilentMode: true, interruptionMode: 'mixWithOthers' })
}

export const visitAudio = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },

  /** Whether this app run holds the recorder, whether it records, and for how long. */
  state(): AudioState {
    if (!recorder) return { live: false, recording: false, seconds: 0 }
    return { live: true, recording: recorder.isRecording, seconds: recorder.currentTime }
  },

  /** Starts recording; returns the file being written, to find it again if the app is closed. */
  async start(): Promise<{ file: string | null } | 'no_permission' | 'failed'> {
    const permission = await requestRecordingPermissionsAsync()
    if (!permission.granted) return 'no_permission'
    try {
      await mode(true)
      recorder ??= new AudioModule.AudioRecorder(OPTIONS)
      await recorder.prepareToRecordAsync()
      recorder.record()
      notify()
      return { file: recorder.uri }
    } catch (error) {
      report(error, { where: 'visitAudio.start' })
      await visitAudio.discard()
      return 'failed'
    }
  },

  pause() {
    recorder?.pause()
    notify()
  },

  resume() {
    recorder?.record()
    notify()
  },

  /**
   * Stops for good and keeps the file until it is sent. `saved` is the file
   * noted at the start: after the app was closed mid-visit there is no
   * recorder left, and what was written so far is sent as it is.
   */
  async finish(saved: string | null): Promise<{ file: string; seconds: number | null } | null> {
    let uri = saved
    let seconds: number | null = null
    if (recorder) {
      seconds = Math.round(recorder.currentTime)
      try {
        await recorder.stop()
      } catch (error) {
        report(error, { where: 'visitAudio.finish' })
      }
      uri = recorder.uri ?? saved
      recorder.release()
      recorder = null
      await mode(false).catch(() => undefined)
      notify()
    }
    if (!uri) return null
    try {
      return { file: keepAudio(uri), seconds }
    } catch (error) {
      report(error, { where: 'visitAudio.keep' })
      return null
    }
  },

  async discard() {
    if (recorder) {
      await recorder.stop().catch(() => undefined)
      recorder.release()
      recorder = null
    }
    await mode(false).catch(() => undefined)
    notify()
  },
}
