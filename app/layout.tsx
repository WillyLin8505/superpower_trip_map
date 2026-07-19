import type { Metadata } from 'next'
import { Fraunces, Noto_Serif_TC, Noto_Sans_TC } from 'next/font/google'
import Script from 'next/script'
import { Header } from '@/components/Header'
import './globals.css'

const fraunces = Fraunces({ subsets: ['latin'], weight: ['400', '500', '600'], style: ['normal', 'italic'], variable: '--font-fraunces', display: 'swap' })
const notoSerifTC = Noto_Serif_TC({ weight: ['500', '600', '700'], variable: '--font-noto-serif-tc', display: 'swap', preload: false })
const notoSansTC = Noto_Sans_TC({ weight: ['400', '500', '700'], variable: '--font-noto-sans-tc', display: 'swap', preload: false })

export const metadata: Metadata = { title: '旅遊行程規劃' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW" className={`${fraunces.variable} ${notoSerifTC.variable} ${notoSansTC.variable}`}>
      <head>
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places&loading=async`}
          strategy="beforeInteractive"
        />
      </head>
      <body className="font-body bg-paper text-ink"><Header />{children}</body>
    </html>
  )
}
