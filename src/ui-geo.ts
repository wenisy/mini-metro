import { state, addStation, addLine, COLORS } from './game-state.js'
import type { Vec2, Station } from './types.js'
import { globalCamera } from './rendering.js'

// 预置城市及其边界 (south, west, north, east)
const CITY_PRESETS: Record<string, { name: string; bbox: [number, number, number, number] }> = {
  beijing: { name: '北京', bbox: [39.5, 115.5, 40.6, 117.7] },
  shanghai: { name: '上海', bbox: [30.9, 120.8, 31.6, 122.0] },
  newyork: { name: 'New York', bbox: [40.45, -74.3, 41.0, -73.5] },
  // 备用：本地虚拟地图
  virtual: { name: '虚拟地图 (随机)', bbox: [0, 0, 1, 1] }
}

function projectToWorld(lon: number, lat: number, bbox: [number, number, number, number]): Vec2 {
  const [south, west, north, east] = bbox
  const nx = (lon - west) / (east - west)
  const ny = (north - lat) / (north - south) // 反转Y以符合屏幕坐标
  // 映射到游戏世界区域（使用站点生成区域配置的大小近似）
  const margin = 80
  const width = Math.max(800, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 200)
  const height = Math.max(600, (typeof window !== 'undefined' ? window.innerHeight : 800) - 200)
  return {
    x: margin + nx * width,
    y: margin + ny * height,
  }
}

// 简单去重/稀疏化：按最小像素距离丢弃过近点
function sparsify(points: Vec2[], minDistPx: number): Vec2[] {
  const out: Vec2[] = []
  const min2 = minDistPx * minDistPx
  for (const p of points) {
    let ok = true
    for (const q of out) {
      const dx = p.x - q.x
      const dy = p.y - q.y
      if (dx * dx + dy * dy < min2) { ok = false; break }
    }
    if (ok) out.push(p)
  }
  return out
}

async function fetchCityNodes(bbox: [number, number, number, number]): Promise<Array<{ lat: number; lon: number }>> {
  // Overpass 查询：地铁站/火车站/地铁入口
  const [south, west, north, east] = bbox
  const query = `
    [out:json][timeout:25];
    (
      node["railway"="station"](${south},${west},${north},${east});
      node["station"="subway"](${south},${west},${north},${east});
      node["railway"="subway_entrance"](${south},${west},${north},${east});
    );
    out body;
  `
  const url = 'https://overpass-api.de/api/interpreter'
  const res = await fetch(url, { method: 'POST', body: query, headers: { 'Content-Type': 'text/plain' } })
  const data = await res.json()
  const elements = (data?.elements ?? []) as Array<{ lat?: number; lon?: number }>
  return elements.filter(e => typeof e.lat === 'number' && typeof e.lon === 'number') as any
}

function fitCameraToBounds(minX: number, minY: number, maxX: number, maxY: number) {
  if (!globalCamera) return
  const canvas = document.getElementById('game') as HTMLCanvasElement | null
  if (!canvas) return
  const pad = 60
  const width = Math.max(1, maxX - minX)
  const height = Math.max(1, maxY - minY)
  const scaleX = (canvas.clientWidth - 2 * pad) / width
  const scaleY = (canvas.clientHeight - 2 * pad) / height
  const scale = Math.max(0.2, Math.min(2.0, Math.min(scaleX, scaleY)))
  globalCamera.scale = scale
  globalCamera.pos = { x: minX - pad / scale, y: minY - pad / scale }
}

function clearWorld() {
  state.stations.length = 0
  state.lines.length = 0
  state.trains.length = 0
  state.currentLineId = null
}

function createInitialLineIfPossible(): void {
  if (state.stations.length < 2) return
  // 选左右最远的两个站点
  let left: Station = state.stations[0]
  let right: Station = state.stations[0]
  for (const s of state.stations) {
    if (s.pos.x < left.pos.x) left = s
    if (s.pos.x > right.pos.x) right = s
  }
  const line = addLine(COLORS[0], left, right, '1号线', true)
  if (line) state.currentLineId = line.id
}

export function setupGeoControls(): void {
  const select = document.getElementById('geo-city-select') as HTMLSelectElement | null
  const btn = document.getElementById('geo-load') as HTMLButtonElement | null
  const tip = document.getElementById('geo-tip') as HTMLSpanElement | null

  if (!select || !btn) return

  // 填充选项（若index.html未静态写死）
  if (select.options.length <= 1) {
    select.innerHTML = '<option value="">请选择城市</option>' +
      Object.entries(CITY_PRESETS).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('')
  }

  btn.onclick = async () => {
    const key = select.value as keyof typeof CITY_PRESETS
    if (!key) { alert('请选择城市'); return }

    if (key === 'virtual') {
      // 回退到虚拟随机地图：使用原始初始化逻辑
      clearWorld()
      // 动态导入以避免循环依赖
      const { spawnInitialWorld } = await import('./game-state.js')
      spawnInitialWorld()
      tip && (tip.textContent = '已加载：虚拟随机地图')
      return
    }

    const preset = CITY_PRESETS[key]
    try {
      tip && (tip.textContent = '加载中…')
      const nodes = await fetchCityNodes(preset.bbox)
      if (!nodes.length) {
        alert('未获取到该区域的站点数据')
        tip && (tip.textContent = '未获取到数据')
        return
      }

      // 投影到游戏坐标并稀疏化
      const projected = nodes.map(n => projectToWorld(n.lon, n.lat, preset.bbox))
      const sparse = sparsify(projected, 80) // 最小像素间距，符合“在一个范围内只选一个”

      // 应用到世界
      clearWorld()
      for (const p of sparse) {
        addStation(p)
      }

      // 适配摄像机
      const xs = sparse.map(p => p.x), ys = sparse.map(p => p.y)
      const minX = Math.min(...xs), maxX = Math.max(...xs)
      const minY = Math.min(...ys), maxY = Math.max(...ys)
      fitCameraToBounds(minX, minY, maxX, maxY)

      // 创建一条初始线路，便于开始游戏
      createInitialLineIfPossible()

      tip && (tip.textContent = `已加载：${preset.name}（站点 ${state.stations.length}）`)
      console.log(`✅ 载入城市 ${preset.name}，生成站点 ${state.stations.length}`)
    } catch (e) {
      console.error('加载城市数据失败', e)
      alert('加载城市数据失败，请稍后重试')
      tip && (tip.textContent = '加载失败')
    }
  }
}

