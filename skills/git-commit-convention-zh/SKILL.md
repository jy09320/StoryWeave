---
name: git-commit-convention-zh
description: 规范 Git 提交信息，要求严格使用“type：中文描述”格式。用于提交代码前统一 commit message 写法。
---

# Git Commit Convention ZH

提交信息必须严格遵循以下格式：

```text
type：中文描述
```

## 强制规则

1. 必须使用英文小写 `type`
2. 分隔符必须使用中文全角冒号 `：`
3. 冒号后必须直接接中文描述
4. 中文描述应简洁明确，聚焦本次提交的核心变更
5. 不得写英文句子式描述
6. 不得使用半角冒号 `:`
7. 不得省略 `type`

## 允许的 type

- `feat`：新功能
- `fix`：修复问题
- `refactor`：重构
- `style`：样式或格式调整
- `docs`：文档更新
- `test`：测试相关
- `build`：构建或依赖变更
- `chore`：杂项维护
- `perf`：性能优化
- `ci`：持续集成相关

## 示例

正确示例：

```text
feat：升级写作工作台体验
fix：修复章节状态切换异常
refactor：重构编辑器 AI 面板布局
docs：补充 MVP 下一阶段规划
```

错误示例：

```text
feat: upgrade writing workspace
Feat：升级工作台
升级写作工作台体验
feat：update workspace layout
```

## 使用要求

在执行 Git 提交前，先将提交信息检查一遍：

- 是否为 `type：中文`
- 是否使用了全角冒号
- 是否准确概括本次提交

如果不符合，必须先改写后再提交。