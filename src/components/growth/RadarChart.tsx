/**
 * RadarChart — SVG-based cognitive radar visualization.
 *
 * Renders a hexagonal radar chart from 6 RadarDimension values.
 * Pure CSS + SVG, no external chart library.
 */

import { motion } from 'framer-motion'
import type { RadarDimension } from '@/types'

const EASE = [0.16, 1, 0.3, 1] as const

interface Props {
  data: RadarDimension[]
  size?: number
  className?: string
  /** Show dimension descriptions below the chart */
  showDescriptions?: boolean
}

export function RadarChart({ data, size = 220, className, showDescriptions = false }: Props) {
  if (!data || data.length === 0) return null

  const pad = 36 // padding for labels outside the chart
  const vbSize = size + pad * 2
  const cx = vbSize / 2
  const cy = vbSize / 2
  const r = size * 0.38 // max radius
  const n = data.length
  const angleStep = (2 * Math.PI) / n
  const startAngle = -Math.PI / 2 // top

  // Grid rings (20%, 40%, 60%, 80%, 100%)
  const rings = [0.2, 0.4, 0.6, 0.8, 1.0]

  function polarToXY(angle: number, radius: number): [number, number] {
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]
  }

  // Build polygon points for data
  const dataPoints = data.map((d, i) => {
    const angle = startAngle + i * angleStep
    const val = Math.max(0, Math.min(100, d.score)) / 100
    return polarToXY(angle, r * val)
  })
  const dataPath = dataPoints.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ') + 'Z'

  // Grid ring paths
  const ringPaths = rings.map((pct) => {
    const pts = Array.from({ length: n }, (_, i) => {
      const angle = startAngle + i * angleStep
      return polarToXY(angle, r * pct)
    })
    return pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ') + 'Z'
  })

  // Axis lines
  const axes = Array.from({ length: n }, (_, i) => {
    const angle = startAngle + i * angleStep
    return polarToXY(angle, r)
  })

  // Label positions (outside the chart with enough room)
  const labels = data.map((d, i) => {
    const angle = startAngle + i * angleStep
    const labelR = r + 28
    const [x, y] = polarToXY(angle, labelR)
    return { x, y, text: d.axis, score: d.score }
  })

  // Color based on average score
  const avgScore = data.reduce((s, d) => s + d.score, 0) / n
  const fillColor = avgScore >= 60 ? 'rgba(139,92,246,0.2)' : avgScore >= 40 ? 'rgba(96,165,250,0.2)' : 'rgba(251,146,60,0.2)'
  const strokeColor = avgScore >= 60 ? 'rgb(139,92,246)' : avgScore >= 40 ? 'rgb(96,165,250)' : 'rgb(251,146,60)'

  return (
    <div className={className}>
      <svg viewBox={`0 0 ${vbSize} ${vbSize}`} className="w-full" style={{ maxWidth: size + pad }}>
        {/* Grid rings */}
        {ringPaths.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke="currentColor"
            className="text-neutral-200 dark:text-neutral-700/60"
            strokeWidth={i === ringPaths.length - 1 ? 1 : 0.5}
          />
        ))}

        {/* Axis lines */}
        {axes.map(([x, y], i) => (
          <line
            key={i}
            x1={cx} y1={cy} x2={x} y2={y}
            stroke="currentColor"
            className="text-neutral-200 dark:text-neutral-700/60"
            strokeWidth={0.5}
          />
        ))}

        {/* Data polygon */}
        <motion.path
          d={dataPath}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={2}
          strokeLinejoin="round"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: EASE }}
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        />

        {/* Data points */}
        {dataPoints.map(([x, y], i) => (
          <motion.circle
            key={i}
            cx={x} cy={y} r={3}
            fill={strokeColor}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.3 + i * 0.05 }}
          />
        ))}

        {/* Labels */}
        {labels.map((l, i) => (
          <g key={i}>
            <text
              x={l.x} y={l.y - 5}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-neutral-600 dark:fill-neutral-300"
              fontSize={10}
              fontWeight={500}
            >
              {l.text}
            </text>
            <text
              x={l.x} y={l.y + 7}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-neutral-400 dark:fill-neutral-500"
              fontSize={9}
              fontFamily="monospace"
            >
              {l.score}
            </text>
          </g>
        ))}
      </svg>

      {/* Descriptions */}
      {showDescriptions && (
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
          {data.map((d) => (
            <div key={d.axis} className="flex items-start gap-1.5 text-[0.6875rem]">
              <span
                className="mt-0.5 w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: strokeColor }}
              />
              <div>
                <span className="font-medium text-neutral-700 dark:text-neutral-300">{d.axis}</span>
                <span className="text-neutral-400 dark:text-neutral-500 ml-1">{d.score}</span>
                {d.description && (
                  <p className="text-neutral-500 dark:text-neutral-400 mt-0.5">{d.description}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
