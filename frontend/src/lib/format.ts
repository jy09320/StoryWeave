const ISO_TIMEZONE_SUFFIX = /(?:[zZ]|[+\-]\d{2}:\d{2})$/

export function parseApiDate(value: string) {
  if (!value) {
    return new Date(Number.NaN)
  }

  const normalized = ISO_TIMEZONE_SUFFIX.test(value) ? value : `${value}Z`
  return new Date(normalized)
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parseApiDate(value))
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
