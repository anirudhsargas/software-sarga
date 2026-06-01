const fs = require('fs')
const path = require('path')

function loadNamespace(lang, ns){
  const p = path.join(process.cwd(), 'i18n-module', 'public', 'locales', lang, `${ns}.json`)
  if (!fs.existsSync(p)) return {}
  return JSON.parse(fs.readFileSync(p,'utf8'))
}

function loadAll(lang){
  const dir = path.join(process.cwd(), 'i18n-module', 'public', 'locales', lang)
  const files = fs.existsSync(dir) ? fs.readdirSync(dir) : []
  const out = {}
  for (const f of files){
    if (f.endsWith('.json')){
      const ns = f.replace('.json','')
      out[ns] = loadNamespace(lang, ns)
    }
  }
  return out
}

function getSeo(lang){
  const common = loadNamespace(lang, 'common')
  return common.seo || { title: '', description: '' }
}

module.exports = { loadNamespace, loadAll, getSeo }
