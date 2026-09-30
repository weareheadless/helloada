import './(frontend)/styles.css'

export const metadata = {
  title: 'HelloAda — the AI that builds and runs your website',
  description: 'Tell Ada about your business. She plans, codes, launches and improves a custom website while you stay in control.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>
}
