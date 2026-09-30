import Image from 'next/image'
import Link from 'next/link'

export function BrandLink({ href = '/', priority = false }: { href?: string; priority?: boolean }) {
  return (
    <Link className="wordmark" href={href} aria-label="HelloAda home">
      <Image className="wordmark-mark" src="/helloada-mark.svg" alt="" width={36} height={36} priority={priority} />
      <span>HelloAda</span>
    </Link>
  )
}
