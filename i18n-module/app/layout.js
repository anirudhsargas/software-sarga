import './globals.css'

export const metadata = {
  title: 'Sarga Printing',
  description: 'Local printing services in Kerala'
}

export default function RootLayout({ children }){
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
