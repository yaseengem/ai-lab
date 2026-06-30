/**
 * Browser side of the Nova Sonic voice loop.
 *
 *   mic ─getUserMedia─▶ AudioContext ─downsample 16 kHz Int16─▶ base64 ─WS▶ backend
 *   speaker ◀─AudioBuffer 24 kHz─ decode base64 Int16 ◀─WS── backend (audioOutput)
 *
 * The backend (apis/routes.py WS /voice) bridges to the bidirectional Bedrock stream.
 * Events flow back as JSON: {type:'ready'|'transcript'|'audio'|'tool'|'error'|'done'}.
 *
 * Capture uses a ScriptProcessorNode — deprecated but universally available and
 * adequate for a demo; no separate AudioWorklet file is needed. Two AnalyserNodes
 * (one on the mic, one on playback) drive a requestAnimationFrame meter loop that
 * emits live amplitude levels (onLevel) so the UI can visualise who is speaking.
 */
import { voiceWsUrl } from '../api/client'

const INPUT_RATE = 16000
const OUTPUT_RATE = 24000
// After a barge-in we drop ALL arriving AI audio until the backend signals the next spoken
// turn ('speech_start' — the real boundary). This value is only a FALLBACK: if that signal
// never arrives we release suppression after this long so the AI can't go permanently silent.
// It is deliberately long because Nova 2 streams the interrupted turn's trailing audio faster
// than real-time for an unknown duration; the boundary signal normally releases far sooner.
const BARGE_IN_SUPPRESS_SEC = 1.5

export interface VoiceCallbacks {
  onReady?: () => void
  onTranscript?: (role: 'user' | 'assistant', text: string) => void
  onTool?: (name: string, status: 'running' | 'done') => void
  /** Live amplitude (0..1) for the mic ('user') and the AI playback ('assistant'). */
  onLevel?: (kind: 'user' | 'assistant', level: number) => void
  onError?: (message: string, fallback: boolean, code?: string) => void
  onClose?: () => void
}

type AudioCtor = typeof AudioContext

function audioContext(rate?: number): AudioContext {
  const Ctor: AudioCtor =
    window.AudioContext || (window as unknown as { webkitAudioContext: AudioCtor }).webkitAudioContext
  return rate ? new Ctor({ sampleRate: rate }) : new Ctor()
}

function floatTo16BitPCM(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

function downsample(buffer: Float32Array, inRate: number, outRate: number): Float32Array {
  if (outRate >= inRate) return buffer
  const ratio = inRate / outRate
  const outLen = Math.floor(buffer.length / ratio)
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) out[i] = buffer[Math.floor(i * ratio)]
  return out
}

function int16ToBase64(int16: Int16Array): string {
  const bytes = new Uint8Array(int16.buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function base64ToInt16(b64: string): Int16Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Int16Array(bytes.buffer)
}

function rms(analyser: AnalyserNode, scratch: Float32Array<ArrayBuffer>): number {
  analyser.getFloatTimeDomainData(scratch)
  let sum = 0
  for (let i = 0; i < scratch.length; i++) sum += scratch[i] * scratch[i]
  // RMS → perceptual-ish 0..1 with a little gain so quiet speech still registers.
  return Math.min(1, Math.sqrt(sum / scratch.length) * 3.5)
}

export class VoiceClient {
  private ws: WebSocket | null = null
  private micCtx: AudioContext | null = null
  private playCtx: AudioContext | null = null
  private stream: MediaStream | null = null
  private processor: ScriptProcessorNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private mute: GainNode | null = null
  private micAnalyser: AnalyserNode | null = null
  private playAnalyser: AnalyserNode | null = null
  private meterRaf = 0
  private playHead = 0
  private active = false
  // Every AI audio chunk we schedule, so a barge-in can stop them all at once.
  private playing: AudioBufferSourceNode[] = []
  // While a barge-in is active, AI audio chunks that are still arriving (Nova 2 generates
  // faster than real-time and streams ahead) are dropped instead of played. In playCtx
  // seconds; 0 = not suppressing. Re-armed every frame the user keeps talking.
  private suppressUntil = 0

  constructor(
    private sessionId: string,
    private persona: string,
    private cb: VoiceCallbacks,
  ) {}

  async start(): Promise<void> {
    this.ws = new WebSocket(voiceWsUrl(this.sessionId, this.persona))
    this.active = true

    this.ws.onmessage = ev => this.onMessage(ev)
    this.ws.onerror = () => this.cb.onError?.('voice connection error', true)
    this.ws.onclose = () => {
      this.active = false
      this.cb.onClose?.()
    }

    await new Promise<void>((resolve, reject) => {
      if (!this.ws) return reject(new Error('no socket'))
      this.ws.onopen = () => resolve()
      setTimeout(() => reject(new Error('voice connection timeout')), 8000)
    })

    await this.startCapture()
    this.startMeter()
  }

  private async startCapture(): Promise<void> {
    // Echo cancellation keeps the AI's own playback from leaking into the mic and
    // tripping the barge-in detector (false interruptions).
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
    this.micCtx = audioContext()
    this.source = this.micCtx.createMediaStreamSource(this.stream)

    this.micAnalyser = this.micCtx.createAnalyser()
    this.micAnalyser.fftSize = 512
    this.source.connect(this.micAnalyser)

    this.processor = this.micCtx.createScriptProcessor(4096, 1, 1)
    const inRate = this.micCtx.sampleRate
    this.processor.onaudioprocess = e => {
      if (!this.active || this.ws?.readyState !== WebSocket.OPEN) return
      const input = e.inputBuffer.getChannelData(0)
      const down = downsample(input, inRate, INPUT_RATE)
      this.ws.send(JSON.stringify({ type: 'audio', audio: int16ToBase64(floatTo16BitPCM(down)) }))
    }
    // Route through a muted gain so the processor runs without echoing the mic.
    this.mute = this.micCtx.createGain()
    this.mute.gain.value = 0
    this.source.connect(this.processor)
    this.processor.connect(this.mute)
    this.mute.connect(this.micCtx.destination)
  }

  private startMeter(): void {
    const micScratch = new Float32Array(256)
    const playScratch = new Float32Array(256)
    const tick = () => {
      if (!this.active) return
      const userLevel = this.micAnalyser ? rms(this.micAnalyser, micScratch) : 0
      if (this.micAnalyser) this.cb.onLevel?.('user', userLevel)
      if (this.playAnalyser) this.cb.onLevel?.('assistant', rms(this.playAnalyser, playScratch))

      // Local barge-in: if the user speaks while AI audio is still queued ahead of the
      // playback clock, cut the AI off immediately rather than waiting for the server
      // round-trip. While the user keeps talking this fires every frame, re-arming the
      // suppression window so chunks the model is still streaming get dropped — the next
      // AI turn (after the window lapses) plays normally.
      if (userLevel > 0.14 && this.playCtx && this.playHead > this.playCtx.currentTime + 0.12) {
        this.bargeIn()
      }
      this.meterRaf = requestAnimationFrame(tick)
    }
    this.meterRaf = requestAnimationFrame(tick)
  }

  /** Stop and discard every scheduled AI audio chunk; reset the playback clock. */
  private stopPlayback(): void {
    for (const s of this.playing) {
      try { s.onended = null; s.stop() } catch { /* already finished */ }
    }
    this.playing = []
    if (this.playCtx) this.playHead = this.playCtx.currentTime
  }

  /**
   * Handle a barge-in: flush scheduled AI audio AND open a suppression window so chunks the
   * model is still streaming (it runs faster than real-time) are dropped rather than played.
   * Safe to call repeatedly — each call re-arms the window.
   */
  private bargeIn(): void {
    this.stopPlayback()
    if (this.playCtx) this.suppressUntil = this.playCtx.currentTime + BARGE_IN_SUPPRESS_SEC
  }

  private onMessage(ev: MessageEvent): void {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(ev.data as string)
    } catch {
      return
    }
    switch (msg.type) {
      case 'ready':
        this.cb.onReady?.()
        break
      case 'transcript':
        this.cb.onTranscript?.((msg.role as 'user' | 'assistant') ?? 'assistant', String(msg.text ?? ''))
        break
      case 'audio':
        this.playPcm(String(msg.audio ?? ''))
        break
      case 'interrupted':
        // Server-confirmed barge-in: flush queued AI speech AND start dropping all arriving audio
        // (the interrupted turn's trailing chunks keep coming faster than real-time). Suppression
        // is released by 'speech_start' (the next turn's boundary), not by a timer.
        this.bargeIn()
        break
      case 'speech_start':
        // Boundary of a new ASSISTANT spoken turn. Everything before it (trailing audio of the
        // interrupted turn) was dropped; release suppression now so the new turn plays from its
        // first word. No-op outside a barge-in (suppressUntil is already 0).
        this.suppressUntil = 0
        break
      case 'tool':
        this.cb.onTool?.(String(msg.name ?? ''), (msg.status as 'running' | 'done') ?? 'running')
        break
      case 'error':
        this.cb.onError?.(String(msg.message ?? 'voice error'), Boolean(msg.fallback),
                          msg.code ? String(msg.code) : undefined)
        break
      case 'done':
        break
    }
  }

  /** Send a typed turn into the live voice session (cross-modal). */
  sendText(text: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'text', text }))
    }
  }

  private playPcm(b64: string): void {
    if (!b64) return
    if (!this.playCtx) {
      this.playCtx = audioContext(OUTPUT_RATE)
      this.playAnalyser = this.playCtx.createAnalyser()
      this.playAnalyser.fftSize = 512
      this.playAnalyser.connect(this.playCtx.destination)
    }
    // Inside a barge-in window, discard chunks the model is still streaming from the
    // interrupted turn so the AI doesn't talk over the user.
    if (this.playCtx.currentTime < this.suppressUntil) return
    const int16 = base64ToInt16(b64)
    const f32 = new Float32Array(int16.length)
    for (let i = 0; i < int16.length; i++) f32[i] = int16[i] / 0x8000
    const buffer = this.playCtx.createBuffer(1, f32.length, OUTPUT_RATE)
    buffer.copyToChannel(f32, 0)
    const src = this.playCtx.createBufferSource()
    src.buffer = buffer
    src.connect(this.playAnalyser!)
    const now = this.playCtx.currentTime
    // Resuming from idle (first turn, or first chunk after a gap/barge-in): start a hair ahead so a
    // cold or just-resumed AudioContext is actually outputting by the scheduled time. Scheduling at
    // exactly currentTime on a not-yet-warm context can drop the first buffer and clip the opening.
    if (this.playHead < now) this.playHead = now + 0.06
    src.start(this.playHead)
    this.playHead += buffer.duration
    // Track so a barge-in can stop it; drop it from the list once it finishes on its own.
    this.playing.push(src)
    src.onended = () => { this.playing = this.playing.filter(s => s !== src) }
  }

  async stop(): Promise<void> {
    this.active = false
    if (this.meterRaf) cancelAnimationFrame(this.meterRaf)
    this.stopPlayback()
    try {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'stop' }))
    } catch {
      /* ignore */
    }
    this.processor?.disconnect()
    this.source?.disconnect()
    this.mute?.disconnect()
    this.stream?.getTracks().forEach(t => t.stop())
    try { await this.micCtx?.close() } catch { /* ignore */ }
    try { await this.playCtx?.close() } catch { /* ignore */ }
    this.ws?.close()
    this.ws = null
  }
}
