# 云 API（B 档，可选）

前端默认**完全离线可玩**。只有配置了 `apiBase` 才会启用云备份与每日榜。

## 配置

编辑站点根目录 `cloud.json`：

```json
{ "apiBase": "https://your-worker.example.com" }
```

或在游戏「设置 → 在线」里填写同步端点与同步密钥（至少 8 位）。密钥只存在你的浏览器；服务端只存哈希。

## Cloudflare Worker

1. 新建 Worker，粘贴 `worker.js`
2. 绑定 KV：`NG_KV`
3. 部署后把 `apiBase` 指到 Worker 根地址（不要尾斜杠）
4. 若用 OpenShip / 反代，也可把路径挂到同域 `/api`，则 `apiBase` 填 `https://你的站/api`

## 接口摘要

| 方法 | 路径 | 说明 |
|------|------|------|
| PUT | `/v1/backup` | 上传 `{ settings, stats, at }`，头 `X-Sync-Key` |
| GET | `/v1/backup` | 拉取备份 |
| POST | `/v1/daily` | 提交每日成绩 |
| GET | `/v1/daily?day=&diff=` | 排行榜 |

弱校验：用时范围、日期格式；不做权威发牌、不做实时对战。

## 本地开发 Mock

打开页面时加 `#mockCloud=1`，会用 `localStorage` 模拟上述接口，便于无 Worker 时自测。
