import { useEffect } from 'react'

export default function useHead({ title, description, ogImage } = {}) {
  useEffect(() => {
    if (title) document.title = title

    if (description) {
      let meta = document.querySelector('meta[name="description"]')
      if (!meta) {
        meta = document.createElement('meta')
        meta.name = 'description'
        document.head.appendChild(meta)
      }
      meta.content = description
    }

    if (ogImage) {
      let og = document.querySelector('meta[property="og:image"]')
      if (!og) {
        og = document.createElement('meta')
        og.setAttribute('property', 'og:image')
        document.head.appendChild(og)
      }
      og.content = ogImage
    }
  }, [title, description, ogImage])
}
