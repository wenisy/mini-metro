import './style.css'

// Basic game bootstrap: DPR-aware canvas, fixed timestep loop, pointer input stub

type Vec2 = { x: number; y: number }

function setupCanvas(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1))
  function resize() {
    const { clientWidth, clientHeight } = canvas
    canvas.width = Math.floor(clientWidth * dpr)
    canvas.height = Math.floor(clientHeight * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  const ro = new ResizeObserver(resize)
  ro.observe(canvas)
  resize()
  return { ctx, dpr }
}

function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)) }

class Camera {
  pos: Vec2 = { x: 0, y: 0 }
  scale = 1
  toScreen(p: Vec2): Vec2 { return { x: (p.x - this.pos.x) * this.scale, y: (p.y - this.pos.y) * this.scale } }
  toWorld(p: Vec2): Vec2 { return { x: p.x / this.scale + this.pos.x, y: p.y / this.scale + this.pos.y } }
}

// Game state stubs
interface Station { id: number; pos: Vec2; shape: 'circle'|'triangle'|'square'; queue: number }
interface Line { id: number; color: string; stations: number[] }
interface Train { id: number; lineId: number; atIndex: number; t: number; capacity: number; passengers: number }

const state = {
  time: 0,
  stations: [] as Station[],
  lines: [] as Line[],
  trains: [] as Train[],
}

let nextId = 1
function addStation(pos: Vec2, shape: Station['shape']): Station {
  const s: Station = { id: nextId++, pos, shape, queue: 0 }
  state.stations.push(s); return s
}

function addLine(color: string, a: Station, b: Station): Line {
  const l: Line = { id: nextId++, color, stations: [a.id, b.id] }
  state.lines.push(l)
  // add one train for line
  state.trains.push({ id: nextId++, lineId: l.id, atIndex: 0, t: 0, capacity: 6, passengers: 0 })
  return l
}

function spawnInitialWorld() {
  const s1 = addStation({ x: 100, y: 100 }, 'circle')
  const s2 = addStation({ x: 300, y: 120 }, 'triangle')
  const s3 = addStation({ x: 200, y: 260 }, 'square')
  addLine('#e74c3c', s1, s2)
  addLine('#3498db', s2, s3)
}

function drawStation(ctx: CanvasRenderingContext2D, s: Station) {
  ctx.save()
  ctx.translate(s.pos.x, s.pos.y)
  ctx.lineWidth = 2
  ctx.strokeStyle = '#fff'
  ctx.fillStyle = '#111'
  switch (s.shape) {
    case 'circle': ctx.beginPath(); ctx.arc(0,0,10,0,Math.PI*2); ctx.fill(); ctx.stroke(); break
    case 'triangle': ctx.beginPath(); ctx.moveTo(0,-12); ctx.lineTo(10,8); ctx.lineTo(-10,8); ctx.closePath(); ctx.fill(); ctx.stroke(); break
    case 'square': ctx.beginPath(); ctx.rect(-10,-10,20,20); ctx.fill(); ctx.stroke(); break
  }
  if (s.queue > 0) {
    ctx.fillStyle = '#fff'; ctx.font = '12px system-ui'; ctx.fillText(String(s.queue), 12, -12)
  }
  ctx.restore()
}

function drawLine(ctx: CanvasRenderingContext2D, line: Line) {
  const pts = line.stations.map(id => state.stations.find(s=>s.id===id)!.pos)
  ctx.save()
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'
  ctx.strokeStyle = line.color; ctx.lineWidth = 6
  ctx.beginPath()
  pts.forEach((p,i)=> i? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y))
  ctx.stroke()
  ctx.restore()
}

function drawTrain(ctx: CanvasRenderingContext2D, t: Train) {
  const line = state.lines.find(l=>l.id===t.lineId)!;
  const a = state.stations.find(s=>s.id===line.stations[t.atIndex])!.pos
  const b = state.stations.find(s=>s.id===line.stations[(t.atIndex+1)%line.stations.length])!.pos
  const x = a.x + (b.x-a.x)*t.t
  const y = a.y + (b.y-a.y)*t.t
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x,y,5,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

function update(dt: number) {
  state.time += dt
  // spawn passengers as station queue (simplified)
  if (Math.random() < dt * 0.5) {
    const s = state.stations[Math.floor(Math.random()*state.stations.length)]
    s.queue = clamp(s.queue + 1, 0, 99)
  }
  // trains move and service
  for (const t of state.trains) {
    t.t += dt * 0.2
    if (t.t >= 1) { t.t = 0; t.atIndex = (t.atIndex + 1) % state.lines.find(l=>l.id===t.lineId)!.stations.length
      // service station
      const sid = state.lines.find(l=>l.id===t.lineId)!.stations[t.atIndex]
      const s = state.stations.find(s=>s.id===sid)!;
      const toLoad = Math.min(s.queue, t.capacity - t.passengers)
      s.queue -= toLoad; t.passengers += toLoad
      // randomly drop some passengers at station (simplified)
      const drop = Math.min(t.passengers, Math.floor(Math.random()*3))
      t.passengers -= drop
    }
  }
}

function render(ctx: CanvasRenderingContext2D, camera: Camera, canvas: HTMLCanvasElement) {
  ctx.save()
  ctx.setTransform(camera.scale, 0, 0, camera.scale, -camera.pos.x*camera.scale, -camera.pos.y*camera.scale)
  // clear
  ctx.fillStyle = '#111'; ctx.fillRect(camera.pos.x, camera.pos.y, canvas.width/camera.scale, canvas.height/camera.scale)
  // draw lines then stations then trains
  state.lines.forEach(l=>drawLine(ctx,l))
  state.stations.forEach(s=>drawStation(ctx,s))
  state.trains.forEach(t=>drawTrain(ctx,t))
  ctx.restore()
}

function setupInput(canvas: HTMLCanvasElement, camera: Camera) {
  let isDragging = false
  let last: Vec2 | null = null
  canvas.addEventListener('pointerdown', (e)=>{
    canvas.setPointerCapture(e.pointerId)
    isDragging = true
    last = { x: e.clientX, y: e.clientY }
  })
  canvas.addEventListener('pointermove', (e)=>{
    if (!isDragging || !last) return
    const dx = e.clientX - last.x
    const dy = e.clientY - last.y
    camera.pos.x -= dx / camera.scale
    camera.pos.y -= dy / camera.scale
    last = { x: e.clientX, y: e.clientY }
  })
  canvas.addEventListener('pointerup', () => {
    isDragging = false; last = null
  })
  canvas.addEventListener('wheel', (e)=>{
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.1 : 0.9
    const mouse: Vec2 = { x: e.clientX, y: e.clientY }
    const worldBefore = camera.toWorld(mouse)
    camera.scale = clamp(camera.scale * factor, 0.5, 3)
    const worldAfter = camera.toWorld(mouse)
    camera.pos.x += worldBefore.x - worldAfter.x
    camera.pos.y += worldBefore.y - worldAfter.y
  }, { passive: false })
}

function main() {
  const canvas = document.getElementById('game') as HTMLCanvasElement
  const hud = document.getElementById('hud') as HTMLDivElement
  const { ctx } = setupCanvas(canvas)
  const camera = new Camera()
  setupInput(canvas, camera)
  spawnInitialWorld()

  // loop with fixed timestep
  let last = performance.now()
  let acc = 0
  const step = 1/30 // 30Hz logic
  function frame(now: number) {
    const dt = (now - last) / 1000; last = now; acc += Math.min(dt, 0.1)
    while (acc >= step) { update(step); acc -= step }
    render(ctx, camera, canvas)
    hud.textContent = `t=${state.time.toFixed(1)} s | stations=${state.stations.length} | trains=${state.trains.length}`
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

main()
