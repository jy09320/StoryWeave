# StoryWeave Docker 一键运行说明

## 1. 准备环境变量
将 [`./.env.docker.example`](.env.docker.example) 复制为 `.env.docker`，按需填写：

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- 如需修改端口，可调整 `FRONTEND_PORT`、`BACKEND_PORT`、`POSTGRES_PORT`
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

- 前端：`http://localhost:8080`
- 后端健康检查：`http://localhost:8000/api/health`
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
当前仓库里还没有自动建表或 Alembic 迁移执行逻辑，因此 Docker 启动后，若数据库为空，后端在首次访问项目/章节接口时可能因缺表失败。

这意味着：
- 现阶段 Docker 化已完成“容器一键启动”骨架
- 若要真正做到完全开箱即用，还需要补一层数据库初始化流程，例如：
  - 启动时自动执行建表
  - 或补充 Alembic 迁移并在容器启动时运行

下一步最合理的增强，是把数据库初始化也接进 [`docker-compose.yml`](docker-compose.yml) 与 [`backend/app/core/database.py`](backend/app/core/database.py)，这样才是完整意义上的“一键运行”。
