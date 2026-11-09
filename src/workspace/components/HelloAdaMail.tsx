'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { fetchHelloAda } from '../api/fetchHelloAda'
import { helloAdaPath } from '../config/site'
import { useHelloAdaTranslations } from '../api/useHelloAdaTranslations'

type MailSurface = 'inbox' | 'calendar'

type Mailbox = {
  id: string
  localPart: string
  displayName?: string | null
  senderAddresses?: string[]
}

type MessageRow = {
  id: string
  threadId?: string | null
  subject?: string | null
  fromAddr?: string | null
  toAddr?: string | null
  fromContactName?: string | null
  snippet?: string | null
  createdAt?: string | null
  read?: boolean
  direction?: 'inbound' | 'outbound'
  threadCount?: number
  threadUnread?: number
}

type Attachment = {
  id: string
  filename: string
  type?: string
  size?: number
}

type ThreadMessage = MessageRow & {
  textBody?: string | null
  htmlBody?: string | null
  messageId?: string | null
  inReplyTo?: string | null
  references?: string | null
  attachments?: Attachment[]
}

type CalendarEvent = {
  id: string
  title: string
  description?: string | null
  location?: string | null
  startsAt?: string | null
  endsAt?: string | null
  attendees?: string | null
}

const dateLabel = (value: string | null | undefined, locale: string) => {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  const sameYear = parsed.getFullYear() === new Date().getFullYear()
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed)
}

const dayLabel = (value: string | null | undefined, locale: string) => {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(parsed)
}

const displayAddress = (value: string | null | undefined) => String(value || '').replace(/^.*<([^>]+)>.*$/, '$1').trim()

const replySubject = (subject: string | null | undefined) => {
  const value = String(subject || '').trim() || 'Your message'
  return /^re:/i.test(value) ? value : `Re: ${value}`
}

const attachmentSize = (size: number | undefined) => {
  if (!size || size < 0) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export function HelloAdaMail({ surface = 'inbox' }: { surface?: MailSurface }) {
  const { t, language } = useHelloAdaTranslations()
  const locale = language
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([])
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [thread, setThread] = useState<ThreadMessage[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [loadingThread, setLoadingThread] = useState(false)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loadingCalendar, setLoadingCalendar] = useState(surface === 'calendar')
  const [error, setError] = useState('')
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const mailbox = mailboxes[0]
  const mailboxAddress = useMemo(() => {
    if (!mailbox) return ''
    return mailbox.senderAddresses?.find(Boolean) || ''
  }, [mailbox])

  const loadList = useCallback(async () => {
    setLoadingList(true)
    setError('')
    try {
      const mailboxResponse = await fetchHelloAda('/api/helloada/mail/mailboxes', { cache: 'no-store' })
      if (!mailboxResponse.ok) throw new Error(t('owner.messagesFailure'))
      const mailboxBody = await mailboxResponse.json() as { mailboxes?: Mailbox[] }
      const loadedMailboxes = Array.isArray(mailboxBody.mailboxes) ? mailboxBody.mailboxes : []
      setMailboxes(loadedMailboxes)
      const first = loadedMailboxes[0]
      const query = new URLSearchParams({ group: 'thread', limit: '40' })
      if (first?.id) query.set('mailboxId', first.id)
      const response = await fetchHelloAda(`/api/helloada/mail/messages?${query.toString()}`, { cache: 'no-store' })
      if (!response.ok) throw new Error(t('owner.messagesFailure'))
      const body = await response.json() as { messages?: MessageRow[] }
      setMessages(Array.isArray(body.messages) ? body.messages : [])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('owner.messagesFailure'))
    } finally {
      setLoadingList(false)
    }
  }, [t])

  const loadCalendar = useCallback(async () => {
    setLoadingCalendar(true)
    setError('')
    try {
      const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const end = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString()
      const response = await fetchHelloAda(`/api/helloada/mail/calendar/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, { cache: 'no-store' })
      if (!response.ok) throw new Error(t('owner.messagesFailure'))
      const body = await response.json() as { events?: CalendarEvent[] }
      setEvents(Array.isArray(body.events) ? body.events : [])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('owner.messagesFailure'))
    } finally {
      setLoadingCalendar(false)
    }
  }, [t])

  useEffect(() => {
    if (surface === 'calendar') void loadCalendar()
    else void loadList()
  }, [surface, loadCalendar, loadList])

  const openThread = useCallback(async (row: MessageRow) => {
    setSelected(row.threadId || row.id)
    setLoadingThread(true)
    setSent(false)
    setReply('')
    setError('')
    try {
      const response = await fetchHelloAda(`/api/helloada/mail/messages/${encodeURIComponent(row.id)}/thread`, { cache: 'no-store' })
      if (!response.ok) throw new Error(t('owner.messagesFailure'))
      const body = await response.json() as { messages?: ThreadMessage[] }
      const loaded = Array.isArray(body.messages) ? body.messages : []
      setThread(loaded)
      if (!row.read) {
        await fetchHelloAda(`/api/helloada/mail/messages/${encodeURIComponent(row.id)}/read`, { method: 'POST' })
        setMessages((current) => current.map((item) => (
          item.id === row.id ? { ...item, read: true } : item
        )))
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('owner.messagesFailure'))
    } finally {
      setLoadingThread(false)
    }
  }, [t])

  const lastInbound = useMemo(
    () => [...thread].reverse().find((message) => message.direction !== 'outbound') || thread[thread.length - 1],
    [thread],
  )
  const replyRecipient = displayAddress(lastInbound?.fromAddr) || displayAddress(lastInbound?.toAddr)

  const sendReply = useCallback(async () => {
    if (!lastInbound || !mailbox || !reply.trim() || sending) return
    setSending(true)
    setError('')
    try {
      const response = await fetchHelloAda('/api/helloada/mail/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          from: mailboxAddress,
          to: [replyRecipient],
          subject: replySubject(lastInbound.subject),
          text: reply.trim(),
          mailboxId: mailbox.id,
          threadId: lastInbound.threadId || undefined,
          inReplyTo: lastInbound.messageId || undefined,
          references: lastInbound.messageId || undefined,
        }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error || t('owner.messagesFailure'))
      }
      setReply('')
      setSent(true)
      await loadList()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('owner.messagesFailure'))
    } finally {
      setSending(false)
    }
  }, [lastInbound, loadList, mailbox, mailboxAddress, reply, replyRecipient, sending, t])

  if (surface === 'calendar') {
    const grouped = events.reduce<Record<string, CalendarEvent[]>>((groups, event) => {
      const key = event.startsAt || ''
      ;(groups[key] ||= []).push(event)
      return groups
    }, {})
    const dates = Object.keys(grouped).sort()
    return (
      <main className="helloada-mail">
        <header className="helloada-mail-header">
          <div>
            <p className="helloada-mail-eyebrow">{t('owner.calendar')}</p>
            <h1>{t('owner.calendar')}</h1>
          </div>
          <button type="button" className="helloada-mail-button" aria-label="Refresh calendar" title="Refresh" onClick={() => { void loadCalendar() }} disabled={loadingCalendar}>
            ↻
          </button>
        </header>
        {error && <p className="helloada-mail-error" role="alert">{error}</p>}
        {loadingCalendar && <p className="helloada-mail-empty">{t('owner.messagesLoading')}</p>}
        {!loadingCalendar && dates.length === 0 && !error && (
          <p className="helloada-mail-empty">{t('owner.messagesEmpty')}</p>
        )}
        <div className="helloada-mail-calendar">
          {dates.map((date) => (
            <section key={date} className="helloada-mail-day">
              <h2>{dayLabel(date, locale)}</h2>
              {grouped[date].map((event) => (
                <article key={event.id} className="helloada-mail-event">
                  <div>
                    <strong>{event.title}</strong>
                    {event.location && <span>{event.location}</span>}
                  </div>
                  <span>{dateLabel(event.startsAt, locale)}</span>
                </article>
              ))}
            </section>
          ))}
        </div>
      </main>
    )
  }

  return (
    <main className="helloada-mail">
      <section className="helloada-mail-list" aria-label={t('owner.messagesInbox')}>
        <header className="helloada-mail-header">
          <div>
            <p className="helloada-mail-eyebrow">{t('owner.messagesInbox')}</p>
            <h1>{t('owner.messages')}</h1>
          </div>
          <button type="button" className="helloada-mail-button" aria-label="Refresh messages" title="Refresh" onClick={() => { void loadList() }} disabled={loadingList}>
            ↻
          </button>
        </header>
        {mailboxAddress && <p className="helloada-mail-address">{mailboxAddress}</p>}
        {error && <p className="helloada-mail-error" role="alert">{error}</p>}
        {loadingList && <p className="helloada-mail-empty">{t('owner.messagesLoading')}</p>}
        {!loadingList && messages.length === 0 && !error && (
          <p className="helloada-mail-empty">{t('owner.messagesEmpty')}</p>
        )}
        <div className="helloada-mail-rows">
          {messages.map((row) => {
            const active = selected === (row.threadId || row.id)
            return (
              <button
                key={row.id}
                type="button"
                className={`helloada-mail-row${active ? ' is-active' : ''}${row.read ? '' : ' is-unread'}`}
                onClick={() => { void openThread(row) }}
              >
                <span className="helloada-mail-row-top">
                  <span className="helloada-mail-sender">{row.fromContactName || displayAddress(row.fromAddr) || t('owner.messagesFrom')}</span>
                  <span className="helloada-mail-date">{dateLabel(row.createdAt, locale)}</span>
                </span>
                <span className="helloada-mail-subject">
                  {row.subject || t('owner.messagesNoSubject')}
                  {Number(row.threadCount || 1) > 1 && <em>{row.threadCount}</em>}
                </span>
                <span className="helloada-mail-snippet">{row.snippet || ''}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="helloada-mail-reader" aria-label={t('owner.messages')}>
        {!selected && <p className="helloada-mail-empty">{t('owner.messagesSelect')}</p>}
        {selected && loadingThread && <p className="helloada-mail-empty">{t('owner.messagesLoading')}</p>}
        {selected && !loadingThread && thread.length > 0 && (
          <>
            <header className="helloada-mail-reader-header">
              <p className="helloada-mail-eyebrow">{t('owner.messagesReply')}</p>
              <h2>{thread[thread.length - 1]?.subject || t('owner.messagesNoSubject')}</h2>
            </header>
            <div className="helloada-mail-thread">
              {thread.map((message) => (
                <article key={message.id} className={`helloada-mail-message${message.direction === 'outbound' ? ' is-outbound' : ''}`}>
                  <header>
                    <strong>{message.direction === 'outbound' ? mailboxAddress : (message.fromContactName || displayAddress(message.fromAddr))}</strong>
                    <span>{dateLabel(message.createdAt, locale)}</span>
                  </header>
                  <p>{message.textBody || message.snippet || ''}</p>
                  {message.attachments && message.attachments.length > 0 && (
                    <div className="helloada-mail-attachments">
                      {message.attachments.map((attachment) => (
                        <a
                          key={attachment.id}
                          href={helloAdaPath(`/api/helloada/mail/messages/${encodeURIComponent(message.id)}/attachments/${encodeURIComponent(attachment.id)}`)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {attachment.filename}
                          {attachment.size ? ` · ${attachmentSize(attachment.size)}` : ''}
                        </a>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
            {sent && <p className="helloada-mail-sent" role="status">{t('owner.messagesSent')}</p>}
            <div className="helloada-mail-compose">
              <label htmlFor="helloada-mail-reply">{t('owner.messagesReply')}</label>
              <textarea
                id="helloada-mail-reply"
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                placeholder={t('owner.messagesDraftPlaceholder')}
                rows={5}
              />
              <div className="helloada-mail-compose-actions">
                <span>{t('owner.messagesTo')}: {replyRecipient}</span>
                <button type="button" className="helloada-mail-button is-primary" onClick={() => { void sendReply() }} disabled={!reply.trim() || sending}>
                  {sending ? t('owner.messagesDrafting') : t('owner.messagesSend')}
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  )
}
