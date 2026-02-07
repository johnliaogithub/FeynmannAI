import { useRouter } from 'next/router'
import Auth from '../components/Auth'

export default function Welcome() {
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
          <Auth onUser={() => {}} redirectTo={null} />
        </nav>
      </header>

      <main className="max-w-3xl mx-auto p-8">
        <header className="mb-6">
          <h1 className="text-3xl font-bold">About the Authors</h1>
        </header>

        <section className="bg-white dark:bg-slate-800 rounded p-6 shadow">
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 bg-white dark:bg-slate-900 rounded shadow">
              <h3 className="font-semibold">John Liao</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">Bio or role — add details later.</p>
            </div>

            <div className="p-4 bg-white dark:bg-slate-900 rounded shadow">
              <h3 className="font-semibold">Julia Miao</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">Bio or role — add details later.</p>
            </div>

            <div className="p-4 bg-white dark:bg-slate-900 rounded shadow">
              <h3 className="font-semibold">Sami Hassan</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">Contributed to backend development.</p>
            </div>

            <div className="p-4 bg-white dark:bg-slate-900 rounded shadow">
              <h3 className="font-semibold">Jonathan Xiao</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">Bio or role — add details later.</p>
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button onClick={() => router.push('/dashboard')} className="px-4 py-2 bg-primary rounded text-black">Go to Conversations</button>
          </div>
        </section>
      </main>
    </div>
  )
}
