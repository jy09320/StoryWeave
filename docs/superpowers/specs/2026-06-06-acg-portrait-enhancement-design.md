# ACG/同人项目角色肖像增强设计

日期: 2026-06-06
状态: 待审批

## 背景

当前角色肖像生成流程存在以下问题：
- 对于 ACG 二创/同人/影视衍生项目，图像生成模型无法有效还原原作角色形象
- 虽然代码中有 `source_work` 参考逻辑，但 prompt 过于笼统，效果不佳
- 用户没有填写角色外貌描述时，生成的肖像与原作角色差异很大
- 整体流程缺乏用户确认环节，生成结果不可控

## 目标

为非原创项目（ACG 二创、同人、影视衍生）实现"AI 补全外貌 + 用户确认 + 生成肖像"的完整流程，确保生成的肖像能准确还原原作角色形象。

## 设计方案

### 整体架构

```
用户点击"生成肖像"
    ↓
前端检查项目类型
    ↓ (非原创项目)
调用 /characters/{id}/enhance-description
    ↓
后端用 LLM 增强外貌描述
    ↓
前端弹窗展示增强结果
    ↓ (用户编辑/确认)
调用 /characters/{id}/portrait
    ↓
后端生成肖像
    ↓
返回肖像 URL
```

**涉及的变更**：
1. **后端**：新增 `/characters/{id}/enhance-description` 接口
2. **后端**：创建 `DescriptionEnhancementService` 服务
3. **前端**：修改肖像生成流程，增加弹窗确认步骤
4. **前端**：新增 `EnhanceDescriptionDialog` 组件

**数据流**：
- 输入：角色 ID + 项目类型 + 原作名称
- 增强接口输出：增强后的外貌描述文本
- 肖像接口输出：肖像图片 URL

### 后端增强服务

**新增服务**：`backend/app/services/description_enhancement_service.py`

```python
class DescriptionEnhancementService:
    async def enhance(
        self,
        character_name: str,
        current_description: str | None,
        source_work: str,
        project_type: str,  # acg / fanfiction / tv_movie
        api_key: str,
    ) -> str:
        """
        用 LLM 增强角色外貌描述。
        
        对于非原创项目，LLM 会根据原作知识补充角色的：
        - 发色、发型
        - 瞳色
        - 标志性服装
        - 特殊特征（如疤痕、配饰等）
        - 体型、身高等
        """
```

**Prompt 设计**：
```
你是一个专业的角色外貌描述助手。

项目类型：{project_type_display}
原作名称：《{source_work}》
角色姓名：{character_name}

当前外貌描述：
{current_description or "（暂无）"}

请根据《{source_work}》中 {character_name} 的官方形象，生成详细的外貌描述。
要求：
1. 包含发色、发型、瞳色、服装等关键特征
2. 描述应具体、准确，符合原作设定
3. 如果有当前描述，在其基础上补充原作特征
4. 使用中文，语言简洁生动

请直接输出外貌描述，不要添加额外说明。
```

**项目类型显示名称映射**：
- `fanfiction` → "同人"
- `acg` → "ACG 二创"
- `tv_movie` → "影视衍生"

**新增接口**：`/characters/{id}/enhance-description`
- 方法：POST
- 输入：无额外参数（从角色和项目信息自动获取）
- 输出：`{"enhanced_description": "..."}`
- 逻辑：
  1. 查询角色信息
  2. 查询角色关联的项目（非原创）
  3. 调用 `DescriptionEnhancementService.enhance()`
  4. 返回增强后的描述

### 前端交互设计

**新增组件**：`frontend/src/components/enhance-description-dialog.tsx`

**弹窗布局**：
```
┌─────────────────────────────────────────┐
│  ✨ AI 外貌增强                    [X]  │
├─────────────────────────────────────────┤
│  原作：《进击的巨人》                    │
│  角色：三笠·阿克曼                      │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ AI 生成的外貌描述：              │   │
│  │                                 │   │
│  │ 黑色长发，通常束成低马尾。       │   │
│  │ 深灰色瞳孔，眼神坚毅。          │   │
│  │ 身材纤细但肌肉线条明显。        │   │
│  │ 穿着调查兵团制服...             │   │
│  │                                 │   │
│  │ [可编辑文本区域]                │   │
│  └─────────────────────────────────┘   │
│                                         │
│  [重新生成] [跳过，直接生成]  [取消] [确认] │
└─────────────────────────────────────────┘
```

**按钮说明**：
- **重新生成**：重新调用 AI 增强接口，获取新的外貌描述
- **跳过，直接生成**：使用角色现有的外貌描述（如有）直接生成肖像
- **取消**：关闭弹窗，不生成肖像
- **确认**：使用增强后的描述生成肖像

**交互流程**：
1. 用户点击"生成肖像"按钮
2. 前端检查项目类型
3. 如果是非原创项目：
   - 调用 `/characters/{id}/enhance-description`
   - 显示加载状态
   - 弹窗展示增强结果
   - 用户可编辑文本
   - 点击"确认"后调用 `/characters/{id}/portrait`
4. 如果是原创项目：
   - 直接调用 `/characters/{id}/portrait`（保持现有逻辑）

**修改现有组件**：`frontend/src/pages/assets/characters-panel.tsx`
- 修改"生成肖像"按钮的点击处理逻辑
- 增加项目类型检查
- 集成弹窗组件

### 错误处理与边界情况

**错误场景及处理**：

1. **LLM 调用失败**
   - 后端返回错误信息
   - 前端显示 toast 提示："AI 增强失败，请稍后重试"
   - 用户可选择直接用现有描述生成肖像

2. **角色没有关联到任何项目**
   - 后端返回错误：`"角色未关联到任何项目"`
   - 前端提示用户先将角色添加到项目

3. **项目是原创类型**
   - 跳过增强步骤，直接生成肖像（保持现有逻辑）

4. **用户取消增强**
   - 关闭弹窗，不生成肖像
   - 用户可选择直接用现有描述生成（需要额外按钮）

5. **增强后的描述为空**
   - 后端返回错误：`"AI 未能生成有效的外貌描述"`
   - 前端提示用户手动填写

**边界情况**：

1. **角色已有详细外貌描述**
   - AI 会在现有基础上补充原作特征，不会完全覆盖

2. **原作名称为空**
   - 后端返回错误：`"请先在项目设置中填写原作名称"`
   - 前端提示用户填写

3. **LLM 返回内容过长**
   - 后端截断到合理长度（如 500 字符）
   - 前端显示截断提示

## 实现范围

### 新增文件
- `backend/app/services/description_enhancement_service.py`
- `frontend/src/components/enhance-description-dialog.tsx`

### 修改文件
- `backend/app/api/routes/characters.py` — 新增 enhance-description 接口
- `frontend/src/pages/assets/characters-panel.tsx` — 修改肖像生成流程
- `frontend/src/services/characters.ts` — 新增 enhanceDescription API 调用

### 不变的部分
- 现有的肖像生成逻辑（`portrait_service.py`）
- 项目类型和原作名称的数据模型
- 角色数据模型

## 验证标准

1. **功能验证**：
   - 非原创项目点击"生成肖像"时，弹窗显示 AI 增强的外貌描述
   - 用户可编辑增强后的描述
   - 确认后生成的肖像符合原作角色形象
   - 原创项目保持原有流程不变

2. **错误处理验证**：
   - LLM 调用失败时显示友好提示
   - 角色未关联项目时提示用户
   - 原作名称为空时提示用户填写

3. **边界情况验证**：
   - 角色已有外貌描述时，AI 在现有基础上补充
   - 增强后的描述长度合理
