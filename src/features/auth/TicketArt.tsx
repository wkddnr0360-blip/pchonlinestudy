import { useEffect, useRef } from 'react'

const width = 112
const height = 64
const finalFrame = 11
const palette = {
  ink: '#653725', copper: '#a35c2d', rim: '#d18b42', amber: '#eda74a', gold: '#ffd370',
  pale: '#ffe5a0', shine: '#fff1bf', deep: '#945052', purple: '#9272bb', lavender: '#d8b7ed',
  leaf: '#247259', lightLeaf: '#6cb18a',
}

function drawFrame(context: CanvasRenderingContext2D, frame: number) {
  context.clearRect(0, 0, width, height)

  function px(color: string, x: number, y: number, w: number, h: number) {
    context.fillStyle = color
    context.fillRect(x, y, w, h)
  }

  function sparkle(x: number, y: number, size: number, color: string) {
    const center = Math.floor(size / 2)
    px(color, x + center, y, 1, size)
    px(color, x, y + center, size, 1)
    if (size >= 7) {
      px(color, x + center - 1, y + center - 1, 3, 3)
      px(palette.shine, x + center, y + center, 1, 1)
    }
  }

  function ticket(x: number, y: number, w: number, left: boolean, right: boolean, highlight = false) {
    px('#9b632e38', x + 4, y + 33, w - 7, 4)
    px(palette.ink, x + 4, y, w - 8, 34)
    px(palette.ink, x + 2, y + 2, w - 4, 30)
    px(palette.ink, x, y + 4, w, 26)
    px(palette.copper, x + 2, y + 4, w - 4, 26)
    px(palette.rim, x + 3, y + 3, w - 6, 26)
    px(highlight ? palette.pale : palette.gold, x + 4, y + 4, w - 8, 23)
    px(palette.pale, x + 6, y + 4, w - 12, 4)
    if (w >= 15) px(palette.shine, x + 7, y + 5, w - 14, 1)
    px(palette.amber, x + 5, y + 25, w - 10, 3)
    px(palette.copper, x + 6, y + 30, w - 12, 1)
    for (let inset = 8; inset < w - 6; inset += 4) {
      px(palette.amber, x + inset, y + 9, 2, 1)
      px(palette.rim, x + inset, y + 24, 2, 1)
    }
    if (left) {
      context.clearRect(x, y + 12, 3, 11)
      context.clearRect(x + 3, y + 14, 3, 7)
      px(palette.ink, x + 5, y + 14, 1, 7)
    }
    if (right) {
      context.clearRect(x + w - 3, y + 12, 3, 11)
      context.clearRect(x + w - 6, y + 14, 3, 7)
      px(palette.ink, x + w - 6, y + 14, 1, 7)
    }
  }

  function book(x: number, y: number) {
    px(palette.ink, x + 1, y, 17, 13)
    px(palette.ink, x, y + 2, 19, 10)
    px(palette.deep, x + 2, y + 1, 15, 10)
    px(palette.copper, x + 3, y + 2, 13, 6)
    px(palette.shine, x + 3, y + 10, 13, 2)
    px(palette.rim, x + 4, y + 2, 2, 7)
    sparkle(x + 8, y + 3, 5, palette.pale)
    px(palette.ink, x + 13, y + 8, 2, 3)
  }

  function seal(x: number, y: number) {
    px(palette.copper, x + 4, y, 15, 23)
    px(palette.copper, x, y + 4, 23, 15)
    px(palette.copper, x + 2, y + 2, 19, 19)
    px(palette.shine, x + 4, y + 3, 15, 17)
    px(palette.shine, x + 3, y + 4, 17, 15)
    const check = [[0, 2], [1, 3], [2, 4], [3, 3], [4, 2], [5, 1], [6, 0]]
    for (const [column, row] of check) px(palette.leaf, x + 5 + column * 2, y + 6 + row * 2, 2, 4)
    px(palette.lightLeaf, x + 17, y + 6, 1, 2)
  }

  if (frame < 6) {
    const y = [16, 15, 14, 14, 17, 16][frame]
    ticket(15, y, 82, true, true, frame === 4)
    for (let row = y + 5; row < y + 30; row += 4) px(palette.copper, 73, row, 2, 2)
    px(palette.shine, 80, y + 13, 8, 2)
    px(palette.amber, 80, y + 18, 7, 2)
    if (frame < 4) {
      book(28, y + 10)
      px(palette.copper, 53, y + 13, 12, 2)
      px(palette.rim, 53, y + 18, 9, 1)
    } else {
      seal(33, y + 5)
    }
    if (frame > 0) sparkle(94, 8 + frame, frame === 4 ? 11 : 7, frame === 4 ? palette.amber : palette.purple)
    if (frame >= 3) sparkle(8, 36 - frame, 7, palette.lavender)
    return
  }

  const offset = frame - 6
  const resting = frame >= 10
  const left = resting ? 24 : 14 + offset * 2
  ticket(left, 16 + (frame === 6 ? 1 : 0), 62, true, resting)
  seal(left + 15, 21)
  if (frame < 9) ticket(77 + offset * 4, 14 - offset * 2, 21 - offset * 4, false, true)
  if (frame < 10) {
    sparkle(93 - offset * 3, 7 + offset, 11 - offset * 2, palette.amber)
    px(palette.copper, 99 + offset * 2, 37 + offset, 3, 3)
    px(palette.gold, 91, 42 + offset * 2, 3, 2)
    px(palette.purple, 86 + offset * 3, 55 - offset, 2, 2)
  }
  sparkle(16 + offset, 8, frame === finalFrame ? 7 : 9, palette.purple)
  sparkle(88, 47 + offset % 3, 7, palette.rim)
  sparkle(48, 5 + offset % 3, 5, palette.shine)
  px(palette.lavender, 9 + offset, 45, 2, 2)
}

export function TicketArt({ animate = false }: { animate?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const target = canvas.current
    const context = target?.getContext('2d')
    if (!target || !context) return
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let timer: number | undefined
    let frame = 0

    function paint(next: number) {
      if (!target || !context) return
      drawFrame(context, next)
      target.dataset.frame = String(next)
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
      }, 80)
      motion.addEventListener('change', finish)
    }
    return () => {
      window.clearInterval(timer)
      motion.removeEventListener('change', finish)
    }
  }, [animate])

  return <canvas className="ons-ticket-art" width={width} height={height} ref={canvas} aria-hidden="true" />
}
