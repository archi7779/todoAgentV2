import { signOut } from '@/src/auth'

export function LogoutButton() {
  return (
    <form
      action={async () => {
        'use server'
        await signOut({ redirectTo: '/' })
      }}
    >
      <button type="submit" className="rounded border px-4 py-2 text-sm hover:bg-gray-100">
        Выйти
      </button>
    </form>
  )
}
