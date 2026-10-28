import { redirect } from 'next/navigation'
import { auth } from '@/src/auth'
import { AgentWorkspace } from '@/src/components/agent-workspace'

export default async function AgentPage() {
  const session = await auth()
  if (!session) redirect('/login?callbackUrl=/agent')

  return (
    <main className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col overflow-hidden p-3 sm:p-6">
      <AgentWorkspace />
    </main>
  )
}
