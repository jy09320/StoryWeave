# Phase 1 手工验收清单

## 使用说明
- 本清单用于 [`PLAN.md`](PLAN.md) 中 Phase 1 的手工验收收口
- 建议按“通过 / 失败 / 阻塞”逐项记录
- 若失败，应补充复现步骤、截图位置、接口报错与修复结论

## 一、环境与基础可用性

### 1. 容器与服务启动
- [ ] [`docker compose config`](docker-compose.yml) 可正常通过
- [ ] [`docker compose build`](docker-compose.yml) 可正常完成
- [ ] [`docker compose up -d db backend frontend`](docker-compose.yml) 可正常启动
- [ ] 后端健康检查 [`/api/health`](backend/app/main.py) 返回成功
- [ ] 前端页面可正常打开且无白屏

### 2. 基础构建验证
- [ ] [`npm run build`](frontend/package.json) 可正常通过
- [ ] [`python -m compileall`](backend/app) 可正常通过

## 二、项目管理验收

### 1. 项目创建
- [ ] 在 [`DashboardPage`](frontend/src/pages/dashboard-page.tsx) 成功创建项目
- [ ] 创建后项目列表立即刷新
- [ ] 项目标题、类型、描述、默认模型设置展示正确

### 2. 项目编辑
- [ ] 在 [`DashboardPage`](frontend/src/pages/dashboard-page.tsx) 成功编辑项目
- [ ] 修改后卡片内容即时更新
- [ ] 非法输入时能看到错误提示

### 3. 项目删除
- [ ] 能成功删除项目
- [ ] 删除后项目从列表中消失
- [ ] 删除项目后无残留异常跳转或报错

## 三、章节管理验收

### 1. 章节创建
- [ ] 在 [`ProjectWorkspacePage`](frontend/src/pages/project-workspace-page.tsx) 成功创建章节
- [ ] 新章节自动出现在章节列表中
- [ ] 章节初始顺序正确

### 2. 章节切换与进入编辑器
- [ ] 在 [`ProjectWorkspacePage`](frontend/src/pages/project-workspace-page.tsx) 点击章节可进入编辑器
- [ ] 跳转到 [`ProjectEditorPage`](frontend/src/pages/project-editor-page.tsx) 后数据加载正确
- [ ] 标题、状态、正文、备注均显示对应章节内容

### 3. 章节排序
- [ ] 能在 [`ProjectWorkspacePage`](frontend/src/pages/project-workspace-page.tsx) 对章节上移/下移
- [ ] 排序后刷新页面，顺序仍保持正确

### 4. 章节删除
- [ ] 能成功删除章节
- [ ] 删除后其余章节顺序自动重排
- [ ] 删除后页面状态无异常

## 四、编辑器验收

### 1. 基础编辑
- [ ] 在 [`ProjectEditorPage`](frontend/src/pages/project-editor-page.tsx) 可编辑标题
- [ ] 可修改章节状态
- [ ] 可编辑正文
- [ ] 可编辑备注
- [ ] 字数统计会随正文变化而更新

### 2. 保存行为
- [ ] 修改正文后会触发自动保存
- [ ] 自动保存成功后状态提示恢复为“内容已同步”
- [ ] 点击“手动保存”可成功保存
- [ ] 手动保存与自动保存不会出现明显竞态异常

### 3. 未保存离开提醒
- [ ] 修改后直接刷新页面会出现未保存提醒
- [ ] 修改后点击站内跳转链接会出现未保存提醒
- [ ] 取消离开后当前编辑内容仍保留
- [ ] 自动保存完成后离开页面不再出现误提醒

## 五、AI 续写验收

### 1. 基础生成
- [ ] 在 [`ProjectEditorPage`](frontend/src/pages/project-editor-page.tsx) 中可选择模型提供商
- [ ] 可选择对应模型
- [ ] 输入续写指令后可成功发起 AI 续写
- [ ] 页面能看到流式生成结果

### 2. 结果处理
- [ ] 点击“停止生成”后页面停止继续追加结果
- [ ] 点击“丢弃结果”后生成结果被清空
- [ ] 点击“追加到正文”后结果成功回填到正文
- [ ] 回填后可继续保存且无异常

### 3. 异常处理
- [ ] 在模型配置错误或后端异常时，页面有明确报错提示
- [ ] 生成失败后页面不会卡死在“生成中”状态

## 六、版本历史验收

### 1. 历史记录生成
- [ ] 多次修改并保存同一章节后，可生成历史版本
- [ ] 打开“版本历史”弹窗能看到历史快照列表
- [ ] 历史记录按最新时间倒序展示

### 2. 历史记录查看
- [ ] 每条记录可查看时间、说明、字数、正文预览
- [ ] 无历史记录时展示空状态
- [ ] 接口异常时展示错误状态并可重试

### 3. 历史版本恢复
- [ ] 点击“恢复到正文”后，对应历史版本内容会回填到正文
- [ ] 恢复后弹窗自动关闭
- [ ] 恢复后章节进入未保存状态
- [ ] 恢复后的内容可被自动保存或手动保存

## 七、Phase 1 收口结论
- [ ] 项目管理主链路已通过手工验收
- [ ] 章节管理主链路已通过手工验收
- [ ] 编辑器保存主链路已通过手工验收
- [ ] AI 续写主链路已通过手工验收
- [ ] 版本历史查看/恢复已通过手工验收
- [ ] 未保存离开提醒已通过手工验收
- [ ] 可进入 Phase 1 收口评审

## 八、遗留问题记录
- 问题 1：
- 问题 2：
- 问题 3：

## 九、下一步建议
- 基于本清单验收结果决定是否继续推进 [`PLAN.md`](PLAN.md) 中的 Wangeditor 接入
- 若 Phase 1 验收通过，则转入 Phase 2 的角色库与世界观系统设计
