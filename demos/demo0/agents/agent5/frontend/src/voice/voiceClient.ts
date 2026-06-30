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
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
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
      if (this.micAnalyser) this.cb.onLevel?.('user', rms(this.micAnalyser, micScratch))
      if (this.playAnalyser) this.cb.onLevel?.('assistant', rms(this.playAnalyser, playScratch))
      this.meterRaf = requestAnimationFrame(tick)
    }
    this.meterRaf = requestAnimationFrame(tick)
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
    const int16 = base64ToInt16(b64)
    const f32 = new Float32Array(int16.length)
    for (let i = 0; i < int16.length; i++) f32[i] = int16[i] / 0x8000
    const buffer = this.playCtx.createBuffer(1, f32.length, OUTPUT_RATE)
    buffer.copyToChannel(f32, 0)
    const src = this.playCtx.createBufferSource()
    src.buffer = buffer
    src.connect(this.playAnalyser!)
    const now = this.playCtx.currentTime
    if (this.playHead < now) this.playHead = now
    src.start(this.playHead)
    this.playHead += buffer.duration
  }

  async stop(): Promise<void> {
    this.active = false
    if (this.meterRaf) cancelAnimationFrame(this.meterRaf)
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
