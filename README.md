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
│   ├── config/dotenv.js             # 极简 .env 加载（只补充不覆盖，方便本地调试）
│   ├── store/                       # ★ 可插拔外部存储（Neon Postgres / Redis / R2 / 内存）
│   │   ├── index.js                 #   ResilientStore 门面：自动降级 + 旁路写入
│   │   ├── memory.js                #   内存后端（默认 / 最终降级目标）
│   │   ├── postgres.js              #   Neon Postgres 后端（批量落库、读前补写）
│   │   ├── redis.js                 #   Redis 后端（零依赖 RESP 客户端）
│   │   └── r2.js                    #   Cloudflare R2 归档（零依赖 S3 SigV4 + JSONL 分片）
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
│   │   │   ├── features.js          #   免费旋转 / 扩张 WILD / 倍率 WILD / 金币重旋 / 收集 / 雪崩 / 扩展符号
│   │   │   ├── round.js             #   单轮状态机（基础轮 / 免费旋转 / 重旋，含雪崩连锁循环）
│   │   │   ├── math.js              #   蒙特卡洛自检（RTP / 命中率 / 波动）
│   │   │   └── validator.js         #   CONFIG 契约校验（fail-fast）
│   │   └── configs/                 # ★ 机台配置目录（新增机台只动这里）
│   │       ├── _schema.js           #   CONFIG 契约说明（唯一权威文档）
│   │       ├── classic-fruits.js    #   基线机台 3x3 五线
│   │       ├── dragon-fortune.js    #   新增 5x3 二十线 · 免费旋转 + 扩张 WILD
│   │       ├── pharaoh-gold.js      #   新增 5x3 二十线 · 金币重旋四档奖池 + 收集符
│   │       ├── neon-fruits.js       #   新增 5x3 243 WAYS · 倍率 WILD
│   │       ├── panda-fortune.js     #   新增 5x3 二十线 · 熊掌收集金币 + 黏性扩张 WILD
│   │       ├── inferno-jackpots.js  #   新增 5x3 二十线 · 6 币锁仓重旋四档奖池 + 免费旋转
│   │       ├── book-of-ra.js        #   新增 5x3 十线 · Book 系「扩展符号」免费旋转（可再触发）
│   │       ├── cosmic-crush.js      #   新增 5x3 二十线 · 雪崩连锁 + 倍率阶梯 + 免费旋转
│   │       ├── starlight-burst.js   #   新增 5x3 十线 · 双向赔付 + 「WILD 重旋」整轴展开
│   │       ├── treasure-hunter.js   #   新增 5x3 二十线 · 雪崩连锁 + 黏性扩张 WILD + 免费旋转
│   │       └── sakura-tale.js       #   新增 5x3 十线 · 双向赔付 + 雪崩连锁 + 扩展符号免费旋转
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
├── db/schema.sql                    # 外部存储表结构（幂等建表）
├── scripts/
│   ├── simulate.js                  # RTP 自检脚本（调参必备）
│   ├── migrate.mjs                  # Neon Postgres 建表 / 校验
│   ├── r2check.mjs                  # Cloudflare R2 连通性自检（凭据 / 桶 / 读写）
│   └── smoke-v2.mjs                 # 端到端冒烟：新机台特性 + 存储/归档工具
└── tests/                           # node:test，37 个用例
    ├── engine.test.js
    ├── mcp.test.js
    ├── store.test.js                # 存储降级、新机台、多特性排队
    ├── cascades.test.js             # 雪崩连锁、扩展符号、R2 签名与归档降级
    └── wildrespin.test.js           # 双向赔付、WILD 重旋状态机与非法配置拒绝
```

## 2. 依赖说明

| 项 | 说明 |
| --- | --- |
| 运行时 | **Node.js ≥ 18.17**（用到 `node:test`、`fetch`、`structuredClone`、`crypto`） |
| 必需依赖 | **无**（`dependencies: {}`）——核心链路零第三方包，降低供应链与安装失败风险 |
| 可选依赖 | `@modelcontextprotocol/sdk`（`optionalDependencies`）：若要接入官方 SDK 的 Server/Transport，可把 `src/mcp/transports/*` 替换为 SDK 实现，`dispatcher` 与 `tools` 层无需改动 |
| 可选依赖 | `pg`（`optionalDependencies`）：仅在启用 Neon Postgres 持久化时需要；缺失或连接失败会自动降级到内存存储，游戏主流程不受影响 |
| Redis | 自研零依赖 RESP 客户端（`src/store/redis.js`），不引入 `ioredis`，避免为旁路链路增加传递依赖 |
| R2 归档 | 自研零依赖 S3 SigV4 客户端（`src/store/r2.js`），不引入 `aws-sdk`；凭据缺失或网络不通时自动关闭归档 |
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
| `STORE_DRIVER` | `auto` | `memory` / `postgres` / `redis` / `auto`（auto：有 `DATABASE_URL` 用 Postgres） |
| `DATABASE_URL` | — | Neon Postgres 连接串（也可写入 `.env`）；用于旋转审计与排行榜 |
| `REDIS_URL` | — | Redis 连接串（旁路热数据，可选） |
| `PG_CONNECT_TIMEOUT_MS` | `15000` | Postgres 连接超时（云端冷启动较久） |
| `PG_STATEMENT_TIMEOUT_MS` | `10000` | Postgres 语句超时 |
| `R2_ACCOUNT_ID` | — | Cloudflare 账户 ID（启用旋转流水归档时必填） |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | — | R2 S3 兼容凭据 |
| `R2_BUCKET` | — | 归档桶名（如 `blender-mcp-slots`） |
| `R2_ENDPOINT` | `https://<account>.r2.cloudflarestorage.com` | 自定义 S3 端点（自建 MinIO 亦可复用） |
| `R2_PREFIX` | `blender-mcp-slots` | 对象前缀：`{prefix}/spins/{date}/{hour}.jsonl`、`{prefix}/snapshots/*.json` |
| `R2_TIMEOUT_MS` | `4000` | 单次归档请求超时 |

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

### 3.4 接入 Cloudflare R2 归档（可选）

```bash
# 1) 写入 .env（不入库）
R2_ACCOUNT_ID=<account>
R2_ACCESS_KEY_ID=<access key>
R2_SECRET_ACCESS_KEY=<secret>
R2_BUCKET=blender-mcp-slots

# 2) 连通性自检
node scripts/r2check.mjs

# 3) 运行时：旋转流水自动缓冲，满 200 条或每 60s 落盘；也可手动触发
curl -X POST http://127.0.0.1:5173/rpc -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"store.snapshot","arguments":{"name":"release-1.2"}}}'
```

归档为**旁路能力**：`store.health` 中 `archive.degraded=true` 仅代表流水未落对象存储，数据库与内存快照仍在正常工作，游戏流程零影响。

### 3.5 新增一款机台（完整步骤）

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
| `slots.history` | 最近旋转记录（外部存储优先，失败回退内存快照） |
| `slots.leaderboard` | 单次旋转最高倍率排行榜 |
| `store.health` | 外部存储（Postgres / Redis / R2 归档）健康状态与降级情况 |
| `store.archive` | 立即把缓冲的旋转流水归档到 R2（按小时 JSONL 分片） |
| `store.snapshot` | 把当前全部机台 CONFIG 备份为 R2 快照（调参回滚点） |
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
  "cascadeCount": 3,                  // 雪崩连锁段数（未配置 cascades 时为 0）
  "cascadeMultiplier": 2,             // 本轮最终连锁倍率
  "cascades": [{ "step": 0, "multiplier": 1, "grid": [...], "win": 1.4, "winCells": [...], "removed": 3, "newCells": [...] }],
  "expandingSymbol": { "symbolId": "mask", "reels": [1, 3] },  // Book 系整轴展开
  "selectedSymbol": "mask",           // 本次免费旋转选定的扩展符号
  "wildRespin": { "remaining": 3, "sticky": 9, "settled": false, "awarded": 2.4 },  // WILD 重旋进度
  "phase": "base",                    // base | freeSpins | holdAndRespin | wildRespin
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
| 数据库 / 缓存故障 | 存储门面自动降级到内存：写入丢弃只记指标，读取回退内存快照，`store.health` 明确标记 `degraded` |
| 云端 DB 高延迟拖慢旋转 | 写入走旁路队列 + 批量事务落库（40 次旋转实测 RPC 总耗时 264ms），读前补写保证「刚转完就能查到」 |
| 多特性同轮触发 | 免费旋转与金币重旋同时命中时，重旋进入 `pendingRespin` 排队，免费旋转结算后自动启动，状态机不互相覆盖 |
| 雪崩连锁失控 | 段数硬上限 `cascades.maxSteps`（默认 8）+ 倍率阶梯末尾封顶 + 单轮封顶 `limits.maxWinMultiplier` |
| R2 / 对象存储故障 | 归档在独立旁路：连接失败即 `degraded`，写入丢弃只计数，游戏、数据库与排行榜完全不受影响 |
| 特性状态机叠加 | WILD 重旋与免费旋转/金币重旋互相覆盖 | 重旋轮不结算散射，且仅在本轮未触发其它特性时启动；`phase/nextPhase` 有回归用例 |
| 双向赔付拉高 RTP | 同一条线付两次 | 双向机台按 `slots.simulate` 20 万轮重新标定赔付表（`tuning.payScale`），调参不改代码 |
| 日志污染 stdio | 日志写 stderr；stdout 只写 JSON-RPC |
| 进程异常 | `uncaughtException` / `unhandledRejection` 记录后继续；`SIGINT/SIGTERM` 优雅关闭 |
| 赔付失衡 | `slots.simulate` / `npm run simulate` 随时复核 RTP，CI 中亦有回归断言 |

观测端点：`GET /healthz`、`GET /metrics`（调用量、P 耗时、最近错误、内存）。

## 6. 前端界面与交互

- **大厅**：机台卡片（主题渐变、线数/WAYS、波动率、特性标签、RTP、投注区间），点击进机台；顶栏显示连接状态与余额。
- **机台**：转轮网格（尺寸与行列数由 `grid` 决定）+ 中奖连线和中奖格高亮 + WILD 倍率角标 + 金币面值角标。
- **交互链路**：点击 `SPIN`（空格同效）→ 整列滚动动画 → 请求 `slots.spin`（动画与请求并行，最少 620ms）→ 逐列停轮（每列 120ms）→ 中奖格/连线依次点亮 → 显示本轮赢得倍率与金额 → 触发特性时弹出横幅并自动续转（免费旋转 / 金币重旋结束后回到基础轮）。
- **雪崩演出**（`features.cascades` 机台）：本轮返回的 `cascades` 逐段重放——每段渲染该段盘面、高亮中奖格、新落位符号带 `drop` 下落动画，转轮下方徽标实时显示「第 N 段 · 倍率 xN · +赢得」，直到无中奖为止。
- **扩展符号演出**（`freeSpins.expandingSymbol` 机台）：免费旋转横幅显示本轮选定的扩展符号及触发条件；展开时对应整轴加金色描边脉冲并弹出提示，随后按常规线制结算。
- **WILD 重旋演出**（`features.wildRespin` 机台）：触发时整轴金色描边脉冲 + Toast「星芒 WILD 整轴展开 · 获得 N 次重旋」，横幅实时显示剩余次数、已展开格数与本段累计赢得，结束后自动回到基础轮。
- **双向赔付标签**：`evaluation.direction=both` 的机台在大厅卡片显示「双向赔付」标签，赔付表中说明「每条线左右各判一次」。
- **归档状态**：面板标题旁标签显示当前存储驱动，并在启用 R2 时追加「R2 归档就绪/降级」，降级仅提示不阻断操作。
- **控制区**：投注档位（`bet.levels`）步进、线数选择（`lines` 模式）、自动旋转 10/25/50（可随时停止）、赔付表弹窗（按符号列出 3/4/5 连倍率 + 特性规则文本）。
- **面板**：最近 30 轮记录、本场统计（轮次、实际 RTP、总投注、最大单轮、特性触发次数）、排行榜（按单次旋转最高倍率，标题右侧标签显示当前存储驱动与是否降级）。
- **主题**：`theme.primary/secondary/accent/background/frame/font` 直接映射为 CSS 变量，多主题共用同一份 DOM 与逻辑。

## 7. 当前机台（CONFIG 摘要）

| 机台 | 规格 | 核心机制 | 目标 RTP |
| --- | --- | --- | --- |
| `classic-fruits` 经典水果机（基线） | 3×3 / 5 线 | 倍率 WILD（x2/x3） | 95% |
| `dragon-fortune` 龙腾富贵 | 5×3 / 20 线 | 散射免费旋转 10/15/20 次、可再触发且倍率递进（上限 x5）、2~4 轴扩张 WILD | 96% |
| `pharaoh-gold` 黄金法老 | 5×3 / 20 线 | 6 枚金币触发 3 次重旋、MINI/MINOR/MAJOR/GRAND 四档奖池、阿努比斯收集金币面值、陵墓散射免费旋转 | 96% |
| `neon-fruits` 霓虹水果 | 5×3 / 243 WAYS | 倍率 WILD（x2/x3/x5）、星钻散射免费旋转（倍率上限 x4） | 96% |
| `panda-fortune` 熊猫财神 | 5×3 / 20 线 | 熊掌（第 3~5 轴）收集盘面全部金币面值；财神庙散射 10/15/20 次免费旋转 + 黏性扩张 WILD；免费旋转与重旋可排队串场 | 96% |
| `inferno-jackpots` 烈焰金库 | 5×3 / 20 线 | 6 枚金币触发 3 次锁仓重旋、MINI/MINOR/MAJOR/GRAND 四档奖池；金库散射 8/12/16 次免费旋转（倍率上限 x3） | 96% |
| `book-of-ra` 法老之书 | 5×3 / 10 线 | 亡灵之书散射 10/12/15 次免费旋转，进入时随机选定扩展符号（候选池可配），出现 ≥2 个即整轴展开；可再触发 +5/+8/+10 | 95.5% |
| `cosmic-crush` 星海消除 | 5×3 / 20 线 | 雪崩连锁：中奖格消除 → 上方下落 → 顶部补新符号，倍率阶梯 `1/1/2/3/5/8/12`；陨石散射 8/12/16 次免费旋转（`carryInFreeSpins` 可让倍率跨轮累积） | 96% |
| `starlight-burst` 星光爆裂 | 5×3 / 10 线 | **双向赔付**（每条线左右各判一次）；星芒 WILD 只落在 2/3/4 轴，出现即整轴展开并获 3 次免费重旋，重旋中再出新 WILD 则次数重置；星云散射 8/12/16 次免费旋转（黏性扩张 WILD） | 96.2% |
| `treasure-hunter` 宝藏猎人 | 5×3 / 20 线 | 雪崩连锁（倍率阶梯 `1/1/2/3/5/8`）× 黏性扩张 WILD（1~3 轴低概率展开）× 免费旋转倍率递进；3+ 宝藏箱散射触发 8/12/16 次，可再触发 | 96% |
| `sakura-tale` 樱花物语 | 5×3 / 10 线 | **双向赔付** × 雪崩连锁（倍率阶梯 `1/1/2/3/5`）× 扩展符号免费旋转；神社铃铛散射 10/12/15 次，进入时随机选定扩展符号，出现 ≥2 个整轴展开后双向结算可触发连锁 | 96% |
| `mega-ways-lite` 裂空通路 | 5×3 / 243 WAYS | **通路制**（不设固定线，左起相邻轴同符号即中奖，通路数 = 各轴命中格数之积）× 雪崩连锁（倍率在免费旋转中 `carryInFreeSpins` 跨轮累积）；刻意不使用倍率 WILD 以抑制方差；焰核散射触发免费旋转 | 96% |
| `fruit-fiesta` 果盘嘉年华 | 3×3 / 5 线 | SCATTER（彩钻）触发 10 次免费旋转，起始 2× 全局倍率且可再触发；免费旋转使用独立 `reelSet`（WILD/7 权重上调）；倍率 WILD（x2/x3） | 95.5% |
| `book-of-nebula` 星海遗书 | 5×3 / 20 线 | 星海遗书散射触发免费旋转，进入时随机选定**扩展符号**，出现 ≥2 个即整轴展开；免费旋转可再触发，并使用独立 `reelSet` | 95.5% |

### 实测 RTP（`npm run simulate -- <gameId> 200000`）

```
book-of-nebula    rtp=0.9593  target=0.955  max=298.00x
book-of-ra        rtp=0.9553  target=0.955  max=247.69x
classic-fruits    rtp=0.9386  target=0.95   max=350.10x
cosmic-crush      rtp=0.9604  target=0.96   max=710.25x
dragon-fortune    rtp=0.9569  target=0.96   max=260.31x
fruit-fiesta      rtp=0.9547  target=0.955  max=562.61x
inferno-jackpots  rtp=0.9432  target=0.96   max=234.00x
mega-ways-lite    rtp=0.9601  target=0.96   max=1308.83x
neon-fruits       rtp=0.9596  target=0.96   max=2507.92x
panda-fortune     rtp=0.9544  target=0.96   max=103.20x
pharaoh-gold      rtp=0.9517  target=0.96   max=235.00x
sakura-tale       rtp=0.9583  target=0.96   max=520.42x
starlight-burst   rtp=0.9622  target=0.962  max=78.27x
treasure-hunter   rtp=0.9582  target=0.96   max=321.60x
```

十四台机台实测 RTP 均落在 `target ± tolerance`（20 万轮蒙特卡洛）。可用 `npm run site:check` 之外的新脚本 `node scripts/tune-check.mjs [spins]` 一次快筛全部机台（默认 20 万轮，高波动机台轮数不足时方差可达 ±3%）。

---

## 8. 静态站点（`site/`）与生产部署

`site/` 是**自包含单文件**静态站点：内联 CSS/JS、零外部请求、首页 54.6 KB，内含免后端的「星光爆裂」试玩器，已做 SEO 与 GEO（生成式引擎优化）处理，可直接托管到任意静态平台。

### 8.1 文件结构

```
site/
├── index.html            # 单文件站点（语义化结构 + 完整 meta + JSON-LD + 内联试玩器）
├── 404.html              # 404 页（noindex，规范链接回首页）
├── robots.txt            # 允许索引 + Sitemap 声明
├── sitemap.xml           # URL 与 og:image 声明
├── llms.txt              # 面向 AI 爬虫的纯文本事实摘要（GEO）
├── manifest.webmanifest  # PWA 清单（可安装、主题色）
├── .nojekyll             # 关闭 GitHub Pages 的 Jekyll 处理
├── games/                # 轻量静态小游戏（每款一个自包含单文件）
│   ├── neon-2048/index.html
│   ├── neon-snake/index.html
│   ├── neon-breakout/index.html
│   └── starlight-burst/index.html
└── assets/               # 社交分享封面 1200×630（首页懒加载）
    ├── og-cover.png      # 首页 / 星光爆裂
    ├── og-2048.png
    ├── og-snake.png
    └── og-breakout.png
```

### 8.1.1 轻量静态游戏（免安装、单文件、离线可玩）

| 游戏 | 路径 | 体积 | 操作 | 要点 |
| --- | --- | --- | --- | --- |
| 霓虹 2048 | `/games/neon-2048/` | 22.4 KB | 方向键 / WASD / 滑动 | 合并同数字拼出 2048，支持撤销一步、最高分本地保存 |
| 霓虹贪吃蛇 | `/games/neon-snake/` | 20.4 KB | 方向键 / WASD / 滑动 | 吃光点变长，撞墙或撞自身结束，可暂停，随长度提速 |
| 霓虹打砖块 | `/games/neon-breakout/` | 22.4 KB | 鼠标 / 方向键 / 触屏 | 挡板反弹小球清砖，3 条命，可暂停，随进度提速 |
| 星光爆裂 | `/games/starlight-burst/` | 26.0 KB | 点击 / 空格 | 5×3、10 线双向赔付，WILD 整轴展开 + 3 次免费重旋 |

每款游戏页均含「怎么玩 / 操作方式 / 技巧 / 常见问题」四节，对应锚点 `#rules` / `#controls` / `#tips` / `#faq`，便于生成式引擎定位到段落级引用。

四款均为自研实现（MIT），HTML/CSS/JS 全内联：零外部请求、无追踪、无广告、断网可玩；键盘可完整操作，状态通过 `aria-live` 播报，尊重 `prefers-reduced-motion`，支持明暗双主题。选题渠道：itch.io 开源标签、GitHub Trending、Ludum Dare、Simple Game Tutorials（页面内已注明灵感来源，未复制第三方代码）。

分享卡片由 `npm run site:og` 零依赖生成（自带 PNG 编码器，23~30 KB/张，`scripts/og-cards.mjs`）。

### 8.2 SEO / GEO 处理

| 维度 | 处理 |
| --- | --- |
| 基础 meta | `title`(35 字) / `description`(127 字) / `keywords` / `robots`(max-image-preview:large) / `canonical` / `theme-color` |
| Open Graph | `og:type/site_name/title/description/url/image/image:width/height/alt/locale` |
| Twitter Card | `summary_large_image` + title/description/image/image:alt |
| 结构化数据 | 首页 `@graph`：Organization + WebSite + WebPage + BreadcrumbList + SoftwareApplication + ItemList(14 台 VideoGame) + ItemList(4 款小游戏) + FAQPage；游戏页：WebPage + VideoGame + BreadcrumbList + FAQPage |
| GEO（AI 摘要友好） | 首屏 TL;DR 定义段、`<dl>` 事实列表、表格化规格、完整问句式 FAQ 小标题、`llms.txt`（含机台清单、引用建议与段落锚点说明）、游戏页 `#faq` 与 `FAQPage` 一一对应 |
| 语义化 | `header/nav/main/section/footer` + 唯一 `h1` + 每节 `aria-labelledby` + 表格 `caption/scope` |
| 可访问性 | 跳转链接、`aria-live` 结果播报、`prefers-reduced-motion`、明暗双主题、`:focus-visible` 焦点环；明暗两主题文字对比度均按 WCAG AA（≥4.5:1）实测 |
| 性能 | 零外部请求、首页内联 54.6 KB、封面图懒加载（280 KB，调色板量化压缩）、无阻塞脚本 |
| 托管可移植性 | 站内导航全部为相对路径，可直接部署到任意根域名静态托管（Cloudflare / EdgeOne / Vercel / 自建） |

自检：`npm run site:check`（284 项：meta / OG / Twitter / JSON-LD 可解析性 / 语义 / 可访问性 / 明暗主题对比度实测 / 站内链接可移植性 / 外部依赖 / 体积）。该检查已在 `.github/workflows/pages.yml` 中作为部署前门禁强制执行，改动 `site/**` 与 `scripts/**` 的 PR 同样受约束。

### 8.3 部署命令

```bash
npm run site:serve          # 本地预览 http://127.0.0.1:8080
npm run site:check          # SEO / GEO / 可访问性 / 对比度 / 链接可移植性自检（284 项）
npm run site:build          # 生成 dist/index.min.html（单文件镜像，约 27 KB）
npm run site:smoke          # 线上冒烟：首页 + 4 个游戏页 + llms.txt / sitemap / robots / 封面图

# GitHub Pages：推送 main 即由 .github/workflows/pages.yml 发布 site/
# Cloudflare Pages
npx wrangler pages deploy site --project-name=blender-mcp-slots
# Vercel（需 VERCEL_TOKEN）
npx vercel deploy site --prod
# EdgeOne Pages（单文件渠道）
node scripts/deploy-edgeone.mjs
```

线上地址：<https://vip-4.github.io/blender-mcp-slots/>

线上冒烟：`npm run site:smoke`（检查 5 个页面 + 4 张分享卡片是否 200，并校验结构化数据是否在线）。

### 8.4 已发布地址

| 渠道 | 地址 | 状态 |
| --- | --- | --- |
| GitHub Pages（主站） | https://vip-4.github.io/blender-mcp-slots/ | ✅ 全站 5 个页面 |
| EdgeOne Pages · 霓虹 2048 | https://mcp.edgeone.site/share/cFib0P82W2uLq880SCIo9 | ✅ 单文件镜像 |
| EdgeOne Pages · 霓虹贪吃蛇 | https://mcp.edgeone.site/share/THXrW_9qh0Sz6vrFLfQEr | ✅ 单文件镜像 |
| EdgeOne Pages · 霓虹打砖块 | https://mcp.edgeone.site/share/XeSKOAPwtuFHoT02SsjSC | ✅ 单文件镜像 |

> 说明：EdgeOne Pages 的托管域名对「老虎机 / 博彩」类内容有策略限制（首页与星光爆裂会被拒绝并返回 self-hosted 指引）；该类页面使用 GitHub Pages / Cloudflare Pages / Vercel，或自建 Pages MCP 服务。
