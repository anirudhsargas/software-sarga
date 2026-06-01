export default function BeforeAfter({ before, after }){
  return (
    <div className="flex gap-2">
      <div className="flex-1">
        <div className="text-sm text-gray-500">Before</div>
        <img src={before} alt="before" className="w-full rounded shadow" />
      </div>
      <div className="flex-1">
        <div className="text-sm text-gray-500">After</div>
        <img src={after} alt="after" className="w-full rounded shadow" />
      </div>
    </div>
  )
}
