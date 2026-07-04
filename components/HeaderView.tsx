import Link from 'next/link'

interface Props {
  user: { name: string; avatarUrl: string | null } | null
}

export function HeaderView({ user }: Props) {
  return (
    <header className="border-b px-4 py-2 flex items-center justify-between">
      <Link href="/" className="font-semibold">行程規劃</Link>
      {user ? (
        <div className="flex items-center gap-3 text-sm">
          <Link href="/trips" className="hover:underline">我的行程</Link>
          <span className="text-gray-700">{user.name}</span>
          <form action="/auth/signout" method="post">
            <button type="submit" className="hover:underline">登出</button>
          </form>
        </div>
      ) : (
        <Link href="/login" className="text-sm hover:underline">登入</Link>
      )}
    </header>
  )
}
