import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'

export default function Debug() {
    const router = useRouter()
    const [mounted, setMounted] = useState(false)
    const [windowHref, setWindowHref] = useState('')

    useEffect(() => {
        setMounted(true)
        setWindowHref(window.location.href)
    }, [])

    const envAppUrl = process.env.NEXT_PUBLIC_APP_URL

    return (
        <div className="p-10 font-mono text-sm">
            <h1 className="text-2xl font-bold mb-4">Debug Page</h1>

            <div className="mb-6 border p-4 rounded bg-gray-100 dark:bg-gray-800">
                <h2 className="font-bold mb-2">Environment</h2>
                <p><strong>NEXT_PUBLIC_APP_URL:</strong> {envAppUrl || '(undefined)'}</p>
                <p><strong>Current Window URL:</strong> {mounted ? windowHref : '(loading...)'}</p>
            </div>

            <div className="mb-6 border p-4 rounded bg-gray-100 dark:bg-gray-800">
                <h2 className="font-bold mb-2">Test Redirects</h2>
                <div className="flex flex-col gap-2 items-start">
                    <button
                        onClick={() => router.replace('/dashboard')}
                        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                        router.replace('/dashboard')
                    </button>

                    <button
                        onClick={() => window.location.href = '/dashboard'}
                        className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                    >
                        window.location.href = '/dashboard'
                    </button>

                    <button
                        onClick={() => window.location.replace('/dashboard')}
                        className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                    >
                        window.location.replace('/dashboard')
                    </button>
                </div>
            </div>
        </div>
    )
}
