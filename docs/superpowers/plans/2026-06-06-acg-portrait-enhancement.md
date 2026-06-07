# ACG/同人项目角色肖像增强实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为非原创项目实现"AI 补全外貌 + 用户确认 + 生成肖像"的完整流程

**Architecture:** 新增 DescriptionEnhancementService 服务，通过 LLM 增强角色外貌描述；前端新增弹窗组件让用户确认增强结果后再生成肖像

**Tech Stack:** Python, FastAPI, SQLAlchemy, React, TypeScript, TanStack Query, shadcn/ui

---

## 文件结构

### 新增文件
- `backend/app/services/description_enhancement_service.py` — LLM 增强角色外貌描述服务
- `frontend/src/components/enhance-description-dialog.tsx` — 增强描述确认弹窗组件

### 修改文件
- `backend/app/api/routes/characters.py` — 新增 enhance-description 接口
- `frontend/src/services/characters.ts` — 新增 enhanceDescription API 调用
- `frontend/src/pages/assets/characters-panel.tsx` — 集成弹窗组件，修改肖像生成流程

---

## Task 1: 后端 — 创建 DescriptionEnhancementService

**Files:**
- Create: `backend/app/services/description_enhancement_service.py`

- [ ] **Step 1: 创建增强服务文件**

```python
from __future__ import annotations

import logging

from app.services.ai_service import ai_service
from app.services.runtime_ai_config import runtime_ai_config_service

logger = logging.getLogger(__name__)

PROJECT_TYPE_DISPLAY = {
    "fanfiction": "同人",
    "acg": "ACG 二创",
    "tv_movie": "影视衍生",
}

ENHANCE_PROMPT_TEMPLATE = """你是一个专业的角色外貌描述助手。

项目类型：{project_type_display}
原作名称：《{source_work}》
角色姓名：{character_name}

当前外貌描述：
{current_description}

请根据《{source_work}》中 {character_name} 的官方形象，生成详细的外貌描述。
要求：
1. 包含发色、发型、瞳色、服装等关键特征
2. 描述应具体、准确，符合原作设定
3. 如果有当前描述，在其基础上补充原作特征
4. 使用中文，语言简洁生动

请直接输出外貌描述，不要添加额外说明。"""


class DescriptionEnhancementService:
    async def enhance(
        self,
        *,
        character_name: str,
        current_description: str | None,
        source_work: str,
        project_type: str,
        api_key: str,
        base_url: str | None = None,
    ) -> str:
        """用 LLM 增强角色外貌描述。"""
        project_type_display = PROJECT_TYPE_DISPLAY.get(project_type, project_type)
        current_desc = current_description or "（暂无）"

        prompt = ENHANCE_PROMPT_TEMPLATE.format(
            project_type_display=project_type_display,
            source_work=source_work,
            character_name=character_name,
            current_description=current_desc,
        )

        result = await ai_service.generate_text_openai(
            api_key=api_key,
            base_url=base_url,
            text="",
            instruction=prompt,
            model="gpt-4o-mini",
            temperature=0.7,
            max_tokens=500,
        )

        if not result or not result.strip():
            raise RuntimeError("AI 未能生成有效的外貌描述")

        # 截断到合理长度
        max_length = 500
        if len(result) > max_length:
            result = result[:max_length].rstrip() + "..."

        return result.strip()


description_enhancement_service = DescriptionEnhancementService()
```

- [ ] **Step 2: 验证服务文件语法正确**

Run: `cd backend && python -c "from app.services.description_enhancement_service import description_enhancement_service; print('OK')"`
Expected: `OK`

- [ ] **Step 3: 提交**

```bash
git add backend/app/services/description_enhancement_service.py
git commit -m "feat: add description enhancement service for ACG portraits"
```

---

## Task 2: 后端 — 添加 enhance-description API 接口

**Files:**
- Modify: `backend/app/api/routes/characters.py`

- [ ] **Step 1: 在 characters.py 中添加 enhance-description 接口**

在 `generate_portrait` 函数之前添加以下代码：

```python
@router.post("/{character_id}/enhance-description")
async def enhance_description(
    character_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """用 AI 增强角色外貌描述（用于非原创项目）。"""
    from app.services.description_enhancement_service import description_enhancement_service

    result = await db.execute(
        select(Character).where(Character.id == character_id, Character.owner_id == current_user.id)
    )
    character = result.scalar_one_or_none()
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")

    # 查询角色关联的项目
    from app.models.project import Project, ProjectCharacter
    project_result = await db.execute(
        select(Project)
        .join(ProjectCharacter, ProjectCharacter.project_id == Project.id)
        .where(ProjectCharacter.character_id == character_id)
        .limit(1)
    )
    project = project_result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=400, detail="角色未关联到任何项目")

    if project.type == "original":
        raise HTTPException(status_code=400, detail="原创项目无需增强外貌描述")

    if not project.source_work:
        raise HTTPException(status_code=400, detail="请先在项目设置中填写原作名称")

    # 获取 API key
    config = await runtime_ai_config_service.get_effective_config(db, current_user.id)
    api_key = config.get("api_key")
    if not api_key:
        raise HTTPException(status_code=400, detail="请先在设置中心配置 API Key。")

    base_url = config.get("base_url")

    try:
        enhanced_description = await description_enhancement_service.enhance(
            character_name=character.name,
            current_description=character.description,
            source_work=project.source_work,
            project_type=project.type,
            api_key=api_key,
            base_url=base_url,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI 增强失败：{e}")

    return {
        "enhanced_description": enhanced_description,
        "source_work": project.source_work,
        "character_name": character.name,
    }
```

- [ ] **Step 2: 验证后端启动正常**

Run: `cd backend && python -c "from app.api.routes.characters import router; print('OK')"`
Expected: `OK`

- [ ] **Step 3: 提交**

```bash
git add backend/app/api/routes/characters.py
git commit -m "feat: add enhance-description API endpoint"
```

---

## Task 3: 前端 — 添加 enhanceDescription API 函数

**Files:**
- Modify: `frontend/src/services/characters.ts`

- [ ] **Step 1: 在 characters.ts 中添加 enhanceDescription 函数**

在 `generatePortrait` 函数之后添加：

```typescript
export async function enhanceDescription(characterId: string): Promise<{
  enhanced_description: string
  source_work: string
  character_name: string
}> {
  const { data } = await apiClient.post(`/characters/${characterId}/enhance-description`)
  return data
}
```

- [ ] **Step 2: 验证 TypeScript 编译通过**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无错误输出

- [ ] **Step 3: 提交**

```bash
git add frontend/src/services/characters.ts
git commit -m "feat: add enhanceDescription API function"
```

---

## Task 4: 前端 — 创建 EnhanceDescriptionDialog 组件

**Files:**
- Create: `frontend/src/components/enhance-description-dialog.tsx`

- [ ] **Step 1: 创建弹窗组件**

```tsx
import { useState, useEffect } from 'react'
import { Spinner } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

interface EnhanceDescriptionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  characterName: string
  sourceWork: string
  enhancedDescription: string | null
  isLoading: boolean
  error: string | null
  onConfirm: (description: string) => void
  onSkip: () => void
  onRegenerate: () => void
}

export function EnhanceDescriptionDialog({
  open,
  onOpenChange,
  characterName,
  sourceWork,
  enhancedDescription,
  isLoading,
  error,
  onConfirm,
  onSkip,
  onRegenerate,
}: EnhanceDescriptionDialogProps) {
  const [editedDescription, setEditedDescription] = useState('')

  useEffect(() => {
    if (enhancedDescription) {
      setEditedDescription(enhancedDescription)
    }
  }, [enhancedDescription])

  function handleConfirm() {
    if (editedDescription.trim()) {
      onConfirm(editedDescription.trim())
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>AI 外貌增强</DialogTitle>
          <DialogDescription>
            原作：《{sourceWork}》 · 角色：{characterName}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Spinner className="size-4 animate-spin" />
              AI 正在生成外貌描述...
            </div>
          ) : error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              {error}
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/85">
                AI 生成的外貌描述（可编辑）：
              </label>
              <Textarea
                value={editedDescription}
                onChange={(e) => setEditedDescription(e.target.value)}
                rows={6}
                placeholder="AI 生成的外貌描述将显示在这里..."
                className="resize-none"
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {enhancedDescription && !isLoading && (
            <Button variant="outline" onClick={onRegenerate}>
              重新生成
            </Button>
          )}
          <Button variant="outline" onClick={onSkip}>
            跳过，直接生成
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading || !editedDescription.trim()}
          >
            确认并生成肖像
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: 验证 TypeScript 编译通过**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无错误输出

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/enhance-description-dialog.tsx
git commit -m "feat: add EnhanceDescriptionDialog component"
```

---

## Task 5: 前端 — 集成弹窗到 characters-panel.tsx

**Files:**
- Modify: `frontend/src/pages/assets/characters-panel.tsx`

- [ ] **Step 1: 添加 import**

在文件顶部的 import 区域添加：

```typescript
import { enhanceDescription } from '@/services/characters'
import { EnhanceDescriptionDialog } from '@/components/enhance-description-dialog'
```

- [ ] **Step 2: 在 AssetsCharactersPanel 组件中添加状态**

在 `portraitVersions` 状态之后添加：

```typescript
// Enhance description dialog state
const [enhanceDialogOpen, setEnhanceDialogOpen] = useState(false)
const [enhanceLoading, setEnhanceLoading] = useState(false)
const [enhanceError, setEnhanceError] = useState<string | null>(null)
const [enhancedDescription, setEnhancedDescription] = useState<string | null>(null)
const [enhanceSourceWork, setEnhanceSourceWork] = useState('')
const [pendingPortraitCharacterId, setPendingPortraitCharacterId] = useState<string | null>(null)
```

- [ ] **Step 3: 添加处理函数**

在 `generatePortraitMutation` 之后添加：

```typescript
async function handleEnhanceAndGenerate(characterId: string, modelId?: string) {
  // 查找角色关联的项目
  const characterProjects = characterProjectsMap.get(characterId) ?? []
  const nonOriginalProject = characterProjects.find((p) => p.type !== 'original')

  if (!nonOriginalProject) {
    // 原创项目或无项目，直接生成
    generatePortraitMutation.mutate({ characterId, modelId })
    return
  }

  if (!nonOriginalProject.source_work) {
    toast.error('请先在项目设置中填写原作名称')
    return
  }

  // 打开弹窗，开始增强
  setPendingPortraitCharacterId(characterId)
  setEnhanceSourceWork(nonOriginalProject.source_work)
  setEnhancedDescription(null)
  setEnhanceError(null)
  setEnhanceDialogOpen(true)
  setEnhanceLoading(true)

  try {
    const result = await enhanceDescription(characterId)
    setEnhancedDescription(result.enhanced_description)
  } catch (err) {
    setEnhanceError(err instanceof Error ? err.message : 'AI 增强失败')
  } finally {
    setEnhanceLoading(false)
  }
}

async function handleEnhanceConfirm(description: string) {
  if (!pendingPortraitCharacterId) return
  setEnhanceDialogOpen(false)

  // 先更新角色的外貌描述
  try {
    await updateCharacter(pendingPortraitCharacterId, { description })
    await queryClient.invalidateQueries({ queryKey: ['characters'] })
  } catch (err) {
    toast.error('保存外貌描述失败')
    return
  }

  // 然后生成肖像
  generatePortraitMutation.mutate({ characterId: pendingPortraitCharacterId })
}

function handleEnhanceSkip() {
  if (!pendingPortraitCharacterId) return
  setEnhanceDialogOpen(false)
  generatePortraitMutation.mutate({ characterId: pendingPortraitCharacterId })
}

function handleEnhanceRegenerate() {
  if (!pendingPortraitCharacterId) return
  handleEnhanceAndGenerate(pendingPortraitCharacterId)
}
```

- [ ] **Step 4: 修改 CharacterDetail 的 onGeneratePortrait 调用**

找到 `CharacterDetail` 组件的调用处，将 `onGeneratePortrait` 改为使用新的处理函数：

```typescript
<CharacterDetail
  character={selectedCharacter}
  deletePending={deleteCharacterMutation.isPending}
  isGeneratingPortrait={generatePortraitMutation.isPending}
  portraitVersion={portraitVersions[selectedCharacter.id]}
  onEdit={() => openEditDialog(selectedCharacter)}
  onDelete={() => handleDelete(selectedCharacter)}
  onGeneratePortrait={(modelId) =>
    handleEnhanceAndGenerate(selectedCharacter.id, modelId)
  }
/>
```

- [ ] **Step 5: 在 JSX 中添加 EnhanceDescriptionDialog**

在 `CharacterDialog` 组件之后添加：

```typescript
{/* Enhance description dialog */}
<EnhanceDescriptionDialog
  open={enhanceDialogOpen}
  onOpenChange={setEnhanceDialogOpen}
  characterName={selectedCharacter?.name ?? ''}
  sourceWork={enhanceSourceWork}
  enhancedDescription={enhancedDescription}
  isLoading={enhanceLoading}
  error={enhanceError}
  onConfirm={handleEnhanceConfirm}
  onSkip={handleEnhanceSkip}
  onRegenerate={handleEnhanceRegenerate}
/>
```

- [ ] **Step 6: 验证 TypeScript 编译通过**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无错误输出

- [ ] **Step 7: 提交**

```bash
git add frontend/src/pages/assets/characters-panel.tsx
git commit -m "feat: integrate enhance description dialog into characters panel"
```

---

## 验证清单

完成所有任务后，按以下步骤验证：

1. **启动后端**：`cd backend && uvicorn app.main:app --reload`
2. **启动前端**：`cd frontend && npm run dev`
3. **测试流程**：
   - 创建一个 ACG 二创项目，填写原作名称
   - 创建一个角色并关联到该项目
   - 点击"生成形象"按钮
   - 验证弹窗显示 AI 增强的外貌描述
   - 编辑描述后点击"确认并生成肖像"
   - 验证肖像生成成功
4. **测试边界情况**：
   - 原创项目应直接生成肖像，不弹窗
   - 角色未关联项目时应显示错误提示
   - 原作名称为空时应显示错误提示
