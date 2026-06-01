import { useState } from 'react'
import Image from 'next/image'

export default function ImageModal({ images, startIndex=0, onClose }){
  const [index, setIndex] = useState(startIndex)
  if(!images || images.length===0) return null
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center">
      <div className="max-w-4xl w-full p-4">
        <button className="text-white mb-2" onClick={onClose}>Close</button>
        <div className="bg-white rounded overflow-hidden">
          <Image src={images[index]} alt={`img-${index}`} width={1200} height={800} className="object-contain w-full" />
        </div>
        <div className="flex gap-2 mt-2 justify-center">
          <button className="px-3 py-1 bg-white rounded" onClick={()=>setIndex((index-1+images.length)%images.length)}>Prev</button>
          <button className="px-3 py-1 bg-white rounded" onClick={()=>setIndex((index+1)%images.length)}>Next</button>
        </div>
      </div>
    </div>
  )
}
