'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useState } from 'react'

import { BrandLink } from '@/components/brand-link'

const buildStages = [
  {
    label: 'Listening',
    title: 'Business understood',
    detail: 'Audience, offers and goals mapped',
  },
  {
    label: 'Designing',
    title: 'Original direction ready',
    detail: 'Structure, copy and visual system created',
  },
  {
    label: 'Building',
    title: 'Production code running',
    detail: 'Fast headless front end assembled',
  },
  {
    label: 'Connecting',
    title: 'Your control room is live',
    detail: 'Cloudflare, content and analytics connected',
  },
]

const capabilities = [
  {
    number: '01',
    title: 'A website made for the business',
    copy: 'Ada starts with your customers, your offer and the action the website needs to create—not a template catalogue.',
    className: 'capability capability-featured',
  },
  {
    number: '02',
    title: 'Real code. Yours.',
    copy: 'The website lives in a GitHub repository you control. No platform lock-in and no proprietary page-builder maze.',
    className: 'capability capability-code',
  },
  {
    number: '03',
    title: 'Cloudflare speed by default',
    copy: 'Pages, data and media are deployed close to every visitor without an expensive hosting stack.',
    className: 'capability capability-edge',
  },
  {
    number: '04',
    title: 'SEO that knows the context',
    copy: 'Ada studies the business, audience and search landscape, then recommends improvements and useful articles.',
    className: 'capability capability-seo',
  },
  {
    number: '05',
    title: 'Changes without the chase',
    copy: 'Ask in plain language. Ada prepares the work, shows the real result and waits for approval before publishing.',
    className: 'capability capability-control',
  },
]

export default function HomeExperience() {
  const [activeStage, setActiveStage] = useState(0)

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) return

    const timer = window.setInterval(() => {
      setActiveStage((stage) => (stage + 1) % buildStages.length)
    }, 2800)

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add('is-visible')
        })
      },
      { threshold: 0.14 },
    )

    document.querySelectorAll('[data-reveal]').forEach((node) => observer.observe(node))
    return () => {
      window.clearInterval(timer)
      observer.disconnect()
    }
  }, [])

  const active = buildStages[activeStage]

  return (
    <main className="marketing-shell">
      <div className="ambient-grid" aria-hidden="true">
        <span className="ambient-orbit ambient-orbit-one" />
        <span className="ambient-orbit ambient-orbit-two" />
        <span className="ambient-signal ambient-signal-one" />
        <span className="ambient-signal ambient-signal-two" />
      </div>

      <nav className="topbar topbar-marketing" aria-label="Primary navigation">
        <BrandLink priority />
        <div className="nav-links">
          <a href="#how-it-works">How it works</a>
          <a href="#what-ada-handles">What Ada handles</a>
        </div>
        <div className="nav-actions">
          <Link className="text-link" href="/login">Sign in</Link>
          <Link className="nav-cta" href="/signup">Build with Ada <span aria-hidden="true">↗</span></Link>
        </div>
      </nav>

      <section className="hero hero-marketing">
        <div className="hero-copy-block" data-reveal>
          <div className="eyebrow"><span className="eyebrow-signal" /> The AI website operator</div>
          <h1>Tell Ada about your business. <em>She&apos;ll build around it.</em></h1>
          <p className="hero-copy">
            No templates, plugin pile or technical dashboard. Talk to Ada. She plans, codes, launches and improves a custom website—while you approve every meaningful step.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/signup">Start a website <span className="button-arrow" aria-hidden="true">↗</span></Link>
            <a className="button button-quiet" href="#how-it-works"><span className="play-dot" aria-hidden="true">▶</span> See Ada work</a>
          </div>
          <div className="trust-line" aria-label="HelloAda advantages">
            <span>Own the code</span>
            <span>Cloudflare-native</span>
            <span>You approve every launch</span>
          </div>
        </div>

        <div className="hero-product" data-reveal>
          <div className="hero-product-glow" aria-hidden="true" />
          <div className="product-window">
            <div className="product-window-bar">
              <div className="window-controls" aria-hidden="true"><span /><span /><span /></div>
              <span className="window-title">coral.studio / build room</span>
              <span className="live-pill"><i /> live system</span>
            </div>

            <div className="product-body">
              <div className="conversation-panel">
                <div className="conversation-label"><span>Ada</span><span>Business context · 96%</span></div>
                <div className="message message-owner">
                  We&apos;re a small architecture studio. We need the right clients—not just more traffic.
                </div>
                <div className="message message-ada">
                  <span className="mini-mark" aria-hidden="true">a</span>
                  <p>I&apos;ve mapped the audience, offer and enquiry path. I&apos;m building the experience around qualified conversations.</p>
                </div>
                <div className="ada-input"><span>Ask Ada to change anything</span><b aria-hidden="true">↑</b></div>
              </div>

              <div className="build-panel" aria-live="polite">
                <div className="build-panel-head">
                  <span>Autonomous build</span>
                  <strong>{String(activeStage + 1).padStart(2, '0')} / 04</strong>
                </div>
                <div className="build-flow" aria-label="Ada build stages">
                  <span className="flow-track" aria-hidden="true" />
                  <span className={`flow-spark flow-spark-${activeStage}`} aria-hidden="true" />
                  {buildStages.map((stage, index) => (
                    <button
                      className={index === activeStage ? 'flow-node is-active' : index < activeStage ? 'flow-node is-complete' : 'flow-node'}
                      key={stage.label}
                      type="button"
                      onClick={() => setActiveStage(index)}
                      aria-label={`Show ${stage.label} stage`}
                    >
                      <i>{index < activeStage ? '✓' : index + 1}</i>
                      <span>{stage.label}</span>
                    </button>
                  ))}
                </div>
                <div className="build-status" key={active.title}>
                  <span className="status-kicker">Ada is {active.label.toLowerCase()}</span>
                  <strong>{active.title}</strong>
                  <p>{active.detail}</p>
                </div>
                <div className="site-preview" aria-hidden="true">
                  <div className="preview-nav"><span>CORAL</span><i /></div>
                  <div className="preview-copy"><i>Architecture for warm places</i><b>Spaces that<br />breathe.</b><span /></div>
                  <div className="preview-image"><span>New project</span></div>
                </div>
              </div>
            </div>
          </div>
          <div className="floating-note floating-note-code"><span>Repository</span><strong>Code is yours</strong><i>✓</i></div>
          <div className="floating-note floating-note-edge"><span>Cloudflare edge</span><strong>Global by default</strong><i>24ms</i></div>
        </div>
      </section>

      <section className="outcome-rail" aria-label="One conversation becomes" data-reveal>
        <span className="outcome-label">One conversation becomes</span>
        <div><i>01</i> Original design</div>
        <div><i>02</i> Fast headless site</div>
        <div><i>03</i> Simple control room</div>
        <div><i>04</i> Continuous improvements</div>
      </section>

      <section className="problem-section" data-reveal>
        <div className="section-intro">
          <div className="eyebrow"><span className="eyebrow-signal" /> Not another website builder</div>
          <h2>Most platforms give you tools.<br /><em>Ada does the work.</em></h2>
        </div>
        <div className="comparison-stage">
          <div className="comparison-old">
            <span className="comparison-tag">The usual setup</span>
            <div className="old-stack" aria-hidden="true">
              <span>Theme</span><span>Builder</span><span>SEO app</span><span>Forms</span><span>Hosting</span><span>Updates</span>
            </div>
            <p>Templates, plugins, subscriptions and a dashboard you still need someone else to operate.</p>
          </div>
          <div className="comparison-pivot" aria-hidden="true"><span>→</span></div>
          <div className="comparison-ada">
            <span className="comparison-tag">The Ada setup</span>
            <div className="ada-core"><Image src="/helloada-mark.svg" alt="" width={94} height={94} /><span className="core-pulse" /><strong>One intelligent operator</strong></div>
            <p>One conversation turns business context into design, code, content and a live system.</p>
          </div>
        </div>
      </section>

      <section className="process-section" id="how-it-works">
        <div className="section-intro section-intro-split" data-reveal>
          <div>
            <div className="eyebrow"><span className="eyebrow-signal" /> How it works</div>
            <h2>From first hello<br />to <em>live website.</em></h2>
          </div>
          <p>Ada keeps the technology out of your way and the decisions in your hands. You always see the real work before it goes live.</p>
        </div>
        <div className="process-grid">
          <article data-reveal>
            <span className="process-number">01</span>
            <div className="process-visual process-visual-chat" aria-hidden="true">
              <span>What should the website achieve?</span>
              <strong>Help people understand our service and book a consultation.</strong>
              <i />
            </div>
            <h3>Tell her what matters</h3>
            <p>Speak normally. Ada learns the business, customers, goals and character before she touches the design.</p>
          </article>
          <article data-reveal>
            <span className="process-number">02</span>
            <div className="process-visual process-visual-build" aria-hidden="true">
              <div><i /><i /><i /></div>
              <span /><span /><span />
              <b>Building the real site</b>
            </div>
            <h3>Watch the site take shape</h3>
            <p>Ada writes the structure, copy and production code, then shows the actual website—not a disposable mockup.</p>
          </article>
          <article data-reveal>
            <span className="process-number">03</span>
            <div className="process-visual process-visual-approve" aria-hidden="true">
              <span>Design direction ready</span>
              <strong>Approve and build</strong>
              <i>✓</i>
            </div>
            <h3>Approve, then go live</h3>
            <p>Ada pauses at meaningful decisions. Nothing reaches customers until you are ready.</p>
          </article>
        </div>
      </section>

      <section className="capability-section" id="what-ada-handles">
        <div className="section-intro section-intro-split" data-reveal>
          <div>
            <div className="eyebrow"><span className="eyebrow-signal" /> What Ada handles</div>
            <h2>Not just a website.<br /><em>A capable system.</em></h2>
          </div>
          <p>Built for small teams that want a serious digital presence without becoming website specialists.</p>
        </div>
        <div className="capability-grid">
          {capabilities.map((capability) => (
            <article className={capability.className} key={capability.number} data-reveal>
              <span className="capability-number">{capability.number}</span>
              <div>
                <h3>{capability.title}</h3>
                <p>{capability.copy}</p>
              </div>
              {capability.number === '01' && <div className="capability-art art-direction" aria-hidden="true"><span /><span /><span /><i /></div>}
              {capability.number === '02' && <div className="capability-art art-code" aria-hidden="true"><code>git / main</code><span>helloada-site</span><i>exportable</i></div>}
              {capability.number === '03' && <div className="capability-art art-edge" aria-hidden="true"><i /><span /><span /><span /></div>}
              {capability.number === '04' && <div className="capability-art art-search" aria-hidden="true"><span>Search opportunity</span><b>+38%</b><i /></div>}
              {capability.number === '05' && <div className="capability-art art-approval" aria-hidden="true"><span>Ready for review</span><b>Approve change</b></div>}
            </article>
          ))}
        </div>
      </section>

      <section className="control-section" data-reveal>
        <div className="control-copy">
          <div className="eyebrow"><span className="eyebrow-signal" /> The control room</div>
          <h2>Ada remembers the business—not just the last prompt.</h2>
          <p>Every conversation builds durable context: your positioning, customers, design decisions, search opportunities and what has already been approved.</p>
          <ul>
            <li><span>01</span>Ask for changes in plain language</li>
            <li><span>02</span>Review the real website before publishing</li>
            <li><span>03</span>Keep every website in one calm workspace</li>
          </ul>
        </div>
        <div className="control-window" aria-label="HelloAda control room preview">
          <div className="control-sidebar">
            <BrandLink />
            <span className="control-nav-active">Overview</span>
            <span>Website</span>
            <span>Recommendations</span>
            <span>SEO & content</span>
            <i />
            <small>coral.studio</small>
          </div>
          <div className="control-main">
            <div className="control-head"><span>Good morning, Maya.</span><i>Live</i></div>
            <div className="control-metric"><span>This week</span><strong>3 meaningful opportunities</strong><p>Ada has prepared the work and is waiting for your decision.</p></div>
            <div className="control-recommendation">
              <span className="mini-mark">a</span>
              <div><small>ADA RECOMMENDS</small><strong>Create a service page for boutique hospitality projects</strong><p>Search demand is growing and your recent project gives us strong proof.</p></div>
              <button type="button" tabIndex={-1}>Review direction <span>→</span></button>
            </div>
            <div className="control-bottom"><div><span>Site health</span><strong>Excellent</strong></div><div><span>Next article</span><strong>Ready to review</strong></div></div>
          </div>
        </div>
      </section>

      <section className="final-cta" data-reveal>
        <div className="final-mark" aria-hidden="true"><Image src="/helloada-mark.svg" alt="" width={105} height={105} /><span /><span /></div>
        <div className="eyebrow"><span className="eyebrow-signal" /> Your website has a new operator</div>
        <h2>Your next website starts<br />with a <em>conversation.</em></h2>
        <p>Tell Ada what you are building. She will take it from there—and keep you in control.</p>
        <Link className="button button-primary button-large" href="/signup">Say hello to Ada <span className="button-arrow" aria-hidden="true">↗</span></Link>
      </section>

      <footer className="site-footer">
        <BrandLink />
        <p>AI-native websites for businesses that have better things to do than manage a website.</p>
        <div><Link href="/login">Sign in</Link><a href="https://weareheadless.com">By WeAreHeadless ↗</a></div>
        <span>© 2026 HelloAda</span>
      </footer>
    </main>
  )
}
