# StoryWeave 生产部署

这套部署目录用于 Linux 服务器公网部署，基于：

- Docker Compose
- Caddy 自动签发和续期 HTTPS 证书
- PostgreSQL
- 现有前后端镜像构建流程

## 1. 前置条件

部署前需要满足：

- 服务器已安装 Docker 和 Docker Compose
- 域名 `A` 记录已指向服务器公网 IP
- 服务器安全组/防火墙已放行 `80` 和 `443`

如果 `80/443` 没放开，Caddy 无法完成 Let's Encrypt 验证，HTTPS 不会签发成功。

## 2. 初始化环境变量

在仓库根目录执行：

```bash
chmod +x deploy/production/scripts/*.sh
./deploy/production/scripts/init-env.sh
```

然后编辑：

[`deploy/production/.env`](D:/Project/StoryWeave/deploy/production/.env)

至少要改这些值：

- `APP_DOMAIN=你的域名`
- `ACME_EMAIL=你的邮箱`
- `OPENAI_API_KEY=...` 或 `ANTHROPIC_API_KEY=...`
- `BACKEND_CORS_ORIGINS=https://你的域名`

## 3. 启动部署

```bash
./deploy/production/scripts/deploy.sh
```

首次启动时，Caddy 会自动申请证书。DNS、生效时间和防火墙正常的情况下，几分钟内即可完成。

## 4. 常用命令

启动或更新：

```bash
./deploy/production/scripts/deploy.sh
```

查看日志：

```bash
./deploy/production/scripts/logs.sh
./deploy/production/scripts/logs.sh caddy
./deploy/production/scripts/logs.sh backend
```

停止服务：

```bash
./deploy/production/scripts/down.sh
```

备份数据库：

```bash
./deploy/production/scripts/backup-db.sh
```

## 5. 服务结构

- `caddy`：公网入口，处理 HTTPS 和反向代理
- `frontend`：静态前端
- `backend`：FastAPI
- `db`：PostgreSQL

公网只暴露：

- `80`
- `443`

数据库不对公网开放。

## 6. SSL 方案说明

这里没有用手工证书脚本，而是用 Caddy 自动处理：

- 自动申请 Let's Encrypt 证书
- 自动续期
- 自动处理 HTTP 到 HTTPS

这比手工 `certbot + nginx` 更省事，尤其适合你这种 Docker 单机部署。

## 7. 故障排查

如果 HTTPS 没签下来，优先检查：

1. 域名是否已经正确解析到服务器 IP
2. `80/443` 是否已放行
3. 域名是否被 CDN 或其他代理拦住了验证
4. `APP_DOMAIN` 和 `BACKEND_CORS_ORIGINS` 是否写对

看 Caddy 日志：

```bash
./deploy/production/scripts/logs.sh caddy
```
