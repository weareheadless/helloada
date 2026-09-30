import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="marketing-shell">
      <nav className="topbar">
        <span className="wordmark"><span className="wordmark-mark">A</span>HelloAda</span>
        <Link className="text-link" href="/login">Sign in <span aria-hidden="true">↗</span></Link>
      </nav>
      <section className="hero hero-marketing">
        <div className="eyebrow"><span className="eyebrow-dot" /> a quieter way to build on the web</div>
        <h1>Your websites,<br /><em>in conversation.</em></h1>
        <p className="hero-copy">HelloAda gives every site a real home, a clear next step, and a way to shape the work with a person—not a dashboard full of machinery.</p>
        <div className="hero-actions"><Link className="button button-primary" href="/login">Create your first site <span>→</span></Link><span className="microcopy">One account. Every website.</span></div>
      </section>
      <section className="signal-row" aria-label="HelloAda principles">
        <div><span className="signal-index">01</span><strong>Start with the brief</strong><p>Ada listens before she builds.</p></div>
        <div><span className="signal-index">02</span><strong>See the real site</strong><p>Your preview is the website itself.</p></div>
        <div><span className="signal-index">03</span><strong>Choose what comes next</strong><p>Recommendations, not runaway automation.</p></div>
      </section>
      <footer className="site-footer"><span>HELLOADA / 2026</span><span>Made for people with something to say.</span></footer>
    </main>
  )
}
