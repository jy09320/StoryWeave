import axios from 'axios'

const baseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api'

const TOKEN_KEY = 'sw_token'

export const apiClient = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
})

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY)
      if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/register')) {
        window.location.href = '/login'
      }
    }

    if (error.response?.status === 504) {
      return Promise.reject(new Error('AI 请求超时：世界观生成通常更慢，请稍后重试；如果你使用 Docker，请重新构建前端以应用更长的 Nginx 代理超时。'))
    }

    const message =
      error.response?.data?.error?.message ??
      error.response?.data?.detail ??
      error.response?.data?.error ??
      error.message ??
      '请求失败'

    return Promise.reject(new Error(message))
  },
)
