import { NextResponse } from 'next/server'

const PUBLIC_FILE = /\.(.*)$/
export function middleware(req){
  const { nextUrl, headers } = req
  const pathname = nextUrl.pathname
  // ignore public files and api
  if (pathname.startsWith('/api') || PUBLIC_FILE.test(pathname)) return
  const cookie = req.cookies.get('NEXT_LOCALE')?.value
  const first = pathname.split('/')[1]
  const locales = ['en','ml']
  if (locales.includes(first)) return // already localized

  const accept = headers.get('accept-language') || ''
  let preferred = 'en'
  if (cookie) preferred = cookie
  else if (accept.startsWith('ml')) preferred = 'ml'

  return NextResponse.redirect(new URL(`/${preferred}${pathname}`, req.url))
}

export const config = { matcher: '/:path*' }
