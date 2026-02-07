import '../styles/globals.css'
import { useEffect } from 'react'

export default function App({ Component, pageProps }) {
  useEffect(() => {
    // default to dark theme like ChatGPT
    document.documentElement.classList.add('dark')
  }, [])

  return <Component {...pageProps} />
}
