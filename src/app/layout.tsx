import './(frontend)/styles.css'

export const metadata = {
  title: 'HelloAda — your websites, in one place',
  description: 'Create, shape, and manage websites with Ada.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>
}
