# 云端接口（可选）

[English](README.md) · [简体中文](README.zh-CN.md)

不配置也能玩。要使用云备份或每日榜时，把 `cloud.json` 里的 `apiBase` 填成 Worker 地址。

## 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| PUT | `/v1/backup` | 上传进度，请求头带 `X-Sync-Key` |
| GET | `/v1/backup` | 拉取进度 |
| POST | `/v1/daily` | 提交每日成绩 |
| GET | `/v1/daily?day=&diff=` | 查看排行榜 |

密钥至少 8 位，只保存在本机。服务端保存的是哈希。

## 部署

1. 使用 Cloudflare Worker，代码见 `worker.js`
2. 绑定 KV：`NG_KV`
3. 把站点 `cloud.json` 的 `apiBase` 指向该 Worker

本地试用：打开页面并加上 `#mockCloud=1`。
