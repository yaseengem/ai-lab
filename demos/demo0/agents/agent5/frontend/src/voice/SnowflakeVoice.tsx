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
 *   connecting — slow spin + gentle pulse, desaturated.
 *   live idle  — soft multi-colour "breathing" while no one is speaking.
 *   YOU speak  — GREY (monochrome): arms shudder with a sharp, high-frequency jitter,
 *                no continuous spin. Scale tracks your mic level. Feels like input.
 *   AI speaks  — MULTI-COLOUR: a shifting rainbow glow, the whole flake rotates and
 *                breathes smoothly, branches fan out. Feels like a reply.
 *
 * The two speakers are deliberately distinct in BOTH colour and motion so a glance
 * tells you who holds the floor.
 */
export type FlakeState = 'off' | 'connecting' | 'live'
export interface SnowflakeHandle {
  setState: (s: FlakeState) => void
  setLevel: (kind: 'user' | 'assistant', level: number) => void
}

// Twelve vivid hues — the source of the "multi-coloured" look. The palette cycles across
// all arms. When the user speaks we drop a grayscale() filter over the whole flake.
const PALETTE = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#22c55e', '#14b8a6', '#06b6d4',
  '#3b82f6', '#6366f1', '#a855f7', '#ec4899',
]
// Many fine strands — plain radial spokes, no branches and no tip crystals. Alternating
// long/short lengths give the sunburst some texture without any zig-zag detail.
const ARM_COUNT = 120
const ARM_ANGLES = Array.from({ length: ARM_COUNT }, (_, i) => (360 / ARM_COUNT) * i)

// Base radius each strand grows from; its live length is BASE × a per-strand factor that
// pulses with the audio level (see the rAF loop) so the flake bounces like an equaliser.
const BASE_LEN = 40

export const SnowflakeVoice = forwardRef<SnowflakeHandle, { size?: number }>(
  function SnowflakeVoice({ size = 160 }, ref) {
    const svgRef = useRef<SVGSVGElement | null>(null)
    const gRef = useRef<SVGGElement | null>(null)
    const lineRefs = useRef<(SVGLineElement | null)[]>([])

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

        let opacity = 0.45
        let scale = 1
        let rotate = 0
        let jitterX = 0
        let jitterY = 0
        let glow = 0
        let glowColor = '#94a3b8'
        let grayscale = 1 // 1 = fully grey, 0 = full colour
        let stroke = 1.4

        if (st === 'connecting') {
          opacity = 0.7
          rotate = t * 40
          scale = 1 + Math.sin(t * 2) * 0.04
          glow = 6
          glowColor = '#60a5fa'
          grayscale = 0.55
        } else if (st === 'live') {
          if (speaking === 'user') {
            // YOU — grey, sharp shudder, NO continuous spin. Reads as "listening to you".
            grayscale = 1
            opacity = 1
            scale = 1 + level * 0.34
            rotate = Math.sin(t * 2) * 1.5
            jitterX = Math.sin(t * 90) * level * 4
            jitterY = Math.cos(t * 83) * level * 4
            glow = 6 + level * 18
            glowColor = '#64748b'
            stroke = 1.6 + level * 1.0
          } else if (speaking === 'assistant') {
            // AI — full multi-colour, smooth rotation + breathing pulse, rainbow glow.
            grayscale = 0
            opacity = 1
            scale = 1 + level * 0.5 + Math.sin(t * 3) * 0.03
            rotate = t * 55
            jitterX = Math.sin(t * 30) * level * 1.6
            jitterY = Math.cos(t * 28) * level * 1.6
            glow = 12 + level * 34
            glowColor = `hsl(${(t * 80) % 360}, 90%, 60%)` // shifting rainbow halo
            stroke = 1.6 + level * 1.3
          } else {
            // idle while connected — calm multi-colour breathing
            grayscale = 0.25
            opacity = 0.9
            scale = 1 + Math.sin(t * 1.6) * 0.045
            rotate = t * 8
            glow = 6
            glowColor = '#a5b4fc'
          }
        } else {
          // off — dormant grey
          grayscale = 1
          opacity = 0.4
        }

        // Per-strand length — an equaliser. At rest every strand sits near a calm length
        // with a gentle shimmer; as the level rises, a travelling multi-frequency wave
        // around the ring drives each strand to a different length, so the flake bounces
        // and "dances" with the audio. The AI's turn is given a faster, livelier tempo.
        const speed = speaking === 'assistant' ? 1.35 : speaking === 'user' ? 1.0 : 0.6
        const lines = lineRefs.current
        for (let i = 0; i < lines.length; i++) {
          const ln = lines[i]
          if (!ln) continue
          const wave = 0.6 * Math.sin(t * 5 * speed + i * 0.6) + 0.4 * Math.sin(t * 8.3 * speed + i * 0.27)
          const perStrand = 0.3 + 1.4 * (wave * 0.5 + 0.5) // 0.3 … 1.7
          const calm = 0.9 + 0.06 * Math.sin(t * 1.5 + i)
          const factor = (1 - level) * calm + level * perStrand
          ln.setAttribute('y2', (-BASE_LEN * factor).toFixed(2))
        }

        if (gRef.current) {
          gRef.current.style.transform =
            `translate(${jitterX.toFixed(2)}px, ${jitterY.toFixed(2)}px) scale(${scale.toFixed(3)}) rotate(${rotate.toFixed(2)}deg)`
        }
        if (svgRef.current) {
          svgRef.current.style.opacity = String(opacity)
          const shadow = glow > 0.5 ? ` drop-shadow(0 0 ${glow.toFixed(1)}px ${glowColor})` : ''
          svgRef.current.style.filter = `grayscale(${grayscale.toFixed(2)})${shadow}`
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
        viewBox="-72 -72 144 144"
        style={{ opacity: 0.45, filter: 'grayscale(1)', transition: 'opacity 0.4s ease' }}
      >
        <g ref={gRef} style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
           strokeWidth="var(--sw, 1.4)" strokeLinecap="round">
          {ARM_ANGLES.map((deg, i) => (
            <g key={deg} transform={`rotate(${deg})`}
               style={{ color: PALETTE[i % PALETTE.length] }} stroke="currentColor">
              <line ref={el => { lineRefs.current[i] = el }} x1="0" y1="0" x2="0" y2={-BASE_LEN} />
            </g>
          ))}
        </g>
      </svg>
    )
  },
)
