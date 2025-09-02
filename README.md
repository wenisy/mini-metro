# Mini Metro (Web) — Infinite Mode

目标：实现一个网页版的极简地铁（Mini Metro-like），首版只考虑 Infinite Mode（无关卡、持续生成站点与乘客），移动端优先，同时兼容鼠标。

在线试玩（GitHub Pages 构建完成后）：
- https://wenisy.github.io/mini-metro/

## 运行
- 开发：`npm i`、`npm run dev`
- 构建：`npm run build`、`npm run preview`

## 技术方向
- TypeScript + Canvas 2D（首版），后续可升级 WebGL
- 独立渲染/模拟循环：渲染 60FPS，逻辑固定步进（10–20Hz）
- 轻量状态与系统模块（渲染、输入、站点/线路、列车/乘客、难度/资源）

## MVP 范围（Infinite Mode）
- 站点：三类形状（圆/三角/方），随机生成，避让最小间距 R，生成速率随时间线性提升
- 线路：拖拽连线形成线路（折线），每条线 1 列车，颜色固定（先内置 2 条线）
- 列车/乘客：乘客在站点生成（目标为不同形状），列车在站停固定时长，上下客遵循容量限制
- 失败条件：任意站点候客数达到阈值 T
- 交互：移动优先 + 鼠标兼容（单指/鼠标拖拽平移，双指/滚轮缩放；连线交互后续补充）

## 验收检查（首版）
- 桌面与手机浏览器均可加载与操作（Chrome/Safari）
- 能渲染站点/线路/列车并移动；候客出现并随列车变化
- 15 分钟运行无崩溃，无明显内存泄漏

## 部署
- 已配置 GitHub Actions：push 到 master 会自动构建并部署到 GitHub Pages
- Vite 配置了 base = '/mini-metro/' 以适配仓库路径

## 后续路线
- 站点生成器、连线编辑器、真实乘客目标与路由、失败条件
- 难度曲线与资源奖励
- 移动端手势优化、性能优化

