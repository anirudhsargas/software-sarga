import fs from 'fs'
import path from 'path'

function loadKeys(lang){
  const file = path.join(process.cwd(), 'i18n-module', 'public', 'locales', lang, 'common.json')
  if (!fs.existsSync(file)) return {}
  return JSON.parse(fs.readFileSync(file,'utf8'))
}

function flatten(obj, prefix = ''){
  const res = {}
  for (const k of Object.keys(obj||{})){
    const val = obj[k]
    const key = prefix ? `${prefix}.${k}` : k
    if (typeof val === 'object' && val !== null){
      Object.assign(res, flatten(val, key))
    } else {
      res[key] = val
    }
  }
  return res
}

export default function TranslationsAdmin(){
  const en = flatten(loadKeys('en'))
  const ml = flatten(loadKeys('ml'))
  const missing = []
  for (const k of Object.keys(en)){
    if (!(k in ml)) missing.push(k)
  }
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Translation Management</h1>
      <div className="mb-4">
        <h2 className="font-semibold">Missing translations (en → ml)</h2>
        {missing.length===0 ? <div className="text-sm text-green-600">No missing keys</div> : (
          <ul className="list-disc ml-6">
            {missing.map(k=><li key={k}>{k}</li>)}
          </ul>
        )}
      </div>
      <div>
        <h2 className="font-semibold">Stats</h2>
        <div className="text-sm">English keys: {Object.keys(en).length}</div>
        <div className="text-sm">Malayalam keys: {Object.keys(ml).length}</div>
      </div>
    </div>
  )
}
