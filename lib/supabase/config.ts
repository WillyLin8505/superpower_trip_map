// 純函式，無 runtime 專屬 import——可同時被 Edge middleware 與 Node server component 使用。
// 未設定 Supabase 金鑰時（例如尚未在部署環境填入），auth/持久化層應優雅降級而非 throw，
// 讓匿名試用流程仍可載入。
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  )
}
