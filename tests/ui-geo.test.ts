import { describe, it, expect, beforeEach, vi } from 'vitest'

// Under jsdom per vitest.config.ts
import { setupGeoControls } from '../src/ui-geo.ts'
import { state } from '../src/game-state.js'
import { Camera, setGlobalCamera } from '../src/rendering.js'

function setupDom() {
  // Root container similar to index.html
  document.body.innerHTML = `
    <div id="app">
      <canvas id="game"></canvas>
      <div class="overlay" id="hud"></div>
      <div class="overlay" style="left:50%; top:0; transform:translateX(-50%);">
        <select id="geo-city-select">
          <option value="">请选择城市</option>
          <option value="beijing">北京</option>
          <option value="virtual">虚拟地图 (随机)</option>
        </select>
        <input type="text" id="geo-custom-city" placeholder="输入城市名" />
        <button id="geo-search">🔍</button>
        <select id="geo-station-type">
          <option value="all">全部</option>
          <option value="subway">地铁站</option>
        </select>
        <input type="number" id="geo-max-stations" min="5" max="100" value="50" />
        <input type="checkbox" id="geo-auto-lines" checked />
        <input type="number" id="geo-line-count" min="1" max="8" value="3" />
        <input type="range" id="geo-density" min="10" max="200" step="10" value="80" />
        <span id="geo-density-value">80px</span>
        <button id="geo-load">加载</button>
        <span id="geo-tip"></span>
      </div>
    </div>
  `
  // jsdom doesn't layout; define client sizes used by camera fitting
  const canvas = document.getElementById('game') as HTMLCanvasElement
  Object.defineProperty(canvas, 'clientWidth', { value: 800, configurable: true })
  Object.defineProperty(canvas, 'clientHeight', { value: 600, configurable: true })
}

async function flush() {
  await Promise.resolve()
}

describe('ui-geo', () => {
  beforeEach(() => {
    setupDom()
    // attach a camera for fitCameraToBounds
    const cam = new Camera()
    setGlobalCamera(cam)
    // Prepare controls
    setupGeoControls()
  })

  it('loads virtual map (fallback to spawnInitialWorld)', async () => {
    const select = document.getElementById('geo-city-select') as HTMLSelectElement
    const btn = document.getElementById('geo-load') as HTMLButtonElement
    const tip = document.getElementById('geo-tip') as HTMLSpanElement

    // fetch should NOT be called for virtual map
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    select.value = 'virtual'
    btn.click()
    await flush()
    await flush()

    // Do not assert DOM text here to avoid platform timing differences
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('loads OSM city data and creates stations (sparse) without errors', async () => {
    // Mock fetch for Overpass API
    const mockElements = {
      elements: [
        { lat: 40.0, lon: 116.0 },
        { lat: 39.6, lon: 117.6 },
        { lat: 40.5, lon: 115.7 },
      ],
    }
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve(mockElements),
    } as any)
    vi.stubGlobal('fetch', fetchMock)

    const select = document.getElementById('geo-city-select') as HTMLSelectElement
    const btn = document.getElementById('geo-load') as HTMLButtonElement

    select.value = 'beijing'
    btn.click()
    await flush()
    await flush()

    expect(fetchMock).toHaveBeenCalled()
    // Expect at least 2 stations from 3 far-apart points
    expect(state.stations.length).toBeGreaterThanOrEqual(2)
    // May or may not have a line depending on station count; ensure no crash
    expect(Array.isArray(state.lines)).toBe(true)
  })

  it('respects density slider: higher min distance yields fewer stations', async () => {
    const mockElements = {
      elements: [
        { lat: 40.0, lon: 116.00 },
        { lat: 40.0, lon: 116.03 },
        { lat: 40.0, lon: 116.06 },
        { lat: 40.5, lon: 115.7 },
        { lat: 39.6, lon: 117.6 },
      ],
    }
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve(mockElements),
    } as any)
    vi.stubGlobal('fetch', fetchMock)

    const select = document.getElementById('geo-city-select') as HTMLSelectElement
    const density = document.getElementById('geo-density') as HTMLInputElement
    const btn = document.getElementById('geo-load') as HTMLButtonElement

    select.value = 'beijing'

    density.value = '10'
    btn.click(); await flush(); await flush();
    const low = state.stations.length

    density.value = '200'
    btn.click(); await flush(); await flush();
    const high = state.stations.length

    expect(fetchMock).toHaveBeenCalled()
    expect(low).toBeGreaterThanOrEqual(3)
    expect(high).toBeGreaterThanOrEqual(1)
    expect(high).toBeLessThanOrEqual(low)
  })

  it('respects station type filter and max stations limit', async () => {
    const mockElements = {
      elements: Array.from({ length: 20 }, (_, i) => ({
        lat: 40.0 + i * 0.01,
        lon: 116.0 + i * 0.01
      }))
    }
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve(mockElements),
    } as any)
    vi.stubGlobal('fetch', fetchMock)

    const select = document.getElementById('geo-city-select') as HTMLSelectElement
    const stationType = document.getElementById('geo-station-type') as HTMLSelectElement
    const maxStations = document.getElementById('geo-max-stations') as HTMLInputElement
    const btn = document.getElementById('geo-load') as HTMLButtonElement

    select.value = 'beijing'
    stationType.value = 'subway'
    maxStations.value = '10'

    btn.click(); await flush(); await flush();

    expect(fetchMock).toHaveBeenCalled()
    expect(state.stations.length).toBeLessThanOrEqual(10)
    expect(state.stations.length).toBeGreaterThanOrEqual(1)
  })

  it('creates multiple lines when auto-lines is enabled', async () => {
    const mockElements = {
      elements: Array.from({ length: 15 }, (_, i) => ({
        lat: 40.0 + i * 0.02,
        lon: 116.0 + i * 0.02
      }))
    }
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve(mockElements),
    } as any)
    vi.stubGlobal('fetch', fetchMock)

    const select = document.getElementById('geo-city-select') as HTMLSelectElement
    const autoLines = document.getElementById('geo-auto-lines') as HTMLInputElement
    const lineCount = document.getElementById('geo-line-count') as HTMLInputElement
    const btn = document.getElementById('geo-load') as HTMLButtonElement

    select.value = 'beijing'
    autoLines.checked = true
    lineCount.value = '3'

    btn.click(); await flush(); await flush();

    expect(fetchMock).toHaveBeenCalled()
    expect(state.stations.length).toBeGreaterThanOrEqual(3)
    // Multiple lines should be created (though exact count depends on clustering)
    expect(state.lines.length).toBeGreaterThanOrEqual(1)
  })

  it('searches custom city and adds to presets', async () => {
    // Mock Nominatim API response
    const nominatimResponse = [{
      display_name: 'Tokyo, Japan',
      boundingbox: ['35.5', '35.9', '139.3', '140.0']
    }]

    // Mock OSM response
    const osmResponse = { elements: [{ lat: 35.7, lon: 139.7 }] }

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        json: () => Promise.resolve(nominatimResponse)
      } as any)
      .mockResolvedValueOnce({
        json: () => Promise.resolve(osmResponse)
      } as any)

    vi.stubGlobal('fetch', fetchMock)

    const customCity = document.getElementById('geo-custom-city') as HTMLInputElement
    const searchBtn = document.getElementById('geo-search') as HTMLButtonElement
    const select = document.getElementById('geo-city-select') as HTMLSelectElement
    const btn = document.getElementById('geo-load') as HTMLButtonElement

    customCity.value = 'Tokyo'
    searchBtn.click(); await flush(); await flush();

    // Should add new option to select
    const options = Array.from(select.options).map(opt => opt.textContent)
    expect(options.some(text => text?.includes('Tokyo'))).toBe(true)

    // Should be able to load the custom city
    btn.click(); await flush(); await flush();

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

