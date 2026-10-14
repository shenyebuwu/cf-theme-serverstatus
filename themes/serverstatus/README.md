# cf-theme-serverstatus

为 [CF-Server-Monitor](https://github.com/huilang-me/CF-Server-Monitor) 适配的独立 Vue 3 主题，复现 [monitor-theme-serverstatus](https://github.com/monitor-probe/monitor-theme-serverstatus) 的经典紧凑表格、条纹行、绿黄红进度条与深浅色风格。不是对原 React 主题改几个接口的直接移植；数据层按 CFSM 协议重写，原后台和探针不变。

适配基线：CFSM `fa60c60`（2.8.7 Beta1），参考主题 `467e7cc`（1.5.1）。主题源码位于本仓库 `themes/serverstatus/`，依赖三个上级公共工具模块，请保留完整仓库结构运行。

## 已实现

- 首页：服务器分组、搜索、在线统计、地区/系统、运行时间、到期、负载、上下行速度、CPU/内存/磁盘、月流量额度。
- 展开行：机器信息、计费、GPU、标签，以及列表已返回的延迟/丢包窗口，不逐台查询历史。
- 详情页 `/#/server/<id>?site=<index>`：默认 10 分钟，支持 30 分钟、1/6/12 小时、1/2/4/7 天；资源、网络、延迟、丢包、磁盘 IO、GPU 图表。
- 标题、语言、默认深浅色、自定义 Ping 名称来自 `/api/config`；首页显示开关来自 `/api/servers.sysConfig`；Worker 托管时背景、favicon、custom head/script、CSP 由原后端注入。
- 中文、英文、西班牙语；桌面与移动端自适应；按钮与展开行支持键盘操作。
- JWT、Turnstile、同域 Cookie / 跨域 JWT WebSocket、多 Worker 聚合、每站独立订阅 ID。
- 无 REST 定时轮询；WebSocket 增量合并，每秒最多更新一次；隐藏页关闭连接，可见后补一次当前页 REST；指数退避最多 10 次；遵守后台连接时限，超时后需明确继续。

GPU/磁盘 IO 缺失时不显示对应图表；`false`/未返回的探测值隐藏，`null` 保留超时图例，`0` 正常显示。RAM、磁盘容量按 MB 转换，流量与速度按 B/B/s，CFSM 的 `traffic_limit` 按 GB 换算。

## 本地开发与构建

Node.js 24 + pnpm 11.25.0：

```powershell
cd themes/serverstatus
pnpm install --frozen-lockfile
pnpm test
pnpm build
```

输出 `dist/index.html` 与 `dist/assets/`，无后台、旗帜或系统图标副本。`dist/` 为生成目录，不提交源码分支。

开发时启动本地 CFSM Worker，默认代理至 `http://127.0.0.1:8787`：

```powershell
$env:CFSM_DEV_PROXY = "https://你的 Worker 域名"
pnpm dev
```

浏览器打开 `http://127.0.0.1:5174`。非公开站点的本地代理不能替代真实域名登录 Cookie；此模式主要用于公开站点调试，私有站建议同域主题预览或静态部署联调。

## 部署方式 A：CFSM 后台自定义主题（推荐）

1. 将当前源码推送到你自己的 GitHub 仓库，主分支使用 `main` 或 `master`。
2. 保持仓库 Secret `API_BASE` 为空，产物会访问 Worker 同源接口；不需要修改 Worker 或 Agent。
3. 在 Settings → Actions → General 开启工作流读写权限。`Build ServerStatus Theme` 会运行测试并把产物追加提交到 `dist` 分支。
4. 打开 CFSM 原后台 → 主题商店 → 自定义主题 URL，填入 **你的仓库**：

   ```text
   https://github.com/shenyebuwu/cf-theme-serverstatus/tree/dist
   ```

5. 先预览，再应用。也可以将 `dist` 替换为该分支上的完整 commit SHA 锁定版本。

不要填写原 `monitor-theme-serverstatus` 仓库地址，也不要将它的 `theme.tar.gz` 上传到 CFSM；那是另一监控系统的主题协议。

构建 workflow 保留源码 commit 说明与 `dist` 历史，不使用 force push。Actions 也保留 `cf-theme-serverstatus` 静态产物 artifact。工作流只有推送指定分支或手动触发时运行。

## 部署方式 B：GitHub Pages 静态前台

在仓库 Secrets 配置：

| Secret | 说明 |
| --- | --- |
| `API_BASE` | 必填，Worker HTTPS origin；多个用英文逗号分隔，不带路径 |
| `TITLE` | 可选，后端未设置标题时的回退标题 |
| `BACKGROUND_IMAGE` / `BACKGROUND_IMAGE_MOBILE` | 可选，静态前台背景图 |
| `CSP_API` / `CSP_STATIC` | 可选，额外的 API / 静态资源 HTTPS origin 白名单 |

运行 `Build ServerStatus Theme`，在 Settings → Pages 选择 **Deploy from a branch → dist → /(root)**。此项目同时保留上游 `Deploy to GitHub Pages` 工作流；它构建的是默认主题，使用 ServerStatus Pages 时请禁用该上游 Pages 工作流，避免发布冲突。

每个源 Worker 必须添加 `CORS_ALLOWED_ORIGINS=https://你的用户名.github.io`；自定义域名填写实际 origin。旗帜/OS 图标读取对应 Worker 的 `/flags/`、`/os-icons/`，不从 Pages 根目录加载。

静态前台的背景与 CSP 从 Secrets 构建注入，不会动态获取后台的 custom head/script（配置接口不返回这些字段）。公开只读展示推荐使用同域方式 A：跨域私有站还需在前台 origin 的 `localStorage.jwt_token` 中具备有效 JWT，Worker 后台登录不能自动把 localStorage 跨域同步到 Pages。不要把 JWT 或 `API_SECRET` 写入仓库、HTML 或 Secrets `API_BASE`。

## 测试与边界

```powershell
pnpm exec playwright install chromium
pnpm test:browser
```

- `pnpm test`：13 项单元测试，覆盖配置缓存、鉴权头、错误清理、字段/单位/三态语义、增量合并、节流、订阅、退避和超时。
- `pnpm test:browser`：真实 Chromium + 模拟 CFSM API/WS/Turnstile，覆盖桌面/手机、图表、路由、详情直达、隐藏/恢复、多站跨域 JWT、公开/私有 × Turnstile 开/关四组合及超时暂停。截图生成于忽略目录 `artifacts/`。
- 可用 `BROWSER_EXECUTABLE` 指定本机 Chrome 路径。浏览器验证使用的模拟数据只存在于测试文件，不进入生产主题。
- **真实 Cloudflare Turnstile、真实 JWT/Cookie 与 Worker 部署尚需联调**；模拟验证不等同于生产验证。上线前请在真实后台逐一验证四组合。
- 本次额外运行上游回归测试：62 项通过、Agent 配置测试通过；4 个 D1/历史测试文件因上游未声明可直接导入的 `miniflare` 依赖而未执行。主题不改动后端，主题自己的测试与构建均通过。
- 原后端详情接口只返回 `long_history_points`，不返回首页显示开关。先进入首页后再进入详情会沿用首页开关；直接进入详情时这些开关没有数据，采用默认展示。这是当前 CFSM API 的限制，主题不会为此额外查询列表。
- 若显示加载错误，检查开发者工具 Network、Worker CORS、CSP 与主题 URL；不会静默跳回默认皮肤。管理与登录只跳原 `/admin#/admin`，不实现自制后台。

## 许可与致谢

适配代码遵循 MIT。配色与布局参考 `monitor-probe/monitor-theme-serverstatus`，原作者版权声明保留于本目录 `LICENSE`。CFSM 的复用工具与默认静态图标遵循仓库根目录 `LICENSE`。
