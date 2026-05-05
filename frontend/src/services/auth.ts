import { apiClient } from '@/lib/api-client'

export interface TokenResponse {
  access_token: string
  token_type: string
}

export interface UserOut {
  id: string
  email: string
  is_active: boolean
}

export async function registerApi(email: string, password: string): Promise<TokenResponse> {
  const res = await apiClient.post<TokenResponse>('/auth/register', { email, password })
  return res.data
}

export async function loginApi(email: string, password: string): Promise<TokenResponse> {
  const res = await apiClient.post<TokenResponse>('/auth/login', { email, password })
  return res.data
}

export async function getMeApi(): Promise<UserOut> {
  const res = await apiClient.get<UserOut>('/auth/me')
  return res.data
}
