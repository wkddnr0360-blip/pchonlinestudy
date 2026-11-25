import { useEffect, useRef } from 'react'

const width = 76
const height = 44
const finalFrame = 7
const colors = { ink: '#77490c', edge: '#c98213', gold: '#ffcb53', light: '#ffe88d', white: '#fff7ce', green: '#0c644e' }

function drawFrame(context: CanvasRenderingContext2D, frame: number) {
  context.clearRect(0, 0, width, height)

  function rectangle(color: string, x: number, y: number, w: number, h: number) {
    context.fillStyle = color
    context.fillRect(x, y, w, h)
  }

  function ticket(x: number, y: number, w: number, left: boolean, right: boolean) {
    rectangle(colors.ink, x + 2, y, w - 4, 26)
    rectangle(colors.ink, x, y + 2, w, 22)
    rectangle(colors.edge, x + 2, y + 2, w - 4, 22)
    rectangle(colors.gold, x + 2, y + 3, w - 4, 18)
    rectangle(colors.light, x + 4, y + 3, w - 8, 3)
    rectangle(colors.white, x + 5, y + 5, w - 10, 1)
    if (left) context.clearRect(x, y + 10, 3, 6)
    if (right) context.clearRect(x + w - 3, y + 10, 3, 6)
  }

  function sparkle(x: number, y: number, color: string) {
    rectangle(color, x + 2, y, 2, 6)
    rectangle(color, x, y + 2, 6, 2)
  }

  function check(x: number, y: number, scale: number) {
    const pixels = [[0, 2], [1, 3], [2, 4], [3, 3], [4, 2], [5, 1], [6, 0]]
    for (const [column, row] of pixels) rectangle(colors.green, x + column * scale, y + row * scale, scale, scale * 2)
  }

  if (frame <= 2) {
    const y = frame === 1 ? 8 : 9
    ticket(10, y, 56, true, true)
    for (let row = y + 3; row < y + 24; row += 4) rectangle(colors.edge, 50, row, 2, 2)
    if (frame < 2) {
      sparkle(25, y + 9, colors.ink)
      rectangle(colors.light, 31, y + 11, 8, 2)
      rectangle(colors.white, 55, y + 8, 6, 2)
      rectangle(colors.white, 55, y + 16, 6, 2)
    } else {
      check(21, y + 8, 2)
      sparkle(60, 5, colors.light)
    }
    return
  }

  if (frame < 6) {
    ticket(10, 9 + Math.max(0, frame - 3), 41, true, false)
    check(20, 17 + Math.max(0, frame - 3), 2)
    if (frame < 5) ticket(54 + (frame - 3) * 4, 8 - (frame - 3) * 3, 15, false, true)
  } else {
    ticket(21, 9, 34, true, true)
    check(31, 17, 2)
  }

  if (frame < finalFrame) {
    sparkle(59 + (frame % 2) * 5, 5 + frame, colors.edge)
    rectangle(colors.gold, 64, 28 + frame, 3, 3)
    rectangle(colors.edge, 9 - frame, 8, 2, 2)
    rectangle(colors.light, 57, 29 + frame, 2, 2)
  } else {
    sparkle(57, 11, colors.edge)
    sparkle(14, 27, colors.gold)
  }
}

export function TicketArt({ animate = false }: { animate?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const context = canvas.current?.getContext('2d')
    if (!context) return
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let timer: number | undefined
    let frame = 0

    function paint(target: number) {
      if (!context) return
      drawFrame(context, target)
      if (canvas.current) canvas.current.dataset.frame = String(target)
    }

    function finish() {
      window.clearInterval(timer)
      if (animate) paint(finalFrame)
    }

    paint(animate && motion.matches ? finalFrame : 0)
    if (animate && !motion.matches) {
      timer = window.setInterval(() => {
        paint(++frame)
        if (frame === finalFrame) window.clearInterval(timer)
      }, 100)
      motion.addEventListener('change', finish)
    }
    return () => {
      window.clearInterval(timer)
      motion.removeEventListener('change', finish)
    }
  }, [animate])

  return <canvas className="ons-ticket-art" width={width} height={height} ref={canvas} aria-hidden="true" />
}
