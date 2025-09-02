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
function dist2(a: Vec2, b: Vec2) { const dx=a.x-b.x, dy=a.y-b.y; return dx*dx+dy*dy }

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

// interaction state for line drawing
const interaction = {
  drawingFrom: null as Station | null,
  previewTo: null as Vec2 | null,
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

function maybeEnsureBaselineLine() {
  if (state.lines.length === 0 && state.stations.length >= 2) {
    // connect the nearest pair
    let bestI = 0, bestJ = 1, bestD = Infinity
    for (let i=0;i<state.stations.length;i++)
      for (let j=i+1;j<state.stations.length;j++) {
        const d = dist2(state.stations[i].pos, state.stations[j].pos)
        if (d < bestD) { bestD = d; bestI = i; bestJ = j }
      }
    const a = state.stations[bestI]
    const b = state.stations[bestJ]
    addLine('#e74c3c', a, b)
  }
}


function spawnInitialWorld() {
  // seed stations
  addStation({ x: 120, y: 120 }, 'circle')
  addStation({ x: 320, y: 140 }, 'triangle')
  addStation({ x: 220, y: 280 }, 'square')
}

// simple RNG station spawner with min distance avoidance
let spawnTimer = 0
function hitTestStation(p: Vec2): Station | null {
  const r = 14
  let best: Station | null = null
  let bestD = Infinity
  for (const s of state.stations) {
    const d = dist2(s.pos, p)
    if (d < r*r && d < bestD) { bestD = d; best = s }
  }
  return best
}
function maybeSpawnStations(dt: number) {
  spawnTimer += dt
  const interval = clamp(3 - state.time*0.02, 1, 3) // faster over time
  if (spawnTimer >= interval) {
    spawnTimer = 0
    for (let tries=0; tries<20; tries++) {
      const pos = { x: 80 + Math.random()*440, y: 80 + Math.random()*640 }
      const shapes: Station['shape'][] = ['circle','triangle','square']
      const shape = shapes[Math.floor(Math.random()*shapes.length)]
      const minR = 40
      if (state.stations.every(s=> dist2(s.pos, pos) >= minR*minR)) {
        addStation(pos, shape)
        break
      }
    }
  }
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
  // show passengers in train as small bar
  if (t.passengers>0) { ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(x-6,y+7, Math.min(12, t.passengers*2), 2) }
  ctx.restore();
}

function update(dt: number) {
  state.time += dt
  maybeSpawnStations(dt)
  maybeEnsureBaselineLine()
  // spawn passengers as station queue (simplified)
  if (state.stations.length && Math.random() < dt * (0.2 + state.time*0.02)) {
    const s = state.stations[Math.floor(Math.random()*state.stations.length)]
    s.queue = clamp(s.queue + 1, 0, 99)
  }
  // trains move and service
  for (const t of state.trains) {
    t.t += dt * 0.25
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
  // preview line if drawing
  if (interaction.drawingFrom && interaction.previewTo) {
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = '#aaa'; ctx.lineWidth = 4
    ctx.beginPath();
    const a = interaction.drawingFrom.pos
    ctx.moveTo(a.x, a.y)
    const b = interaction.previewTo
    ctx.lineTo(b.x, b.y)
    ctx.stroke();
    ctx.restore();
  }
  state.stations.forEach(s=>drawStation(ctx,s))
  state.trains.forEach(t=>drawTrain(ctx,t))
  ctx.restore()
}

function setupInput(canvas: HTMLCanvasElement, camera: Camera) {
  let isPanning = false
  let pinchDist0 = 0
  let pointers: Map<number, Vec2> = new Map()

  function onPointerDown(e: PointerEvent) {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    canvas.setPointerCapture(e.pointerId)
    if (pointers.size === 1) {
      // check if pressing on a station to start drawing a line
      const world = camera.toWorld({ x: e.clientX, y: e.clientY })
      const s = hitTestStation(world)
      if (s) { interaction.drawingFrom = s; interaction.previewTo = { ...s.pos }; isPanning = false; return }
      isPanning = true
    }
  }
  function onPointerMove(e: PointerEvent) {
    const prev = pointers.get(e.pointerId)
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.size === 1) {
      if (interaction.drawingFrom) {
        // update preview
        interaction.previewTo = camera.toWorld({ x: e.clientX, y: e.clientY })
      } else if (isPanning && prev) {
        const dx = e.clientX - prev.x
        const dy = e.clientY - prev.y
        camera.pos.x -= dx / camera.scale
        camera.pos.y -= dy / camera.scale
      }
    } else if (pointers.size === 2) {
      const [a,b] = [...pointers.values()]
      const d = Math.hypot(a.x-b.x, a.y-b.y)
      if (pinchDist0 === 0) pinchDist0 = d
      const factor = d / pinchDist0
      const center = { x: (a.x+b.x)/2, y: (a.y+b.y)/2 }
      const worldBefore = camera.toWorld(center)
      camera.scale = clamp(camera.scale * factor, 0.5, 3)
      const worldAfter = camera.toWorld(center)
      camera.pos.x += worldBefore.x - worldAfter.x
      camera.pos.y += worldBefore.y - worldAfter.y
      pinchDist0 = d
    }
  }
  function onPointerUp(e: PointerEvent) {
    // finish drawing if released on a station
    if (interaction.drawingFrom) {
      const world = camera.toWorld({ x: e.clientX, y: e.clientY })
      const target = hitTestStation(world)
      if (target && target.id !== interaction.drawingFrom.id) {
        addLine('#3498db', interaction.drawingFrom, target)
      }
      interaction.drawingFrom = null
      interaction.previewTo = null
    }
    pointers.delete(e.pointerId)
    if (pointers.size < 2) pinchDist0 = 0
    if (pointers.size === 0) { isPanning = false }
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)

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
