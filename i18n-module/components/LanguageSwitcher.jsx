"use client"
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

export default function LanguageSwitcher({ current }){
  const router = useRouter()
  const [lang, setLang] = useState(current || 'en')

  useEffect(()=>{ setLang(current || 'en') },[current])

  function switchTo(l){
    // persist in localStorage and cookie
    try{ localStorage.setItem('lang', l) }catch(e){}
    document.cookie = `NEXT_LOCALE=${l}; path=/; max-age=${60*60*24*365}`
    // navigate to same path under new lang
    const pathname = window.location.pathname
    const segments = pathname.split('/').filter(Boolean)
    // if first segment is lang, replace it
    if (segments[0] === 'en' || segments[0] === 'ml') segments[0] = l
    else segments.unshift(l)
    const newPath = '/' + segments.join('/')
    router.push(newPath)
  }

  return (
    <div className="language-switcher">
      <button className={`px-2 py-1 ${lang==='en' ? 'font-bold' : ''}`} onClick={()=>switchTo('en')}>English</button>
      <button className={`px-2 py-1 ${lang==='ml' ? 'font-bold' : ''}`} onClick={()=>switchTo('ml')}>മലയാളം</button>
    </div>
  )
}
