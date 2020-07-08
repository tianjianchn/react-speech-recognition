import isAndroid from './isAndroid'
import { debounce, concatTranscripts } from './utils'

export default class RecognitionManager {
  constructor() {
    const BrowserSpeechRecognition =
      typeof window !== 'undefined' &&
      (window.SpeechRecognition ||
        window.webkitSpeechRecognition ||
        window.mozSpeechRecognition ||
        window.msSpeechRecognition ||
        window.oSpeechRecognition)
    this.recognition = BrowserSpeechRecognition
      ? new BrowserSpeechRecognition()
      : null
    this.browserSupportsSpeechRecognition = this.recognition !== null
    this.pauseAfterDisconnect = false
    this.interimTranscript = ''
    this.listening = false
    this.subscribers = []
    this.onStopListening = () => {}

    if (this.browserSupportsSpeechRecognition) {
      this.recognition.continuous = true
      this.recognition.interimResults = true
      this.recognition.onresult = this.updateTranscript.bind(this)
      this.recognition.onend = this.onRecognitionDisconnect.bind(this)
    }

    this.resetTranscript = this.resetTranscript.bind(this)
    this.startListening = this.startListening.bind(this)
    this.stopListening = this.stopListening.bind(this)
    this.abortListening = this.abortListening.bind(this)

    if (isAndroid()) {
      this.updateFinalTranscript = debounce(this.updateFinalTranscript, 250, true)
    }
  }

  subscribe(callbacks) {
    this.subscribers.push(callbacks)
  }

  unsubscribe(callbacks) {
    const index = this.subscribers.indexOf(callbacks)
    this.subscribers.splice(index, 1)
  }

  emitListeningChange(listening) {
    this.listening = listening
    this.subscribers.forEach(({ onListeningChange }) => {
      onListeningChange(listening)
    })
  }

  emitTranscriptChange(interimTranscript, finalTranscript) {
    this.subscribers.forEach(({ onTranscriptChange }) => {
      onTranscriptChange(interimTranscript, finalTranscript)
    })
  }

  emitClearTranscript() {
    this.subscribers.forEach(({ onClearTranscript }) => {
      onClearTranscript()
    })
  }

  disconnect(disconnectType) {
    if (this.browserSupportsSpeechRecognition) {
      switch (disconnectType) {
        case 'ABORT':
          this.pauseAfterDisconnect = true
          this.abort()
          break
        case 'RESET':
          this.pauseAfterDisconnect = false
          this.abort()
          break
        case 'STOP':
        default:
          this.pauseAfterDisconnect = true
          this.stop()
      }
    }
  }

  onRecognitionDisconnect() {
    this.onStopListening()
    this.listening = false
    if (this.pauseAfterDisconnect) {
      this.emitListeningChange(false)
    } else if (this.browserSupportsSpeechRecognition) {
      if (this.recognition.continuous) {
        this.startListening()
      } else {
        this.emitListeningChange(false)
      }
    }
    this.pauseAfterDisconnect = false
  }

  updateTranscript(event) {
    this.interimTranscript = ''
    this.finalTranscript = ''
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal && (!isAndroid() || event.results[i][0].confidence > 0)) {
        this.updateFinalTranscript(event.results[i][0].transcript)
      } else {
        this.interimTranscript = concatTranscripts(
          this.interimTranscript,
          event.results[i][0].transcript
        )
      }
    }
    this.emitTranscriptChange(this.interimTranscript, this.finalTranscript)
  }

  updateFinalTranscript(newFinalTranscript) {
    this.finalTranscript = concatTranscripts(
      this.finalTranscript,
      newFinalTranscript
    )
  }

  resetTranscript() {
    this.disconnect('RESET')
  }

  async startListening({ continuous, language } = {}) {
    if (!this.browserSupportsSpeechRecognition) {
      return
    }

    const isContinuousChanged =
        continuous !== undefined && continuous !== this.recognition.continuous
    const isLanguageChanged = language && language !== this.recognition.lang
    if (isContinuousChanged || isLanguageChanged) {
      if (this.listening) {
        this.stopListening()
        await new Promise(resolve => {
          this.onStopListening = resolve
        })
      }
      this.recognition.continuous =
          continuous !== undefined ? continuous : this.recognition.continuous
      this.recognition.lang = language || this.recognition.lang
    }
    if (!this.listening) {
      if (!this.recognition.continuous) {
        this.resetTranscript()
        this.emitClearTranscript()
      }
      try {
        this.start()
      } catch (DOMException) {
        // Tried to start recognition after it has already started - safe to swallow this error
      }
      this.emitListeningChange(true)
    }
  }

  abortListening() {
    this.disconnect('ABORT')
    this.emitListeningChange(false)
  }

  stopListening() {
    this.disconnect('STOP')
    this.emitListeningChange(false)
  }

  getRecognition() {
    return this.recognition
  }

  start() {
    if (this.browserSupportsSpeechRecognition && !this.listening) {
      this.recognition.start()
      this.listening = true
    }
  }

  stop() {
    if (this.browserSupportsSpeechRecognition && this.listening) {
      this.recognition.stop()
      this.listening = false
    }
  }

  abort() {
    if (this.browserSupportsSpeechRecognition && this.listening) {
      this.recognition.abort()
      this.listening = false
    }
  }
}
