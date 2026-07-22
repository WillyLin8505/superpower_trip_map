import Link from 'next/link'

interface Props {
  user: { name: string; avatarUrl: string | null; isAdmin?: boolean } | null
}

export function HeaderView({ user }: Props) {
  return (
    <header className="border-b border-border px-4 py-2 flex items-center justify-between">
      <Link href="/" className="font-display text-lg font-semibold text-ink">行程規劃</Link>
      {user ? (
        <div className="flex items-center gap-3 text-sm">
          <Link href="/trips" className="hover:underline">我的行程</Link>
          {user.isAdmin && <Link href="/admin" className="hover:underline">後台</Link>}
          <span className="text-gray-700">{user.name}</span>
          <form action="/auth/signout" method="post">
            <button type="submit" className="hover:underline">登出</button>
          </form>
        </div>
      ) : (
        <div className="flex items-center gap-3 text-sm">
          <Link href="/login?next=/admin" className="hover:underline">後台登入</Link>
          <Link href="/login" className="hover:underline">登入</Link>
        </div>
      )}
    </header>
  )
}
