import { useEffect, useState } from 'react'
import ProjectCard from './ProjectCard'

export default function MasonryGallery() {
  const [projects, setProjects] = useState([])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')

  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.json())
      .then(setProjects)
  }, [])

  const filtered = projects.filter(p => {
    if (category !== 'All' && p.category !== category) return false
    if (query && !(p.name + ' ' + (p.material || '')).toLowerCase().includes(query.toLowerCase())) return false
    return p.published && p.customer_approved
  })

  const categories = ['All','Wedding Cards','Mementos','Photo Frames','Offset Printing','Business Cards','Brochures','Certificates','ID Cards','Flex & Signage','Custom Works']

  return (
    <section>
      <div className="flex gap-2 mb-4">
        <select id="category-filter" name="category-filter" className="border px-2 py-1 rounded" value={category} onChange={e=>setCategory(e.target.value)}>
          {categories.map(c=> <option key={c} value={c}>{c}</option>)}
        </select>
        <input id="search-projects" name="search-projects" className="border px-2 py-1 rounded flex-1" placeholder="Search projects" value={query} onChange={e=>setQuery(e.target.value)} />
      </div>
      <div className="columns-1 sm:columns-2 md:columns-3 gap-4 space-y-4">
        {filtered.map(p => <ProjectCard key={p.id} project={p} />)}
      </div>
    </section>
  )
}
