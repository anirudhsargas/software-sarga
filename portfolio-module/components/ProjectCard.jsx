import Link from 'next/link'
import Image from 'next/image'
import { useState } from 'react'
import ImageModal from './ImageModal'

export default function ProjectCard({ project }){
  const [open, setOpen] = useState(false)
  const [idx, setIdx] = useState(0)
  const img = project.images[0]
  return (
    <article className="break-inside mb-4">
      <div className="relative cursor-pointer" onClick={()=>{setIdx(0);setOpen(true)}}>
        <Image src={img} alt={project.name} width={600} height={400} className="w-full h-auto rounded shadow" />
      </div>
      <div className="mt-2">
        <Link href={`/projects/${project.slug}`}><a className="font-semibold">{project.name}</a></Link>
        <div className="text-sm text-gray-600">{project.category}</div>
      </div>
      {open && <ImageModal images={project.images} startIndex={idx} onClose={()=>setOpen(false)} />}
    </article>
  )
}
