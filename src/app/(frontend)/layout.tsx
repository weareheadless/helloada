import './styles.css'

export const metadata = {
  title: 'HelloAda — your websites, in one place',
  description: 'Create, shape, and manage websites with Ada.',
}

export default function FrontendLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
