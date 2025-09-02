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

function pointerPos(e: { clientX: number; clientY: number }, canvas: HTMLCanvasElement): Vec2 {
  const r = canvas.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}

// Game state stubs
type Shape = 'circle'|'triangle'|'square'
function zeroByShape(): Record<Shape, number> { return { circle: 0, triangle: 0, square: 0 } }
interface Station { id: number; pos: Vec2; shape: Shape; queueBy: Record<Shape, number>; queueTo: Record<number, Record<Shape, number>> }
interface Line { id: number; name: string; color: string; stations: number[] }
interface Train { id: number; lineId: number; atIndex: number; t: number; dir: 1|-1; capacity: number; passengersBy: Record<Shape, number>; passengersTo: Record<number, Record<Shape, number>>; dwell: number }

const state = {
  time: 0,
  stations: [] as Station[],
  lines: [] as Line[],
  trains: [] as Train[],
  autoSpawnEnabled: false,
  spawnOnConnect: false,
  gameOver: false,
  currentLineId: null as number | null,
  nextLineNum: 1,
  showLinkChooser: false,
  linkChooserFrom: null as Station | null,
  linkChooserTo: null as Station | null,
}

const COLORS = ['#e74c3c','#3498db','#2ecc71','#f1c40f','#9b59b6','#e67e22']



const DWELL_TIME = 0.8
const QUEUE_FAIL = 12
function total(rec: Record<Shape, number>) { return rec.circle + rec.triangle + rec.square }

// interaction state for line drawing
const interaction = {
  drawingFrom: null as Station | null,
  previewTo: null as Vec2 | null,
  selectedLine: null as Line | null,
}

let nextId = 1
function addStation(pos: Vec2, shape: Station['shape']): Station {
  const s: Station = { id: nextId++, pos, shape, queueBy: zeroByShape(), queueTo: {} }
  state.stations.push(s); return s
}

function addLine(color: string, a: Station, b: Station, name?: string): Line {
  const lineName = name ?? `${state.nextLineNum++}号线`
  const l: Line = { id: nextId++, name: lineName, color, stations: [a.id, b.id] }
  state.lines.push(l)
  // add one train for line by default
  state.trains.push({ id: nextId++, lineId: l.id, atIndex: 0, t: 0, dir: 1, capacity: 6, passengersBy: zeroByShape(), passengersTo: {}, dwell: 0 })

  // Don't update UI immediately - let caller handle it
  // renderLinesPanel()

  return l
}


function findLineBetween(aId: number, bId: number): Line | null {
  for (const l of state.lines) {
    if (l.stations.length === 2) {
      const [x,y] = l.stations
      if ((x===aId && y===bId) || (x===bId && y===aId)) return l
    }
  }
  return null
}

function removeLine(lineId: number) {
  const idx = state.lines.findIndex(l=>l.id===lineId)
  if (idx>=0) state.lines.splice(idx,1)
  // remove trains on that line
  state.trains = state.trains.filter(t=>t.lineId!==lineId)

  // If all lines are removed, reset line numbering
  if (state.lines.length === 0) {
    state.nextLineNum = 1
  }

  // Update UI immediately
  renderLinesPanel()
}

function toggleLine(color: string, a: Station, b: Station): 'added'|'removed'|'noop' {
  const existing = findLineBetween(a.id, b.id)
  if (existing) { removeLine(existing.id); return 'removed' }
  addLine(color, a, b); return 'added'
}

function maybeEnsureBaselineLine() {
  // No longer needed since we create initial line in spawnInitialWorld
}


function spawnInitialWorld() {
  // seed stations
  const s1 = addStation({ x: 120, y: 120 }, 'circle')
  const s2 = addStation({ x: 320, y: 140 }, 'triangle')
  addStation({ x: 220, y: 280 }, 'square')
  // create initial line (1号线)
  const firstLine = addLine(COLORS[0], s1, s2, '1号线')
  state.currentLineId = firstLine.id
}
function showLinkChooser(from: Station, to: Station) {
  state.showLinkChooser = true
  state.linkChooserFrom = from
  state.linkChooserTo = to

  const chooser = document.getElementById('link-chooser') as HTMLDivElement
  const text = document.getElementById('link-chooser-text') as HTMLDivElement
  const buttons = document.getElementById('link-chooser-buttons') as HTMLDivElement

  if (!chooser || !text || !buttons) return

  const existing = findLineBetween(from.id, to.id)

  if (existing) {
    text.textContent = `${from.shape} ↔ ${to.shape} 已连接`
    buttons.innerHTML = `<button id="remove-line">删除连接</button>`
  } else {
    text.textContent = `连接 ${from.shape} → ${to.shape}`
    let html = ''

    if (state.currentLineId && state.lines.find(l => l.id === state.currentLineId)) {
      const currentLine = state.lines.find(l => l.id === state.currentLineId)!
      html += `<button id="extend-current">延长 ${currentLine.name}</button>`
    }

    html += `<button id="new-line">新建线路</button>`
    buttons.innerHTML = html
  }

  chooser.style.display = 'block'

  // Add event listeners
  const removeBtn = document.getElementById('remove-line')
  const extendBtn = document.getElementById('extend-current')
  const newBtn = document.getElementById('new-line')

  if (removeBtn) {
    removeBtn.onclick = () => {
      if (existing) removeLine(existing.id)
      hideLinkChooser()
    }
  }

  if (extendBtn) {
    extendBtn.onclick = () => {
      if (state.currentLineId) {
        const currentLine = state.lines.find(l => l.id === state.currentLineId)!
        // Extend current line by adding the new station
        if (!currentLine.stations.includes(to.id)) {
          currentLine.stations.push(to.id)
          renderLinesPanel()
        }
      }
      hideLinkChooser()
    }
  }

  if (newBtn) {
    newBtn.onclick = () => {
      const color = COLORS[(state.nextLineNum-1) % COLORS.length]
      const newLine = addLine(color, from, to)
      state.currentLineId = newLine.id
      hideLinkChooser()
    }
  }
}

function hideLinkChooser() {
  state.showLinkChooser = false
  state.linkChooserFrom = null
  state.linkChooserTo = null
  const chooser = document.getElementById('link-chooser') as HTMLDivElement
  if (chooser) chooser.style.display = 'none'
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
  if (!state.autoSpawnEnabled) return
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

function nearestStationWithin(p: Vec2, radius: number): Station | null {
  let best: Station | null = null
  let bestD = radius*radius
  for (const s of state.stations) {
    const d = dist2(s.pos, p)
    if (d <= bestD) { bestD = d; best = s }
  }
  return best
}



// Global function to render lines panel - can be called from anywhere
function renderLinesPanel() {
  console.log('renderLinesPanel 被调用，当前线路数量:', state.lines.length)
  const linesList = document.getElementById('lines-list') as HTMLDivElement
  if (!linesList) {
    console.log('linesList 元素未找到')
    return
  }
  const html = state.lines.map(l=>`<div style="display:flex;align-items:center;gap:6px;margin:2px 0">
    <span style="display:inline-block;width:10px;height:10px;background:${l.color};border-radius:2px"></span>
    <button data-line="${l.id}" class="line-select" style="font-size:12px">${l.name}</button>
    <small style="opacity:.7">${l.color}</small>
  </div>`).join('')
  console.log('生成的HTML:', html)
  linesList.innerHTML = html
  linesList.querySelectorAll('button.line-select').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = Number((btn as HTMLButtonElement).dataset.line)
      state.currentLineId = id
      console.log('选中线路:', id)
    })
  })
  console.log('renderLinesPanel 完成')
}

// function optimizeTrainPath(line: Line) {
//   // Find the two farthest stations for optimal train routing
//   const stations = line.stations.map(id => state.stations.find(s => s.id === id)!)
//   if (stations.length < 2) return
//
//   let maxDist = 0
//   let bestStart = 0
//   let bestEnd = 1
//
//   for (let i = 0; i < stations.length; i++) {
//     for (let j = i + 1; j < stations.length; j++) {
//       const dist = dist2(stations[i].pos, stations[j].pos)
//       if (dist > maxDist) {
//         maxDist = dist
//         bestStart = i
//         bestEnd = j
//       }
//     }
//   }
//
//   // Reorder stations to start from farthest pair
//   const reordered = [...line.stations]
//   const temp = reordered[0]
//   reordered[0] = reordered[bestStart]
//   reordered[bestStart] = temp
//
//   // Find optimal end position
//   const endIndex = reordered.indexOf(line.stations[bestEnd])
//   if (endIndex !== reordered.length - 1) {
//     const temp = reordered[reordered.length - 1]
//     reordered[reordered.length - 1] = reordered[endIndex]
//     reordered[endIndex] = temp
//   }
//
//   line.stations = reordered
//
//   // Update UI after path optimization
//   renderLinesPanel()
// }


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
  const totalQ = total(s.queueBy)
  if (totalQ > 0) {
    ctx.fillStyle = '#fff'; ctx.font = '12px system-ui'; ctx.fillText(String(totalQ), 12, -12)
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
  const totalP = t.passengersBy.circle + t.passengersBy.triangle + t.passengersBy.square
  if (totalP>0) { ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(x-6,y+7, Math.min(12, totalP*2), 2) }
  // dwell indicator
  if (t.dwell > 0) { ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(x-6,y+10, 12*(t.dwell/0.8), 2) }
  ctx.restore();
}

function update(dt: number) {
  state.time += dt
  maybeSpawnStations(dt)
  maybeEnsureBaselineLine()
  // spawn passenger with concrete destination
  if (state.stations.length && Math.random() < dt * (0.2 + state.time*0.02)) {
    const from = state.stations[Math.floor(Math.random()*state.stations.length)]
    // choose a target station with different shape; prefer connected/reachable later
    const candidates = state.stations.filter(st => st.id!==from.id && st.shape!==from.shape)
    if (candidates.length) {
      const to = candidates[Math.floor(Math.random()*candidates.length)]
      const targetShape: Shape = to.shape
      from.queueBy[targetShape] = Math.min(99, from.queueBy[targetShape] + 1)
      from.queueTo[to.id] = from.queueTo[to.id] || zeroByShape()
      from.queueTo[to.id][targetShape] = Math.min(99, (from.queueTo[to.id][targetShape]||0) + 1)
      if (total(from.queueBy) >= QUEUE_FAIL) state.gameOver = true
    }
  }
  // trains move and service
  for (const t of state.trains) {
    const line = state.lines.find(l=>l.id===t.lineId)!;
    // handle dwell at stops
    if (t.dwell > 0) { t.dwell = Math.max(0, t.dwell - dt); continue }

    t.t += dt * 0.25
    if (t.t >= 1) {
      t.t = 0
      // advance along line with direction; reverse at ends (longest traversal)
      const last = line.stations.length - 1
      if (t.dir > 0 && t.atIndex >= last-1) t.dir = -1
      else if (t.dir < 0 && t.atIndex <= 0) t.dir = 1
      t.atIndex = clamp(t.atIndex + (t.dir>0? 1: -1), 0, last-1)

      // service station: unload/load
      const sid = line.stations[t.atIndex]
      const s = state.stations.find(st=>st.id===sid)!;
      // unload matching
      t.passengersBy[s.shape] = 0
      // dwell start
      t.dwell = Math.max(t.dwell, DWELL_TIME)
      // load by capacity left — prefer passengers whose destination is along this line direction (future: real routing)
      let capacityLeft = t.capacity - (t.passengersBy.circle + t.passengersBy.triangle + t.passengersBy.square)
      const order: Shape[] = ['circle','triangle','square']
      for (const sh of order) {
        if (capacityLeft <= 0) break
        // if per-destination exists, drain from any destination bucket for this shape
        let remain = capacityLeft
        for (const destIdStr of Object.keys(s.queueTo)) {
          if (remain<=0) break
          const destId = Number(destIdStr)
          const perDest = s.queueTo[destId]
          const have = perDest?.[sh] || 0
          if (have>0) {
            const take = Math.min(have, remain)
            perDest[sh] -= take
            s.queueBy[sh] -= take
            // add into train passengersTo
            t.passengersTo[destId] = t.passengersTo[destId] || zeroByShape()
            t.passengersTo[destId][sh] = (t.passengersTo[destId][sh]||0) + take
            t.passengersBy[sh] += take
            remain -= take
          }
        }
        capacityLeft = remain
      }
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
    e.preventDefault()
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    canvas.setPointerCapture(e.pointerId)
    if (pointers.size === 1) {
      const screen = pointerPos(e, canvas)
      const world = camera.toWorld(screen)
      const s = hitTestStation(world)
      if (interaction.drawingFrom) {
        // Second tap: show link chooser
        const target = s ?? nearestStationWithin(world, 20)
        if (target && target.id !== interaction.drawingFrom.id) {
          showLinkChooser(interaction.drawingFrom, target)
        }
        interaction.drawingFrom = null
        interaction.previewTo = null
        return
      } else {
        if (s) {
          // First tap: start drawing from station
          interaction.drawingFrom = s
          interaction.previewTo = { ...s.pos }
          isPanning = false
          return
        } else if (!s) {
          // Start panning if not tapping a station
          // If previously in drawing mode, a blank tap cancels
          if (interaction.drawingFrom) {
            interaction.drawingFrom = null
            interaction.previewTo = null
            interaction.selectedLine = null // Reset selected line on cancel
            hideLinkChooser()
          }
          isPanning = true
        }
      }
    }
  }
  function onPointerMove(e: PointerEvent) {
    const prev = pointers.get(e.pointerId)
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.size === 1) {
      if (interaction.drawingFrom) {
        // update preview (snap preview to nearest station within 20px)
        const screen = pointerPos(e, canvas)
        const world = camera.toWorld(screen)
        const snapped = nearestStationWithin(world, 20)
        interaction.previewTo = snapped ? { ...snapped.pos } : world
  // HUD actions: +Train / Capacity +1 / Lines list and New Line
  const btnAddTrain = document.getElementById('btn-add-train') as HTMLButtonElement
  const btnCap = document.getElementById('btn-capacity') as HTMLButtonElement
  const btnNewLine = document.getElementById('btn-new-line') as HTMLButtonElement
  if (btnAddTrain) btnAddTrain.onclick = ()=>{
    if (state.currentLineId==null) return
    state.trains.push({ id: nextId++, lineId: state.currentLineId, atIndex: 0, t: 0, dir: 1, capacity: 6, passengersBy: zeroByShape(), passengersTo: {}, dwell: 0 })
  }
  if (btnCap) btnCap.onclick = ()=>{
    if (state.currentLineId==null) return
    state.trains.filter(t=>t.lineId===state.currentLineId).forEach(t=> t.capacity += 1)
  }
  if (btnNewLine) btnNewLine.onclick = ()=>{
    // 创建一条新线（默认取最近的两个站点连接，或等待下一次A→B选择使用新线）
    state.currentLineId = null
    // 下次点A→点B时如果选择“新线”，就用新的颜色
    // 简化：立即创建基于最近站点对的新线
    if (state.stations.length>=2) {
      let bestI=0,bestJ=1, best=Infinity
      for (let i=0;i<state.stations.length;i++)
        for (let j=i+1;j<state.stations.length;j++){
          const d = dist2(state.stations[i].pos, state.stations[j].pos)
          if (d<best){best=d;bestI=i;bestJ=j}
        }
      const color = COLORS[(state.nextLineNum-1)%COLORS.length]
      addLine(color, state.stations[bestI], state.stations[bestJ])
      state.currentLineId = state.lines[state.lines.length-1].id
      // renderLinesPanel() is already called in addLine()
    }
  }
  renderLinesPanel()

        // Prevent panning while drawing
        return
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
  // Prevent iOS context menu and selection gestures on canvas
  canvas.addEventListener('contextmenu', (e)=> e.preventDefault())
  canvas.addEventListener('selectstart', (e)=> e.preventDefault())

      const worldAfter = camera.toWorld(center)
      camera.pos.x += worldBefore.x - worldAfter.x
      camera.pos.y += worldBefore.y - worldAfter.y
      pinchDist0 = d
    }
  }
  function onPointerUp(e: PointerEvent) {
    // finish drawing if released on a station
    if (interaction.drawingFrom) {
      const screen = pointerPos(e, canvas)
      const world = camera.toWorld(screen)
      const target = hitTestStation(world)
      if (target && target.id !== interaction.drawingFrom.id) {
        toggleLine('#3498db', interaction.drawingFrom, target)
      }
      interaction.drawingFrom = null
      interaction.previewTo = null
      interaction.selectedLine = null // Reset selected line on pointer up
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

  // Initialize UI
  renderLinesPanel()

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
  // UI buttons
  const btnAuto = document.getElementById('toggle-auto') as HTMLButtonElement
  const btnSpawn = document.getElementById('spawn-one') as HTMLButtonElement
  const btnOnConnect = document.getElementById('spawn-on-connect') as HTMLButtonElement
  if (btnAuto && btnSpawn && btnOnConnect) {
    const updateLabels = ()=>{
      btnAuto.textContent = `Auto Spawn: ${state.autoSpawnEnabled? 'On':'Off'}`
      btnOnConnect.textContent = `Spawn on Connect: ${state.spawnOnConnect? 'On':'Off'}`
    }
    btnAuto.onclick = ()=> { state.autoSpawnEnabled = !state.autoSpawnEnabled; updateLabels() }
    btnOnConnect.onclick = ()=> { state.spawnOnConnect = !state.spawnOnConnect; updateLabels() }
    btnSpawn.onclick = ()=> {
      const pos = { x: camera.pos.x + (Math.random()*0.6+0.2)* ( canvas.width / camera.scale ),
                    y: camera.pos.y + (Math.random()*0.6+0.2)* ( canvas.height / camera.scale ) }
      const shapes: Station['shape'][] = ['circle','triangle','square']
      addStation(pos, shapes[Math.floor(Math.random()*3)])
    }
    updateLabels()
  }

  }
  requestAnimationFrame(frame)
}

main()
