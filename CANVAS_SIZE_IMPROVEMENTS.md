# 画布尺寸和站点生成改进

## 问题描述

在原始版本中，当用户放大游戏界面时，新增的地铁站点可能会生成在当前视野之外，导致"站点出画"的问题，影响游戏体验。

## 解决方案

### 1. 基于视野的站点生成

新增了基于摄像机视野的站点生成机制：

- **智能区域计算**：根据当前摄像机位置和缩放级别动态计算站点生成区域
- **边距保护**：在视野边缘留出15%的边距，确保站点不会太靠近屏幕边缘
- **缩放限制**：设置最大有效缩放倍数（2.0x），防止在高缩放时生成区域过小

### 2. 配置选项

在游戏设置面板中新增了"📍 视野内生成"切换按钮：

- **开启**：站点将在当前视野范围内生成
- **关闭**：使用原始的固定区域生成方式

### 3. 技术实现

#### 核心配置 (`STATION_SPAWN_CONFIG`)

```typescript
{
  useViewportBasedSpawn: true,    // 是否使用基于视野的生成
  viewportMarginRatio: 0.15,      // 视野边距比例（15%）
  maxViewportScale: 2.0           // 最大视野缩放倍数
}
```

#### 生成逻辑

1. **视野计算**：
   ```typescript
   const effectiveScale = Math.min(camera.scale, maxViewportScale)
   const viewportWidth = canvas.clientWidth / effectiveScale
   const viewportHeight = canvas.clientHeight / effectiveScale
   ```

2. **边距应用**：
   ```typescript
   const marginX = viewportWidth * viewportMarginRatio
   const marginY = viewportHeight * viewportMarginRatio
   ```

3. **生成范围**：
   ```typescript
   const minX = camera.pos.x + marginX
   const maxX = camera.pos.x + viewportWidth - marginX
   ```

#### 全局摄像机引用

为了让UI控制模块能够访问摄像机实例，添加了全局摄像机引用：

```typescript
// rendering.ts
export let globalCamera: Camera | null = null
export function setGlobalCamera(camera: Camera): void {
  globalCamera = camera
}

// main.ts
setGlobalCamera(camera)
```

### 4. 使用方法

1. **手动添加站点**：
   - 点击"+ 添加站点"按钮
   - 如果"视野内生成"开启，站点将在当前视野内生成
   - 如果关闭，使用原始的固定区域生成

2. **自动生成站点**：
   - 开启"自动生成"功能
   - 自动生成的站点也会遵循"视野内生成"设置

3. **调整视野**：
   - 使用鼠标滚轮或双指手势缩放
   - 拖拽移动视野
   - 新站点将在当前视野范围内生成

### 5. 优势

- **解决出画问题**：确保新站点始终在玩家视野内
- **提升体验**：玩家无需频繁调整视野来寻找新站点
- **灵活配置**：可以根据需要切换生成模式
- **向下兼容**：保留原始生成方式作为备选

### 6. 调试信息

开启视野生成时，控制台会显示详细的生成信息：

```
🎯 基于视野生成站点: 缩放=1.50, 有效缩放=1.50, 视野范围 (120, 80) 到 (680, 520), 生成位置 (345, 267)
```

这些信息有助于理解和调试站点生成行为。
