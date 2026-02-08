import '../styles/globals.css'
import { useEffect } from 'react'
import Head from 'next/head'

export default function App({ Component, pageProps }) {
  useEffect(() => {
    // default to dark theme like ChatGPT
    document.documentElement.classList.add('dark')
  }, [])

  return (
    <>
      <Head>
        <link rel="icon" href="/image.svg" type="image/svg+xml" />
        <link rel="alternate icon" href="/image.png" />
        <meta name="theme-color" content="#0e1327" />
      </Head>
      <Component {...pageProps} />
    </>
  )
}
