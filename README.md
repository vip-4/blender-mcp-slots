# Blender MCP · SLOT GAMES 合集

在既有 Blender MCP 框架中扩展的老虎机（SLOT）游戏模块：**多主题机台共用同一套 CONFIG 引擎**。
新增一款机台 = 新增一份纯数据 CONFIG，引擎 / MCP 工具 / 前端界面均无需改动。

---

## 1. 文件结构

```
blender-mcp-slots/
├── package.json                     # 零依赖核心，scripts 见下
├── README.md                        # 本文档（部署 / 依赖 / 集成 / 稳定性）
├── src/
│   ├── main.js                      # 进程入口：装配 registry → service → dispatcher → transports
│   ├── config/runtime.js            # 运行时参数（环境变量 / CLI 覆盖）
│   ├── shared/
│   │   ├── errors.js                # 统一错误码（JSON-RPC 标准码 + 业务码 -320xx）
│   │   ├── logger.js                # 结构化日志（走 stderr，保证 stdio 干净）
│   │   ├── metrics.js               # 调用量 / 耗时 / 最近错误
│   │   └── guard.js                 # 令牌桶限流 + 幂等缓存 + 旋转预算 + 超时
│   ├── games/
│   │   ├── registry.js              # ★ 统一入口：加载 / 校验 / 热重载 / 派发
│   │   ├── session.js               # 会话服务 GameService（对外唯一业务门面）
│   │   ├── wallet.js                # 资金账本适配器（演示实现 + 真实钱包接口约定）
│   │   ├── engine/                  # ★ 共享 CONFIG 引擎（与主题无关）
│   │   │   ├── rng.js               #   可证公平 RNG（serverSeed+clientSeed+nonce）
│   │   │   ├── reels.js             #   权重 → 转轮条带 → 旋转 / 重旋
│   │   │   ├── paylines.js          #   线组定义（3x3:5 / 5x3:20 / 5x3:10）
│   │   │   ├── evaluate.js          #   中奖判定（lines / ways 双模式）
│   │   │   ├── features.js          #   免费旋转 / 扩张 WILD / 倍率 WILD / 金币重旋 / 收集
│   │   │   ├── round.js             #   单轮状态机（基础轮 / 免费旋转 / 重旋）
│   │   │   ├── math.js              #   蒙特卡洛自检（RTP / 命中率 / 波动）
│   │   │   └── validator.js         #   CONFIG 契约校验（fail-fast）
│   │   └── configs/                 # ★ 机台配置目录（新增机台只动这里）
│   │       ├── _schema.js           #   CONFIG 契约说明（唯一权威文档）
│   │       ├── classic-fruits.js    #   基线机台 3x3 五线
│   │       ├── dragon-fortune.js    #   新增 5x3 二十线 · 免费旋转 + 扩张 WILD
│   │       ├── pharaoh-gold.js      #   新增 5x3 二十线 · 金币重旋四档奖池 + 收集符
│   │       └── neon-fruits.js       #   新增 5x3 243 WAYS · 倍率 WILD
│   ├── mcp/
│   │   ├── protocol.js              # JSON-RPC 2.0 编解码 + 参数校验
│   │   ├── dispatcher.js            # 方法路由（校验 / 超时 / 错误码 / 指标）
│   │   ├── tools.js                 # ★ 工具清单：slots.* / blender.* / system.*
│   │   ├── transports/
│   │   │   ├── stdio.js             # stdio 传输（MCP 客户端拉起时使用）
│   │   │   └── http.js              # HTTP：/rpc + /api/* + /healthz + /metrics + 静态站
│   │   └── blender/bridge.js        # 与既有 Blender MCP 通信（健康检查 + 熔断 + 降级）
├── public/                          # 前端（原生 ES Module，零构建）
│   ├── index.html
│   ├── styles.css
│   └── app.js                       # 大厅 / 机台 / 演出 / 赔付表
├── scripts/simulate.js              # RTP 自检脚本（调参必备）
└── tests/                           # node:test，22 个用例
    ├── engine.test.js
    └── mcp.test.js
```

## 2. 依赖说明

| 项 | 说明 |
| --- | --- |
| 运行时 | **Node.js ≥ 18.17**（用到 `node:test`、`fetch`、`structuredClone`、`crypto`） |
| 必需依赖 | **无**（`dependencies: {}`）——核心链路零第三方包，降低供应链与安装失败风险 |
| 可选依赖 | `@modelcontextprotocol/sdk`（`optionalDependencies`）：若要接入官方 SDK 的 Server/Transport，可把 `src/mcp/transports/*` 替换为 SDK 实现，`dispatcher` 与 `tools` 层无需改动 |
| 前端 | 原生 HTML/CSS/ES Module，无构建、无框架、无 CDN 资源 |
| 外部可选 | 既有 Blender MCP 服务（默认关闭，见 `BLENDER_MCP_ENABLED`） |

安装：

```bash
npm install          # 可选依赖缺失亦可正常运行
npm run start        # 默认 http 模式：http://127.0.0.1:5173
npm run start:stdio  # stdio 模式：供 MCP 客户端拉起
npm run test         # node --test tests/
npm run simulate -- 200000   # 20 万轮 RTP 自检
```

环境变量（`src/config/runtime.js`）：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `MCP_TRANSPORT` | `http` | `http` / `stdio` / `both` |
| `MCP_HTTP_PORT` | `5173` | HTTP 端口 |
| `SLOT_CONFIG_DIR` | `src/games/configs` | 机台配置目录 |
| `MCP_LOG_LEVEL` | `info` | `debug/info/warn/error/silent` |
| `MCP_TIMEOUT_MS` | `5000` | 单次调用超时 |
| `SLOT_START_BALANCE` | `1000` | 新会话起始余额（演示账本） |
| `SLOT_MAX_SESSIONS` | `500` | 会话上限（LRU 淘汰） |
| `BLENDER_MCP_ENABLED` | `false` | 是否启用 Blender 桥接 |
| `BLENDER_MCP_URL` | `http://127.0.0.1:8765/rpc` | 上游 Blender MCP 端点 |

## 3. 集成步骤

### 3.1 以 stdio 方式挂到 MCP 客户端（Claude Desktop / Cursor / 自研 Agent）

```json
{
  "mcpServers": {
    "blender-mcp-slots": {
      "command": "node",
      "args": ["<项目绝对路径>/src/main.js", "--transport=stdio"],
      "env": { "MCP_LOG_LEVEL": "info" }
    }
  }
}
```

握手：`initialize` → `tools/list` → `tools/call`。
`stdout` 仅输出 JSON-RPC 报文，日志全部走 `stderr`，不会被客户端解析污染。

### 3.2 以 HTTP 方式接入（后端 / Web / Blender 插件）

```bash
curl -X POST http://127.0.0.1:5173/rpc \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"slots.spin","arguments":{"gameId":"dragon-fortune","bet":1}}}'
```

### 3.3 与既有 Blender MCP 服务通信

`src/mcp/blender/bridge.js` 负责与既有服务对话，遵循三条原则：

1. **旁路化**：`slots.spin` 只在结算完成后 fire-and-forget 推送 `blender.render_reel_frame`，失败不影响游戏结果；
2. **熔断隔离**：连续失败 `failureThreshold`（默认 3）次后熔断 `cooldownMs`（默认 30s），期间直接返回 `degraded`，不占用调用方时间；
3. **超时兜底**：`AbortController` + `timeoutMs`（默认 1500ms）。

未配置时 `blender.health` 返回 `{ enabled:false, degraded:true }`，主流程照常运行。

### 3.4 新增一款机台（完整步骤）

1. 复制 `src/games/configs/_schema.js` 顶部契约，在 `configs/` 新建 `my-game.js`（纯数据）；
2. 启动或调用 `slots.reloadConfigs` 热重载；
3. 调用 `slots.validateConfigs` 校验；
4. 调用 `slots.simulate {gameId, spins:200000}` 核对 RTP 是否落在 `rtp.target ± tolerance`；
5. 若需微调 RTP，改 `tuning.payScale`（赔付表全局系数），**不要**逐行手改赔付表；
6. 前端自动出现新机台卡片（主题色、符号、线数、赔付表、特性说明全部来自 CONFIG）。

## 4. 统一入口：工具清单

| 工具 | 作用 |
| --- | --- |
| `slots.listGames` | 列出全部机台（主题、线数、RTP、波动率、特性） |
| `slots.getGameConfig` | 取完整 CONFIG（条带、赔付表、特性参数、主题） |
| `slots.createSession` / `getSession` / `closeSession` | 会话生命周期 |
| `slots.spin` | 旋转一次（自动识别 基础轮 / 免费旋转 / 重旋） |
| `slots.autoSpin` | 连续 N 轮（可命中特性即停） |
| `slots.simulate` | 蒙特卡洛自检：RTP / 命中率 / 最大倍率 / 波动指数 |
| `slots.validateConfigs` | CONFIG 契约校验 |
| `slots.reloadConfigs` | 热重载配置目录 |
| `slots.registerGame` | 运行时注入 CONFIG（A/B 实验、参数化配置） |
| `blender.health` / `blender.renderSpin` | Blender 桥接状态与 3D 演出推送 |
| `system.health` / `system.metrics` | 健康检查与观测指标 |

`slots.spin` 返回（关键字段）：

```jsonc
{
  "roundId": "dragon-fortune-12-45",
  "phase": "base",            // base | freeSpins | holdAndRespin
  "grid": [["A","K","Q"], ...],  // grid[reel][row]
  "multiplier": 1,
  "lineWins": [{ "line": 0, "symbol": "dragon", "count": 4, "positions": [...], "multiplier": 1, "pay": 12.2 }],
  "scatterWins": [{ "symbol": "scatter", "count": 3, "pay": 2 }],
  "bonusCells": [{ "reel": 2, "row": 1, "symbol": "coin", "value": 5 }],
  "wildMultipliers": [{ "reel": 1, "row": 0, "value": 3 }],
  "triggered": [{ "type": "freeSpins", "spins": 10 }],
  "freeSpins": { "remaining": 10, "multiplier": 1, "awarded": 0 },
  "nextPhase": "freeSpins",
  "totalWin": 14.2, "capped": false, "balance": 1012.2,
  "fairness": { "serverSeedHash": "...", "clientSeed": "", "nonce": 45 }
}
```

## 5. 运行稳定性保障

| 风险 | 应对 |
| --- | --- |
| CONFIG 写错拖垮服务 | 加载期逐份校验，失败只下线该机台（`registry.failures`），其它机台与进程不受影响 |
| 随机性不可审计 | `serverSeed + clientSeed + nonce` 决定结果，返回 `serverSeedHash` 可离线复核 |
| 重复扣款 | `idempotencyKey` 幂等缓存（60s TTL） |
| 刷接口 | 令牌桶限流（默认 120 容量 / 40 每秒补充）+ 会话旋转预算 + 全局小时预算 |
| 慢调用拖死 | 每次调用 `withTimeout`（默认 5s） |
| 内存膨胀 | 会话 TTL 30min + LRU 上限 500 + 60s 清扫定时器（`unref`） |
| 上游 Blender 故障 | 熔断 + 超时 + 降级返回，绝不阻断主流程 |
| 日志污染 stdio | 日志写 stderr；stdout 只写 JSON-RPC |
| 进程异常 | `uncaughtException` / `unhandledRejection` 记录后继续；`SIGINT/SIGTERM` 优雅关闭 |
| 赔付失衡 | `slots.simulate` / `npm run simulate` 随时复核 RTP，CI 中亦有回归断言 |

观测端点：`GET /healthz`、`GET /metrics`（调用量、P 耗时、最近错误、内存）。

## 6. 前端界面与交互

- **大厅**：机台卡片（主题渐变、线数/WAYS、波动率、特性标签、RTP、投注区间），点击进机台；顶栏显示连接状态与余额。
- **机台**：转轮网格（尺寸与行列数由 `grid` 决定）+ 中奖连线和中奖格高亮 + WILD 倍率角标 + 金币面值角标。
- **交互链路**：点击 `SPIN`（空格同效）→ 整列滚动动画 → 请求 `slots.spin`（动画与请求并行，最少 620ms）→ 逐列停轮（每列 120ms）→ 中奖格/连线依次点亮 → 显示本轮赢得倍率与金额 → 触发特性时弹出横幅并自动续转（免费旋转 / 金币重旋结束后回到基础轮）。
- **控制区**：投注档位（`bet.levels`）步进、线数选择（`lines` 模式）、自动旋转 10/25/50（可随时停止）、赔付表弹窗（按符号列出 3/4/5 连倍率 + 特性规则文本）。
- **面板**：最近 30 轮记录、本场统计（轮次、实际 RTP、总投注、最大单轮、特性触发次数）。
- **主题**：`theme.primary/secondary/accent/background/frame/font` 直接映射为 CSS 变量，多主题共用同一份 DOM 与逻辑。

## 7. 当前机台（CONFIG 摘要）

| 机台 | 规格 | 核心机制 | 目标 RTP |
| --- | --- | --- | --- |
| `classic-fruits` 经典水果机（基线） | 3×3 / 5 线 | 倍率 WILD（x2/x3） | 95% |
| `dragon-fortune` 龙腾富贵 | 5×3 / 20 线 | 散射免费旋转 10/15/20 次、可再触发且倍率递进（上限 x5）、2~4 轴扩张 WILD | 96% |
| `pharaoh-gold` 黄金法老 | 5×3 / 20 线 | 6 枚金币触发 3 次重旋、MINI/MINOR/MAJOR/GRAND 四档奖池、阿努比斯收集金币面值、陵墓散射免费旋转 | 96% |
| `neon-fruits` 霓虹水果 | 5×3 / 243 WAYS | 倍率 WILD（x2/x3/x5）、星钻散射免费旋转（倍率上限 x4） | 96% |

### 25 万轮实测（`npm run simulate -- 250000`）

```
classic-fruits    rtp=0.9497  target=0.95   hit=38.53%  max=355.65x  vol=3.614
dragon-fortune    rtp=0.9597  target=0.96   hit=31.07%  max=374x     vol=2.497  fs=1279
neon-fruits       rtp=0.9601  target=0.96   hit=62.57%  max=4000x    vol=8.218  fs=1304
pharaoh-gold      rtp=0.9603  target=0.96   hit=25.50%  max=235x     vol=2.941  fs=2871  hr=536
```

四台机台实测 RTP 与目标偏差均 < 0.5%；`fs` = 免费旋转触发次数，`hr` = 金币重旋触发次数（每 25 万轮）。
