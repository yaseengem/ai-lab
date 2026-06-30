import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

/**
 * Reactive snowflake visualiser for the Nova Sonic voice session.
 *
 * It is driven imperatively (no per-frame React re-render): the parent calls
 * `setState(...)` on connect/disconnect and `setLevel(kind, 0..1)` on every audio
 * meter tick. An internal requestAnimationFrame loop eases the levels and paints the
 * SVG transform/colour so motion stays smooth at 60fps.
 *
 * Behaviour by state:
 *   off        — dormant: faint, grey, motionless.
 *   connecting — slow spin + gentle pulse, accent blue, dimmed.
 *   live idle  — soft "breathing" while no one is speaking.
 *   you speak  — BLUE, arms vibrate, scale tracks your mic level.
 *   AI speaks  — VIOLET, arms vibrate + rotate, scale tracks the AI's voice level.
 */
export type FlakeState = 'off' | 'connecting' | 'live'
export interface SnowflakeHandle {
  setState: (s: FlakeState) => void
  setLevel: (kind: 'user' | 'assistant', level: number) => void
}

const COLORS = {
  off: '#cbd5e1',
  connecting: '#60a5fa',
  idle: '#93c5fd',
  user: '#2563eb',
  assistant: '#7c3aed',
}

// One snowflake arm: a spine with two pairs of branches and a tip crystal.
function Arm() {
  return (
    <g>
      <line x1="0" y1="0" x2="0" y2="-46" />
      <line x1="0" y1="-16" x2="-9" y2="-25" />
      <line x1="0" y1="-16" x2="9" y2="-25" />
      <line x1="0" y1="-30" x2="-7" y2="-37" />
      <line x1="0" y1="-30" x2="7" y2="-37" />
      <circle cx="0" cy="-46" r="2.4" />
    </g>
  )
}

export const SnowflakeVoice = forwardRef<SnowflakeHandle, { size?: number }>(
  function SnowflakeVoice({ size = 160 }, ref) {
    const svgRef = useRef<SVGSVGElement | null>(null)
    const gRef = useRef<SVGGElement | null>(null)

    const state = useRef<FlakeState>('off')
    const user = useRef(0)
    const ai = useRef(0)
    const uTarget = useRef(0)
    const aTarget = useRef(0)
    const raf = useRef(0)

    useImperativeHandle(ref, () => ({
      setState: (s: FlakeState) => { state.current = s },
      setLevel: (kind, level) => {
        const v = Math.max(0, Math.min(1, level))
        if (kind === 'user') uTarget.current = v
        else aTarget.current = v
      },
    }), [])

    useEffect(() => {
      const start = performance.now()
      const loop = (now: number) => {
        const t = (now - start) / 1000
        // Ease levels: fast attack, slow release, so vibration feels lively but settles.
        user.current += (uTarget.current - user.current) * (uTarget.current > user.current ? 0.5 : 0.12)
        ai.current += (aTarget.current - ai.current) * (aTarget.current > ai.current ? 0.5 : 0.12)
        uTarget.current *= 0.92
        aTarget.current *= 0.92

        const st = state.current
        const u = user.current
        const a = ai.current
        const speaking = u > a + 0.02 ? 'user' : a > u + 0.02 ? 'assistant' : 'idle'
        const level = Math.max(u, a)

        let color = COLORS.off
        let opacity = 0.45
        let scale = 1
        let rotate = 0
        let jitterX = 0
        let jitterY = 0
        let glow = 0
        let stroke = 1.4

        if (st === 'connecting') {
          color = COLORS.connecting
          opacity = 0.7
          rotate = t * 40
          scale = 1 + Math.sin(t * 2) * 0.04
          glow = 6
        } else if (st === 'live') {
          if (speaking === 'user') {
            color = COLORS.user
            opacity = 1
            scale = 1 + level * 0.42
            rotate = Math.sin(t * 3) * 4
            jitterX = Math.sin(t * 60) * level * 3
            jitterY = Math.cos(t * 55) * level * 3
            glow = 8 + level * 28
            stroke = 1.6 + level * 1.2
          } else if (speaking === 'assistant') {
            color = COLORS.assistant
            opacity = 1
            scale = 1 + level * 0.5
            rotate = t * 50 + Math.sin(t * 8) * 6
            jitterX = Math.sin(t * 75) * level * 2.5
            jitterY = Math.cos(t * 70) * level * 2.5
            glow = 10 + level * 34
            stroke = 1.6 + level * 1.4
          } else {
            // idle while connected — gentle breathing
            color = COLORS.idle
            opacity = 0.85
            scale = 1 + Math.sin(t * 1.6) * 0.045
            rotate = Math.sin(t * 0.6) * 3
            glow = 4
          }
        }

        if (gRef.current) {
          gRef.current.style.transform =
            `translate(${jitterX.toFixed(2)}px, ${jitterY.toFixed(2)}px) scale(${scale.toFixed(3)}) rotate(${rotate.toFixed(2)}deg)`
        }
        if (svgRef.current) {
          svgRef.current.style.opacity = String(opacity)
          svgRef.current.style.color = color
          svgRef.current.style.filter = glow > 0.5 ? `drop-shadow(0 0 ${glow.toFixed(1)}px ${color})` : 'none'
          svgRef.current.style.setProperty('--sw', stroke.toFixed(2))
        }
        raf.current = requestAnimationFrame(loop)
      }
      raf.current = requestAnimationFrame(loop)
      return () => cancelAnimationFrame(raf.current)
    }, [])

    return (
      <svg
        ref={svgRef}
        width={size}
        height={size}
        viewBox="-60 -60 120 120"
        style={{
          color: COLORS.off, opacity: 0.45, transition: 'opacity 0.4s ease',
          stroke: 'currentColor', fill: 'currentColor',
        }}
      >
        <g ref={gRef} style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
           strokeWidth="var(--sw, 1.4)" strokeLinecap="round">
          {[0, 60, 120, 180, 240, 300].map(deg => (
            <g key={deg} transform={`rotate(${deg})`}><Arm /></g>
          ))}
          <circle cx="0" cy="0" r="3.2" />
        </g>
      </svg>
    )
  },
)
