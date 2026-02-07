import { useEffect, useRef, useState } from 'react'

export default function Whiteboard({ onClose, initialImage }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const [tool, setTool] = useState('pen') // 'pen' | 'eraser'
  const [lineWidth, setLineWidth] = useState(4)
  const drawingRef = useRef(false)
  const lastRef = useRef({ x: 0, y: 0 })
  const historyRef = useRef([])
  const [historyLen, setHistoryLen] = useState(0)
  const MAX_HISTORY = 50

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      canvas.width = Math.max(300, rect.width * dpr)
      canvas.height = Math.max(150, rect.height * dpr)
      const ctx = canvas.getContext('2d')
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(dpr, dpr)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      // If an initial image is provided, draw it onto the canvas
      try {
        if (initialImage) {
          const img = new Image()
          img.onload = () => {
            const ctx = canvas.getContext('2d')
            const dpr = window.devicePixelRatio || 1
            ctx.setTransform(1, 0, 0, 1, 0, 0)
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
            ctx.setTransform(1, 0, 0, 1, 0, 0)
            ctx.scale(dpr, dpr)
            pushHistory()
          }
          img.src = initialImage
          return
        }
      } catch (e) {}

      // push initial blank snapshot after sizing
      pushHistory()
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  function pushHistory() {
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      const data = canvas.toDataURL()
      const h = historyRef.current
      if (h.length && h[h.length - 1] === data) return
      h.push(data)
      if (h.length > MAX_HISTORY) h.shift()
      setHistoryLen(h.length)
    } catch (e) {
      console.warn('pushHistory failed', e)
    }
  }

  function undo() {
    const h = historyRef.current
    if (h.length <= 1) return
    h.pop()
    const last = h[h.length - 1]
    const img = new Image()
    img.onload = () => {
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      // draw at pixel size: reset transform, draw, then restore scale
      const dpr = window.devicePixelRatio || 1
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(dpr, dpr)
      setHistoryLen(h.length)
    }
    img.src = last
  }

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function getPos(e) {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const isTouch = e.touches && e.touches[0]
    const clientX = isTouch ? e.touches[0].clientX : e.clientX
    const clientY = isTouch ? e.touches[0].clientY : e.clientY
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  function startDraw(e) {
    drawingRef.current = true
    const p = getPos(e)
    lastRef.current = p
    drawLine(p, p)
    e.preventDefault()
  }

  function endDraw(e) {
    drawingRef.current = false
    e.preventDefault()
    // record history snapshot after completing a stroke
    pushHistory()
  }

  function draw(e) {
    if (!drawingRef.current) return
    const p = getPos(e)
    drawLine(lastRef.current, p)
    lastRef.current = p
    e.preventDefault()
  }

  function drawLine(a, b) {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.save()
    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.strokeStyle = 'rgba(0,0,0,1)'
    } else {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = '#000'
    }
    ctx.lineWidth = lineWidth
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
    ctx.restore()
  }

  function clearCanvas() {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    // save cleared state to history
    pushHistory()
  }

  function handleClose() {
    try {
      const canvas = canvasRef.current
      if (canvas && onClose) {
        // Ensure exported image has a white background (avoid transparency)
        const exportCanvas = document.createElement('canvas')
        exportCanvas.width = canvas.width
        exportCanvas.height = canvas.height
        const exCtx = exportCanvas.getContext('2d')
        // Fill with white
        exCtx.fillStyle = '#ffffff'
        exCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height)
        // Draw original canvas on top
        exCtx.drawImage(canvas, 0, 0)
        const data = exportCanvas.toDataURL('image/png')
        onClose(data)
        return
      }
    } catch (e) {
      console.warn('whiteboard export failed', e)
    }
    if (onClose) onClose()
  }

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative bg-slate-100 dark:bg-slate-900 rounded shadow-lg w-[90%] max-w-4xl h-[70%] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-2 bg-slate-200 dark:bg-slate-800">
          <div className="flex items-center gap-2">
            <button onClick={() => setTool('pen')} className={`px-3 py-1 rounded ${tool === 'pen' ? 'bg-primary text-black' : 'bg-slate-300'}`}>Pen</button>
            <button onClick={() => setTool('eraser')} className={`px-3 py-1 rounded ${tool === 'eraser' ? 'bg-pink-500 text-white' : 'bg-pink-300 text-black'}`}>Eraser</button>
            <button onClick={undo} disabled={historyLen <= 1} className="px-3 py-1 rounded bg-blue-500 text-white disabled:opacity-50">Undo</button>
            <button onClick={clearCanvas} className="px-3 py-1 rounded bg-rose-500 text-white">Clear</button>
            <div className="flex items-center gap-1 ml-3">
              <label className="text-sm text-slate-600">Size</label>
              <input type="range" min="1" max="20" value={lineWidth} onChange={(e) => setLineWidth(Number(e.target.value))} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleClose} aria-label="Close" className="px-3 py-1 rounded bg-slate-300">X</button>
          </div>
        </div>

        <div className="flex-1 p-2">
          <canvas
            ref={canvasRef}
            className="w-full h-full bg-white touch-none"
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={endDraw}
          />
        </div>
      </div>
    </div>
  )
}
