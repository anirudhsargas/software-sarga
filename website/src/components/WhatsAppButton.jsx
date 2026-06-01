import React from 'react'

function shortRef(){
  return 'SARGA-' + Math.random().toString(36).slice(2,9).toUpperCase()
}

function sanitizePhone(phone){
  if (!phone) return ''
  const only = phone.replace(/[^+0-9]/g,'')
  return only.replace(/^\+/, '')
}

function buildMessage({ type, productName, quantity, size, variant, customerName, artworkUrl, options, orderRef, branch }){
  const lines = []
  lines.push('Hi Sarga Printing,')
  lines.push('')
  if (type === 'order') lines.push('I would like to order:')
  else lines.push('I would like a quote for:')
  lines.push('')
  if (productName) lines.push(`Product: ${productName}`)
  if (quantity) lines.push(`Quantity: ${quantity}`)
  if (size) lines.push(`Size: ${size}`)
  if (variant) lines.push(`Variant: ${variant}`)
  if (branch) lines.push(`Branch: ${branch}`)
  if (options && options.length){
    lines.push('')
    lines.push('Customization options:')
    options.forEach(o=> lines.push(`- ${o.name}: ${o.value}`))
  }
  if (artworkUrl){
    lines.push('')
    lines.push(`Artwork: ${artworkUrl}`)
  }
  lines.push('')
  if (customerName) lines.push(`Customer: ${customerName}`)
  if (!orderRef) orderRef = shortRef()
  lines.push(`Reference: ${orderRef}`)
  lines.push('')
  lines.push('Please share pricing and delivery details.')
  return { text: lines.join('\n'), orderRef }
}

export default function WhatsAppButton({
  phoneNumber = '919895410035',
  productName, quantity, size, variant,
  customerName, artworkUrl, options = [],
  orderRef, type = 'order', branch,
  analyticsEndpoint = '/api/whatsapp/log',
  className = '', style = {},
  label
}){
  const [previewOpen, setPreviewOpen] = React.useState(false)
  const [preview, setPreview] = React.useState({ text: '', orderRef: '' })

  const openPreview = (e) => {
    e.preventDefault()
    const { text, orderRef: ref } = buildMessage({ type, productName, quantity, size, variant, customerName, artworkUrl, options, orderRef, branch })
    setPreview({ text, orderRef: ref })
    setPreviewOpen(true)
  }

  const confirmAndOpen = async () => {
    const { text, orderRef: ref } = preview
    const phone = sanitizePhone(phoneNumber)
    const encoded = encodeURIComponent(text)
    const waLink = `https://wa.me/${phone}?text=${encoded}`

    try {
      if (analyticsEndpoint){
        await fetch(analyticsEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'whatsapp_click',
            type,
            productName,
            quantity,
            size,
            variant,
            orderRef: ref,
            artworkUrl,
            options,
            branch,
            timestamp: new Date().toISOString()
          })
        }).catch(()=>{})
      }
    } catch(err){ /* ignore */ }

    window.open(waLink, '_blank')
    setPreviewOpen(false)
  }

  const btnLabel = label || (type === 'order' ? 'Order via WhatsApp' : 'Get Quote via WhatsApp')

  return (
    <>
      <button onClick={openPreview} style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        padding: '8px 16px', borderRadius: '8px',
        background: '#25D366', color: '#fff', border: 'none',
        cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
        transition: 'opacity 0.2s',
        ...style
      }} className={className} aria-label={btnLabel}>
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-4.7A8.38 8.38 0 0 1 4 12.5 8.5 8.5 0 0 1 12.5 4 8.5 8.5 0 0 1 21 12.5z"/></svg>
        <span>{btnLabel}</span>
      </button>

      {previewOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setPreviewOpen(false)}>
          <div className="bg-white rounded max-w-2xl w-full shadow-lg p-4" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start">
              <h3 className="text-lg font-semibold">{btnLabel}</h3>
              <button onClick={()=>setPreviewOpen(false)} className="text-gray-600 hover:text-gray-900" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem' }}>Close</button>
            </div>
            <div className="mt-3">
              <p className="text-xs text-gray-500 mb-2">Reference: <span className="font-mono">{preview.orderRef}</span></p>
              <pre className="whitespace-pre-wrap bg-gray-50 p-3 rounded text-sm text-gray-800" style={{whiteSpace:'pre-wrap', fontFamily: 'monospace', fontSize: '0.85rem'}}>{preview.text}</pre>
            </div>
            <div className="mt-4 flex gap-2 justify-end">
              <button onClick={async ()=>{ await navigator.clipboard.writeText(preview.text); }} style={{ padding: '6px 14px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}>
                Copy message
              </button>
              <button onClick={confirmAndOpen} style={{ padding: '6px 14px', background: '#25D366', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
                Open WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
