'use client'

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'

import { useHelloAdaTranslations } from '../api/useHelloAdaTranslations'
import {
  filterPageRoutes,
  groupPageRoutes,
  pagePickerLabel,
  type PagePickerRoute,
} from '../lib/page-picker'
import { WorkspaceIcon } from './WorkspaceIcon'

type WorkspacePagePickerProps = {
  routes: PagePickerRoute[]
  value: string
  homeLabel: string
  disabled?: boolean
  onSelect: (path: string) => void
}

export function WorkspacePagePicker({ routes, value, homeLabel, disabled, onSelect }: WorkspacePagePickerProps) {
  const { t } = useHelloAdaTranslations()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const allRoutes = useMemo(() => routes.some((route) => route.path === '/')
    ? routes
    : [{ path: '/', kind: 'page', collection: '', sourceId: '' }, ...routes], [routes])
  const groups = useMemo(() => groupPageRoutes(allRoutes, query, homeLabel), [allRoutes, homeLabel, query])
  const visibleRoutes = useMemo(() => groups.flatMap((group) => group.routes), [groups])
  const matchCount = useMemo(() => filterPageRoutes(allRoutes, query, homeLabel).length, [allRoutes, homeLabel, query])
  const optionIndex = useMemo(
    () => new Map(visibleRoutes.map((route, index) => [`${route.path}:${route.sourceId}`, index])),
    [visibleRoutes],
  )
  const selectedRoute = allRoutes.find((route) => route.path === value)
  const selectedLabel = value === '/' ? homeLabel : selectedRoute ? pagePickerLabel(selectedRoute, homeLabel) : value
  const activeIndex = Math.min(active, Math.max(0, visibleRoutes.length - 1))

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [open])

  useEffect(() => {
    if (!open) return
    document.getElementById(`helloada-page-picker-option-${activeIndex}`)?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open])

  const close = () => {
    setOpen(false)
    setQuery('')
    setActive(0)
  }

  const choose = (path: string) => {
    onSelect(path)
    close()
  }

  const openPicker = () => {
    setQuery('')
    setActive(0)
    setOpen(true)
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive(visibleRoutes.length ? (activeIndex + 1) % visibleRoutes.length : 0)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive(visibleRoutes.length ? (activeIndex - 1 + visibleRoutes.length) % visibleRoutes.length : 0)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const route = visibleRoutes[activeIndex]
      if (route) choose(route.path)
    }
  }

  return (
    <div className="helloada-page-control">
      <button
        type="button"
        className="helloada-page-picker-trigger"
        aria-label={t('workspace.visiblePage')}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={selectedLabel}
        disabled={disabled}
        onClick={openPicker}
      >
        <span>{selectedLabel}</span>
        <WorkspaceIcon name="chevron" size={14} />
      </button>
      <dialog
        ref={dialogRef}
        className="helloada-page-picker-dialog"
        aria-labelledby="helloada-page-picker-title"
        onClose={close}
        onCancel={(event) => {
          event.preventDefault()
          close()
        }}
        onClick={(event) => {
          if (event.target === dialogRef.current) close()
        }}
      >
        <section className="helloada-page-picker">
          <header className="helloada-page-picker-header">
            <div>
              <span className="helloada-page-picker-kicker">{t('workspace.pagePickerKicker')}</span>
              <h2 id="helloada-page-picker-title">{t('workspace.pagePickerTitle')}</h2>
            </div>
            <button type="button" className="helloada-page-picker-close" aria-label={t('workspace.pagePickerClose')} onClick={close}>
              <WorkspaceIcon name="close" size={16} />
            </button>
          </header>
          <label className="helloada-page-picker-search">
            <WorkspaceIcon name="search" size={16} />
            <input
              ref={inputRef}
              type="search"
              value={query}
              placeholder={t('workspace.pagePickerSearch')}
              aria-label={t('workspace.pagePickerSearch')}
              aria-controls="helloada-page-picker-results"
              aria-activedescendant={visibleRoutes.length ? `helloada-page-picker-option-${activeIndex}` : undefined}
              onChange={(event) => {
                setQuery(event.target.value)
                setActive(0)
              }}
              onKeyDown={handleKeyDown}
            />
          </label>
          <div className="helloada-page-picker-results" id="helloada-page-picker-results" role="listbox" aria-label={t('workspace.pagePickerTitle')}>
            {groups.length ? groups.map((group) => (
              <section
                key={group.key}
                className="helloada-page-picker-group"
                role="group"
                aria-labelledby={`helloada-page-picker-group-${group.key}`}
              >
                <h3 id={`helloada-page-picker-group-${group.key}`}>
                  {t(`workspace.pagePickerGroup.${group.key}`)}
                  <span>{group.total}</span>
                </h3>
                {group.routes.map((route) => {
                  const index = optionIndex.get(`${route.path}:${route.sourceId}`) || 0
                  const current = route.path === value
                  return (
                    <button
                      key={`${route.path}:${route.sourceId}`}
                      id={`helloada-page-picker-option-${index}`}
                      type="button"
                      role="option"
                      aria-selected={current}
                      className={`helloada-page-picker-option ${index === activeIndex ? 'is-active' : ''} ${current ? 'is-current' : ''}`}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => choose(route.path)}
                    >
                      <span className="helloada-page-picker-option-label">{pagePickerLabel(route, homeLabel)}</span>
                      <span className="helloada-page-picker-option-path">{route.path}</span>
                      {current ? <span className="helloada-page-picker-option-current">{t('workspace.pagePickerCurrent')}</span> : null}
                    </button>
                  )
                })}
              </section>
            )) : (
              <p className="helloada-page-picker-empty">{t('workspace.pagePickerEmpty')}</p>
            )}
          </div>
          <footer className="helloada-page-picker-footer">
            <span>{query.trim()
              ? t('workspace.pagePickerMatches').replace('{count}', String(matchCount))
              : t('workspace.pagePickerSearchHint').replace('{total}', String(allRoutes.length))}</span>
            {visibleRoutes.length < matchCount ? (
              <span>{t('workspace.pagePickerShowing')
                .replace('{shown}', String(visibleRoutes.length))
                .replace('{total}', String(matchCount))}</span>
            ) : null}
          </footer>
        </section>
      </dialog>
    </div>
  )
}
