import { useRouter } from 'next/router'
import Image from 'next/image'

export default function ProjectPage({ project }) {
  if (!project) return <div className="p-6">Project not found</div>
  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold">{project.name}</h2>
      <p className="text-sm text-gray-600">{project.category} — Completed {project.completion_date}</p>
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        {project.images.map((src, i) => (
          <div key={i} className="rounded overflow-hidden">
            <Image src={src} alt={`${project.name}-${i}`} width={800} height={600} className="object-cover" />
          </div>
        ))}
      </div>
    </div>
  )
}

export async function getServerSideProps({ params }) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/projects?slug=${params.slug}`)
  const data = await res.json()
  return { props: { project: data[0] || null } }
}
