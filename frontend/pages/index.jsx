import { useState } from 'react'
import { useRouter } from 'next/router'
import Auth from '../components/Auth'

export default function Home() {
  const [user, setUser] = useState(null)
  const router = useRouter()

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      <header className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/')} className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded flex items-center justify-center text-black font-bold">F</div>
            <span className="text-xl font-semibold">FeynmanAI</span>
          </button>
        </div>

        <nav className="flex items-center gap-4">
          <button onClick={() => router.push('/dashboard')} className="px-3 py-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800">Conversations</button>
          <button onClick={() => router.push('/welcome')} className="px-3 py-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800">About</button>
          <Auth onUser={setUser} redirectTo={null} />
        </nav>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-32 flex flex-col items-center text-center">
        <div className="mb-8">
          <div className="w-32 h-32 bg-primary rounded-full flex items-center justify-center text-black text-3xl font-bold">F</div>
        </div>

        <h1 className="text-5xl font-extrabold mb-4">Practice explaining ideas aloud</h1>
        <p className="text-lg text-slate-600 dark:text-slate-300 max-w-2xl">Record short explanations, get targeted follow-up questions, and iterate until you understand a concept deeply.</p>
      </main>
    </div>
  )
}
