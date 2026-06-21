# 🔁 SubConverter · 订阅节点转换网站

一个**功能齐全、零外部依赖**的订阅节点转换工具。可将各类代理节点链接 / 订阅地址，一键转换为主流客户端可直接使用的配置文件。

仅用 Node.js 内置模块实现，`node server.js` 即可启动，开箱即用，适合自托管。

---

## ✨ 支持的节点类型（输入）

涵盖目前所有主流协议：

| 协议 | URI 前缀 | 协议 | URI 前缀 |
| --- | --- | --- | --- |
| Shadowsocks | `ss://` | TUIC (v5) | `tuic://` |
| ShadowsocksR | `ssr://` | WireGuard | `wireguard://` / `wg://` |
| VMess | `vmess://` | HTTP / HTTPS | `http://` / `https://` |
| VLESS（含 Reality / XTLS / gRPC / WS） | `vless://` | SOCKS5 | `socks://` / `socks5://` |
| Trojan | `trojan://` | Snell | `snell://` |
| Hysteria v1 | `hysteria://` | AnyTLS | `anytls://` |
| Hysteria2 | `hysteria2://` / `hy2://` | | |

输入支持：
- 单条 / 多条节点链接（每行一条）
- 整段 **Base64** 编码的订阅内容
- 远程**订阅地址**（由服务端抓取，多个用 `|` 分隔）

## 📦 支持的输出格式（目标）

| 目标 | 说明 |
| --- | --- |
| `clash` | Clash / Mihomo(Clash.Meta) 完整配置（含策略组与规则） |
| `clash-proxies` | 仅 Clash `proxies:` 列表 |
| `singbox` | sing-box 完整 JSON 配置（含 outbounds / route / dns） |
| `surge` | Surge 配置 |
| `quantumultx` | Quantumult X 配置 |
| `loon` | Loon 配置 |
| `v2ray` | V2Ray / 通用 Base64 订阅 |
| `links` | 明文节点链接 |
| `json` | 解析后的统一模型（便于调试） |

> 不同客户端对协议的支持程度不同。生成器会自动跳过目标客户端**不支持的协议**（例如 Surge 不支持 VLESS/SSR），并在统计中体现。

---

## 🚀 快速开始

```bash
cd subconverter
node server.js
# 默认监听 http://localhost:25500
```

可用环境变量：`PORT`（默认 25500）、`HOST`（默认 0.0.0.0）。

打开浏览器访问 `http://localhost:25500/` 即可使用网页界面。

### 运行自测

```bash
npm test    # 等价于 node test/run.js
```

---

## 🌐 接口说明

### 1. 网页界面 `GET /`
可视化操作：粘贴节点 / 填订阅地址 → 选目标格式 → 转换 / 复制 / 下载 / 生成订阅链接。

### 2. 订阅端点 `GET /sub`（供客户端直接订阅）

```
/sub?url=<订阅地址>&target=clash
```

| 参数 | 说明 |
| --- | --- |
| `url` | 远程订阅地址（可 Base64 编码；多个用 `|` 分隔） |
| `input` | 直接传入的节点链接文本（可与 url 同用） |
| `target` | 目标格式，默认 `clash` |
| `include` | 仅保留名称包含该关键字的节点 |
| `exclude` | 排除名称包含该关键字的节点 |
| `prefix` | 给所有节点名称加前缀 |

示例（直接填入 Clash 客户端的订阅栏）：

```
http://你的服务器:25500/sub?url=https%3A%2F%2Fexample.com%2Fsub&target=clash
```

该端点会返回带 `Content-Disposition` 与 `Profile-Update-Interval` 头的配置文件，客户端可直接识别并定时更新。

### 3. 转换 API `POST /api/convert`

请求体（JSON）：

```json
{
  "input": "vmess://...\ntrojan://...",
  "url": "https://example.com/sub",
  "target": "singbox",
  "options": { "includeKeyword": "香港", "excludeKeyword": "到期", "prefix": "🚀 " }
}
```

响应：

```json
{
  "output": "……生成的配置文本……",
  "count": 12,
  "total": 14,
  "byType": { "vmess": 5, "trojan": 4, "hysteria2": 3 },
  "errors": [ { "link": "...", "error": "..." } ]
}
```

### 4. 其它
- `GET /api/targets`：返回所有可用目标格式列表
- `GET /health`：健康检查

---

## 🧱 项目结构

```
subconverter/
├── server.js                 # HTTP 服务（内置 http 模块，零依赖）
├── src/
│   ├── util.js               # Base64 / URL / 订阅解码等工具
│   ├── yaml.js               # 轻量 YAML 序列化器（用于 Clash 输出）
│   ├── parsers.js            # 全部协议的链接解析器 → 统一内部模型
│   ├── convert.js            # 解析 + 生成 调度入口
│   └── generators/
│       ├── clash.js          # Clash / Mihomo
│       ├── singbox.js        # sing-box
│       ├── surge.js          # Surge
│       ├── quantumultx.js    # Quantumult X
│       ├── loon.js           # Loon
│       └── links.js          # V2Ray Base64 / 明文链接（模型 → URI）
├── public/                   # 前端（HTML / CSS / JS）
└── test/run.js               # 端到端自测（27 项）
```

### 设计要点
- **统一内部模型**：所有协议先解析为一套贴近 Clash/Mihomo 命名的统一对象，再由各生成器翻译为目标格式，新增协议 / 客户端互不影响。
- **零依赖**：不依赖 npm 包，自带 YAML 序列化器，任意网络环境均可直接运行。
- **健壮解析**：兼容 SIP002 与旧版 SS、URL-safe / 标准 Base64、缺失填充、IPv6 地址等边界情况。

---

## ⚖️ 免责声明

本工具仅用于学习交流与合法的网络调试用途。请遵守所在地法律法规及相关服务条款，因使用本工具产生的任何后果由使用者自行承担。
