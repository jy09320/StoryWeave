# StoryWeave Docker 一键运行说明

## 1. 准备环境变量
将 [`./.env.docker.example`](.env.docker.example) 复制为 `.env.docker`，按需填写：

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- 如需修改端口，可调整 `FRONTEND_PORT`、`BACKEND_PORT`、`POSTGRES_PORT`
- 如需从 Docker、局域网地址或非默认端口访问后端，可调整 `BACKEND_CORS_ORIGINS`（使用英文逗号分隔多个来源）
- 如需使用代理或兼容网关，可填写 `OPENAI_BASE_URL`、`ANTHROPIC_BASE_URL`

示例：

```bash
a copy .env.docker.example .env.docker
```

Windows `cmd` 可使用：

```bat
copy .env.docker.example .env.docker
```

## 2. 一键启动
在项目根目录执行：

```bash
docker compose --env-file .env.docker up --build -d
```

启动后默认访问：

- 前端：`http://localhost:3001`
- 后端健康检查：`http://localhost:8001/api/health`
- PostgreSQL：`localhost:5432`

## 3. 停止服务

```bash
docker compose --env-file .env.docker down
```

如果需要同时删除数据库卷：

```bash
docker compose --env-file .env.docker down -v
```

## 4. 当前方案说明
- [`./docker-compose.yml`](docker-compose.yml) 编排了前端、后端、PostgreSQL 三个服务
- [`./frontend/Dockerfile`](frontend/Dockerfile) 使用 Node 构建 Vite 静态资源，再由 Nginx 提供服务
- [`./frontend/nginx/default.conf`](frontend/nginx/default.conf) 将 `/api/` 代理到后端容器，并兼容 React Router SPA 路由刷新
- [`./backend/Dockerfile`](backend/Dockerfile) 使用 Uvicorn 启动 FastAPI
- 前端通过 [`VITE_API_BASE_URL`](frontend/src/lib/api-client.ts:3) 固定为 `/api`，因此浏览器只需访问前端地址即可

## 5. 当前限制
当前后端已在应用启动时通过 [`init_db()`](backend/app/core/init_db.py:7) 自动执行 [`Base.metadata.create_all`](backend/app/core/init_db.py:11)，因此在空数据库场景下可以自动建表，Docker 已具备基础“一键启动 + 自动初始化”能力。

当前仍然存在的限制主要是：
- 目前使用的是 SQLAlchemy `create_all` 自动建表方案，还没有引入 Alembic 迁移体系
- 当模型结构在后续迭代中发生变化时，现有数据库不会自动执行结构升级
- 若进入多人协作或正式环境，仍建议补齐迁移脚本、版本管理与更稳健的启动检查

因此，下一步更合理的增强方向是：
- 引入 Alembic 管理数据库 schema 演进
- 在容器启动流程中加入显式迁移步骤
- 为健康检查补充数据库连接与初始化状态校验
