/**
 * V2.0 M6 · Draggable vertical resize handle
 *
 * Place between two panels. Fires onResize(deltaX) during drag,
 * onResizeEnd() when the user releases.
 */

import { useCallback, useRef } from 'react'
import { cn } from '@/lib/cn'

interface Props {
  onResize: (delta: number) => void
  onResizeEnd?: () => void
  className?: string
}

export function ResizeHandle({ onResize, onResizeEnd, className }: Props) {
  const dragging = useRef(false)
  const lastX = useRef(0)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      dragging.current = true
      lastX.current = e.clientX

      const onMove = (ev: MouseEvent) => {
        if (!dragging.current) return
        const delta = ev.clientX - lastX.current
        lastX.current = ev.clientX
        onResize(delta)
      }

      const onUp = () => {
        dragging.current = false
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        onResizeEnd?.()
      }

      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [onResize, onResizeEnd],
  )

  return (
    <div
      onMouseDown={handleMouseDown}
      className={cn(
        'relative w-[5px] shrink-0 cursor-col-resize group z-10',
        className,
      )}
    >
      {/* Visual line */}
      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-neutral-200 dark:bg-neutral-800 group-hover:w-[2px] group-hover:bg-neutral-300 dark:group-hover:bg-neutral-700 transition-all duration-150" />
    </div>
  )
}
