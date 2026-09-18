# 云端接口（可选）

不配也能玩。要云备份或每日榜时，把 `cloud.json` 里的 `apiBase` 填成 Worker 地址。

## 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| PUT | `/v1/backup` | 上传进度，头里带 `X-Sync-Key` |
| GET | `/v1/backup` | 拉取进度 |
| POST | `/v1/daily` | 提交每日成绩 |
| GET | `/v1/daily?day=&diff=` | 看榜 |

密钥至少 8 位，只存在你本机；服务端存的是哈希。

## 部署

1. 用 Cloudflare Worker，代码见 `worker.js`
2. 绑定 KV：`NG_KV`
3. 把站点 `cloud.json` 的 `apiBase` 指过去

本地试：打开页面加 `#mockCloud=1`。
