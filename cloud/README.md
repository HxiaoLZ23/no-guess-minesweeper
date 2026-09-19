# Cloud API (optional)

[English](README.md) · [简体中文](README.zh-CN.md)

The game works without this. To use cloud backup or the daily board, set `apiBase` in `cloud.json` to the Worker address.

## Endpoints

| Method | Path | Purpose |
|------|------|------|
| PUT | `/v1/backup` | Upload progress. Send `X-Sync-Key` in the header. |
| GET | `/v1/backup` | Download progress. |
| POST | `/v1/daily` | Submit today's result. |
| GET | `/v1/daily?day=&diff=` | Read the board. |

The key must be at least 8 characters. It stays on this device. The server stores only a hash.

## Deploy

1. Use a Cloudflare Worker. The code is in `worker.js`.
2. Bind a KV namespace: `NG_KV`.
3. Point `apiBase` in the site's `cloud.json` at that Worker.

To try it locally, open the page with `#mockCloud=1`.
