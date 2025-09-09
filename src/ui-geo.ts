import { state, addStation, addLine, COLORS } from './game-state.js'
import type { Vec2, Station } from './types.js'
import { globalCamera } from './rendering.js'

// 预置城市及其边界 (south, west, north, east)
const CITY_PRESETS: Record<string, { name: string; bbox: [number, number, number, number] }> = {
  beijing: { name: '北京', bbox: [39.5, 115.5, 40.6, 117.7] },
  shanghai: { name: '上海', bbox: [30.9, 120.8, 31.6, 122.0] },
  guangzhou: { name: '广州', bbox: [22.9, 113.0, 23.6, 113.8] },
  shenzhen: { name: '深圳', bbox: [22.4, 113.8, 22.8, 114.6] },
  tokyo: { name: '东京', bbox: [35.5, 139.3, 35.9, 140.0] },
  newyork: { name: 'New York', bbox: [40.45, -74.3, 41.0, -73.5] },
  london: { name: 'London', bbox: [51.3, -0.5, 51.7, 0.3] },
  paris: { name: 'Paris', bbox: [48.7, 2.1, 49.0, 2.6] },
  // 备用：本地虚拟地图
  virtual: { name: '虚拟地图 (随机)', bbox: [0, 0, 1, 1] }
}

// 站点类型过滤配置
const STATION_TYPE_QUERIES: Record<string, string> = {
  all: `
    node["railway"="station"];
    node["station"="subway"];
    node["railway"="subway_entrance"];
  `,
  subway: `
    node["station"="subway"];
    node["railway"="subway_entrance"];
  `,
  railway: `
    node["railway"="station"];
  `,
  entrance: `
    node["railway"="subway_entrance"];
  `
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

async function fetchCityNodes(bbox: [number, number, number, number], stationType: string = 'all'): Promise<Array<{ lat: number; lon: number }>> {
  // Overpass 查询：根据类型过滤站点
  const [south, west, north, east] = bbox
  const typeQuery = STATION_TYPE_QUERIES[stationType] || STATION_TYPE_QUERIES.all
  const query = `
    [out:json][timeout:25];
    (
      ${typeQuery.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('//')).map(line =>
        line.replace(';', `(${south},${west},${north},${east});`)
      ).join('\n      ')}
    );
    out body;
  `
  const url = 'https://overpass-api.de/api/interpreter'
  const res = await fetch(url, { method: 'POST', body: query, headers: { 'Content-Type': 'text/plain' } })
  const data = await res.json()
  const elements = (data?.elements ?? []) as Array<{ lat?: number; lon?: number }>
  return elements.filter(e => typeof e.lat === 'number' && typeof e.lon === 'number') as any
}

// 通过 Nominatim API 搜索城市并获取边界框
async function searchCityBBox(cityName: string): Promise<{ name: string; bbox: [number, number, number, number] } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cityName)}&format=json&limit=1&addressdetails=1`
    const res = await fetch(url, { headers: { 'User-Agent': 'MiniMetroGame/1.0' } })
    const data = await res.json()
    if (!data || !data[0] || !data[0].boundingbox) return null

    const result = data[0]
    const [south, north, west, east] = result.boundingbox.map(Number)
    return {
      name: result.display_name.split(',')[0] || cityName,
      bbox: [south, west, north, east]
    }
  } catch (e) {
    console.error('城市搜索失败:', e)
    return null
  }
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

// K-means 聚类算法（简化版）
function kMeansCluster(points: Vec2[], k: number): Vec2[][] {
  if (points.length <= k) return points.map(p => [p])

  // 初始化聚类中心
  const centers: Vec2[] = []
  for (let i = 0; i < k; i++) {
    centers.push(points[Math.floor(i * points.length / k)])
  }

  let clusters: Vec2[][] = []
  let iterations = 0
  const maxIterations = 10

  while (iterations < maxIterations) {
    // 分配点到最近的聚类中心
    clusters = Array(k).fill(null).map(() => [])
    for (const point of points) {
      let minDist = Infinity
      let bestCluster = 0
      for (let i = 0; i < k; i++) {
        const dx = point.x - centers[i].x
        const dy = point.y - centers[i].y
        const dist = dx * dx + dy * dy
        if (dist < minDist) {
          minDist = dist
          bestCluster = i
        }
      }
      clusters[bestCluster].push(point)
    }

    // 更新聚类中心
    let changed = false
    for (let i = 0; i < k; i++) {
      if (clusters[i].length === 0) continue
      const newCenter = {
        x: clusters[i].reduce((sum, p) => sum + p.x, 0) / clusters[i].length,
        y: clusters[i].reduce((sum, p) => sum + p.y, 0) / clusters[i].length
      }
      if (Math.abs(newCenter.x - centers[i].x) > 1 || Math.abs(newCenter.y - centers[i].y) > 1) {
        changed = true
      }
      centers[i] = newCenter
    }

    if (!changed) break
    iterations++
  }

  return clusters.filter(cluster => cluster.length > 0)
}

// 最小生成树算法（Kruskal）
function minimumSpanningTree(points: Vec2[]): Array<[Vec2, Vec2]> {
  if (points.length < 2) return []

  // 生成所有边
  const edges: Array<{ from: Vec2; to: Vec2; weight: number }> = []
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[i].x - points[j].x
      const dy = points[i].y - points[j].y
      edges.push({
        from: points[i],
        to: points[j],
        weight: Math.sqrt(dx * dx + dy * dy)
      })
    }
  }

  // 按权重排序
  edges.sort((a, b) => a.weight - b.weight)

  // Union-Find 数据结构
  const parent = new Map<Vec2, Vec2>()
  const find = (x: Vec2): Vec2 => {
    if (!parent.has(x)) parent.set(x, x)
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!))
    return parent.get(x)!
  }

  const mst: Array<[Vec2, Vec2]> = []
  for (const edge of edges) {
    const rootFrom = find(edge.from)
    const rootTo = find(edge.to)
    if (rootFrom !== rootTo) {
      parent.set(rootFrom, rootTo)
      mst.push([edge.from, edge.to])
      if (mst.length === points.length - 1) break
    }
  }

  return mst
}

function createMultipleLines(autoLines: boolean, lineCount: number): void {
  if (state.stations.length < 2) return

  if (!autoLines) {
    // 简单模式：只创建一条线路（左右最远）
    let left: Station = state.stations[0]
    let right: Station = state.stations[0]
    for (const s of state.stations) {
      if (s.pos.x < left.pos.x) left = s
      if (s.pos.x > right.pos.x) right = s
    }
    const line = addLine(COLORS[0], left, right, '1号线', true)
    if (line) state.currentLineId = line.id
    return
  }

  // 自动生成多条线路
  const stationPositions = state.stations.map(s => s.pos)
  const clusters = kMeansCluster(stationPositions, Math.min(lineCount, Math.floor(state.stations.length / 2)))

  let lineIndex = 0
  for (const cluster of clusters) {
    if (cluster.length < 2) continue

    // 为每个聚类生成 MST 并创建线路
    const mst = minimumSpanningTree(cluster)
    if (mst.length === 0) continue

    // 找到 MST 中最长的路径作为主线
    const paths = new Map<Vec2, Vec2[]>()
    for (const [from, to] of mst) {
      if (!paths.has(from)) paths.set(from, [])
      if (!paths.has(to)) paths.set(to, [])
      paths.get(from)!.push(to)
      paths.get(to)!.push(from)
    }

    // 找到度数为1的端点
    const endpoints = Array.from(paths.entries()).filter(([_, neighbors]) => neighbors.length === 1).map(([pos, _]) => pos)
    if (endpoints.length >= 2) {
      // 找到对应的站点
      const startStation = state.stations.find(s => s.pos.x === endpoints[0].x && s.pos.y === endpoints[0].y)
      const endStation = state.stations.find(s => s.pos.x === endpoints[1].x && s.pos.y === endpoints[1].y)

      if (startStation && endStation && lineIndex < COLORS.length) {
        const lineName = `${lineIndex + 1}号线`
        const line = addLine(COLORS[lineIndex], startStation, endStation, lineName, true)
        if (line && lineIndex === 0) state.currentLineId = line.id
        lineIndex++
      }
    }
  }
}

export function setupGeoControls(): void {
  const select = document.getElementById('geo-city-select') as HTMLSelectElement | null
  const customCityInput = document.getElementById('geo-custom-city') as HTMLInputElement | null
  const searchBtn = document.getElementById('geo-search') as HTMLButtonElement | null
  const stationTypeSelect = document.getElementById('geo-station-type') as HTMLSelectElement | null
  const maxStationsInput = document.getElementById('geo-max-stations') as HTMLInputElement | null
  const autoLinesCheckbox = document.getElementById('geo-auto-lines') as HTMLInputElement | null
  const lineCountInput = document.getElementById('geo-line-count') as HTMLInputElement | null
  const btn = document.getElementById('geo-load') as HTMLButtonElement | null
  const tip = document.getElementById('geo-tip') as HTMLSpanElement | null
  const densityInput = document.getElementById('geo-density') as HTMLInputElement | null
  const densityValue = document.getElementById('geo-density-value') as HTMLSpanElement | null

  if (!select || !btn) return

  // 初始化密度显示
  if (densityInput && densityValue) {
    densityValue.textContent = `${densityInput.value}px`
    densityInput.addEventListener('input', () => {
      if (densityValue) densityValue.textContent = `${densityInput.value}px`
    })
  }

  // 填充选项（若index.html未静态写死）
  if (select.options.length <= 1) {
    select.innerHTML = '<option value="">请选择城市</option>' +
      Object.entries(CITY_PRESETS).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('')
  }

  // 自定义城市搜索
  if (searchBtn && customCityInput) {
    searchBtn.onclick = async () => {
      const cityName = customCityInput.value.trim()
      if (!cityName) {
        alert('请输入城市名称')
        return
      }

      try {
        tip && (tip.textContent = '搜索城市中...')
        const result = await searchCityBBox(cityName)
        if (!result) {
          alert('未找到该城市，请检查拼写或尝试其他名称')
          tip && (tip.textContent = '搜索失败')
          return
        }

        // 将搜索结果添加到预设中并选中
        const customKey = `custom_${Date.now()}`
        CITY_PRESETS[customKey] = result

        // 更新下拉选项
        const option = document.createElement('option')
        option.value = customKey
        option.textContent = `${result.name} (自定义)`
        select.appendChild(option)
        select.value = customKey

        tip && (tip.textContent = `找到城市: ${result.name}`)
      } catch (e) {
        console.error('搜索城市失败:', e)
        alert('搜索失败，请稍后重试')
        tip && (tip.textContent = '搜索失败')
      }
    }

    // 回车键搜索
    customCityInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        searchBtn.click()
      }
    })
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
      // 获取过滤参数
      const stationType = stationTypeSelect?.value || 'all'
      const maxStations = maxStationsInput ? Math.max(5, Math.min(100, Number(maxStationsInput.value) || 50)) : 50
      const autoLines = autoLinesCheckbox?.checked ?? true
      const lineCount = lineCountInput ? Math.max(1, Math.min(8, Number(lineCountInput.value) || 3)) : 3

      const nodes = await fetchCityNodes(preset.bbox, stationType)
      if (!nodes.length) {
        alert('未获取到该区域的站点数据')
        tip && (tip.textContent = '未获取到数据')
        return
      }

      // 投影到游戏坐标并稀疏化
      const projected = nodes.map(n => projectToWorld(n.lon, n.lat, preset.bbox))
      const minDist = (typeof densityInput !== 'undefined' && densityInput)
        ? Math.max(10, Math.min(300, Number(densityInput.value) || 80))
        : 80
      let sparse = sparsify(projected, minDist)

      // 应用站点数量上限
      if (sparse.length > maxStations) {
        const centerX = sparse.reduce((sum, p) => sum + p.x, 0) / sparse.length
        const centerY = sparse.reduce((sum, p) => sum + p.y, 0) / sparse.length
        sparse.sort((a, b) => {
          const distA = Math.sqrt((a.x - centerX) ** 2 + (a.y - centerY) ** 2)
          const distB = Math.sqrt((b.x - centerX) ** 2 + (b.y - centerY) ** 2)
          return distA - distB
        })
        sparse = sparse.slice(0, maxStations)
      } // 最小像素间距，符合“在一个范围内只选一个”

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

      // 创建线路（单条或多条）
      createMultipleLines(autoLines, lineCount)

      const lineText = autoLines ? `${state.lines.length}条线路` : '1条线路'
      tip && (tip.textContent = `已加载：${preset.name}（${state.stations.length}站点，${lineText}）`)
      console.log(`✅ 载入城市 ${preset.name}，生成站点 ${state.stations.length}，线路 ${state.lines.length}`)
    } catch (e) {
      console.error('加载城市数据失败', e)
      alert('加载城市数据失败，请稍后重试')
      tip && (tip.textContent = '加载失败')
    }
  }
}

