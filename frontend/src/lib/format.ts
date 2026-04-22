export function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function formatProjectType(value: string) {
  const typeMap: Record<string, string> = {
    original: '原创',
    fanfiction: '同人',
    acg: 'ACG 二创',
    tv_movie: '影视衍生',
  }

  return typeMap[value] ?? value
}
