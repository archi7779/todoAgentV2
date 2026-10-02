import { redirect } from 'next/navigation'
import { auth } from '@/src/auth'
import { AgentForm } from '@/src/components/agent-form'

export default async function AgentPage() {
  const session = await auth()
  if (!session) redirect('/login?callbackUrl=/agent')

  return (
    <main className="mx-auto flex min-h-[calc(100vh-57px)] w-full max-w-2xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-bold">Агент</h1>
      <AgentForm />
    </main>
  )
}
