import { useState, useRef } from 'react'

export default function ReorderList({ projects = [], onSave, onToggle }){
  const [items, setItems] = useState(projects)
  const dragIndex = useRef(null)

  // keep items synced when projects prop changes
  if (projects.length !== items.length) setItems(projects)

  function handleDragStart(e, idx){
    dragIndex.current = idx
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e){ e.preventDefault(); e.dataTransfer.dropEffect = 'move' }

  function handleDrop(e, idx){
    e.preventDefault()
    const from = dragIndex.current
    if (from === null) return
    const copy = items.slice()
    const [moved] = copy.splice(from,1)
    copy.splice(idx,0,moved)
    dragIndex.current = null
    setItems(copy)
  }

  async function save(){
    if (!onSave) return
    const orderedIds = items.map(i=>i.id)
    await onSave(orderedIds)
  }

  return (
    <div>
      <div className="space-y-2">
        {items.map((p, idx)=> (
          <div key={p.id} draggable onDragStart={(e)=>handleDragStart(e, idx)} onDragOver={handleDragOver} onDrop={(e)=>handleDrop(e, idx)} className="p-2 border rounded flex items-center justify-between bg-white">
            <div className="flex items-center gap-3">
              <img src={p.images && p.images[0]} alt={p.name} className="w-20 h-12 object-cover rounded" />
              <div>
                <div className="font-semibold">{p.name}</div>
                <div className="text-sm text-gray-600">{p.category}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2"><input type="checkbox" checked={p.published} onChange={e=>onToggle(p.id,'published',e.target.checked)} /> Pub</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={p.featured} onChange={e=>onToggle(p.id,'featured',e.target.checked)} /> Feat</label>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <button className="px-3 py-1 bg-green-600 text-white rounded" onClick={save}>Save Order</button>
      </div>
    </div>
  )
}
