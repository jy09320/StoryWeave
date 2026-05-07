import type { ProjectChannel } from '@/types/api'

export const PROJECT_CHANNEL_OPTIONS: Array<{ label: string; value: ProjectChannel }> = [
  { label: '男频', value: 'male' },
  { label: '女频', value: 'female' },
  { label: '通用', value: 'general' },
]

export const PROJECT_GENRE_OPTIONS = [
  '玄幻',
  '仙侠',
  '都市',
  '历史',
  '科幻',
  '悬疑',
  '言情',
  '游戏',
  '现实',
  '快穿',
  '无限流',
]

export const PROJECT_TROPE_OPTIONS = [
  '爽文',
  '甜宠',
  '权谋',
  '后宫',
  '单女主',
  '系统',
  '穿越',
  '重生',
  '逆袭',
  '复仇',
  '种田',
  '直播',
  '群像',
  '治愈',
  '沙雕',
  '热血',
  '修仙',
  '先婚后爱',
]

export const PROJECT_GENRE_MAX = 2
export const PROJECT_TROPE_MAX = 4

export function formatProjectChannel(value: ProjectChannel | string | null | undefined) {
  const option = PROJECT_CHANNEL_OPTIONS.find((item) => item.value === value)
  return option?.label ?? '未设置'
}

export function summarizeProjectProfile(params: {
  channel: ProjectChannel | null
  genres: string[]
  tropes: string[]
  premise: string
}) {
  return {
    channelLabel: formatProjectChannel(params.channel),
    genresLabel: params.genres.length > 0 ? params.genres.join(' / ') : '未设置题材',
    tropesLabel: params.tropes.length > 0 ? params.tropes.join(' / ') : '未设置风格标签',
    premiseLabel: params.premise.trim() || '未填写一句话故事',
  }
}
