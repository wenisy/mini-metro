import './style.css'

// 导入模块化的代码
import { state, spawnInitialWorld } from './game-state.js'
import { Camera, render, updateMoneyEffects } from './rendering.js'
import { setupInput, interaction } from './input-handling.js'
import { updateAnimations } from './smart-attachment.js'
import { updateTrains, maybeSpawnStations, spawnPassengers } from './train-logic.js'
import { setupUIControls, renderLinesPanel, showLinkChooser, hideLinkChooser, updateFinancialPanel } from './ui-controls.js'

// 基础游戏引导：DPR感知画布，固定时间步长循环，指针输入

// 画布设置函数
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

// 主更新函数
function update(dt: number) {
  state.time += dt
  maybeSpawnStations(dt)

  // 更新智能吸附动画
  updateAnimations(dt)

  // 生成乘客
  spawnPassengers(dt)

  // 更新列车
  updateTrains(dt)

  // 更新金钱效果
  updateMoneyEffects()

  // 定期更新财务面板（每秒更新一次）
  if (Math.floor(state.time * 10) % 10 === 0) {
    updateFinancialPanel()
  }
}

// 主函数
function main() {
  const canvas = document.getElementById('game') as HTMLCanvasElement
  const hud = document.getElementById('hud') as HTMLDivElement
  const { ctx } = setupCanvas(canvas)
  const camera = new Camera()

  // 设置输入处理
  setupInput(canvas, camera, showLinkChooser, hideLinkChooser)

  // 初始化世界
  spawnInitialWorld()

  // 设置UI控件
  setupUIControls()

  // 初始化UI
  renderLinesPanel()

  // 主循环，固定时间步长
  let last = performance.now()
  let acc = 0
  const step = 1/30 // 30Hz 逻辑

  function frame(now: number) {
    const dt = (now - last) / 1000
    last = now
    acc += Math.min(dt, 0.1)

    while (acc >= step) {
      update(step)
      acc -= step
    }

    render(ctx, camera, canvas, interaction)
    hud.textContent = `t=${state.time.toFixed(1)} s | stations=${state.stations.length} | trains=${state.trains.length}`
    requestAnimationFrame(frame)
  }

  requestAnimationFrame(frame)
}

main()