import { useRef, useState } from 'react'
import { useFetcher, useNavigate } from 'react-router'
import { Copy, ExternalLink, Folder, LayoutDashboard, LogOut, Plus, Shield, SunMoon, Terminal } from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { toggleTheme } from '@/components/theme'
import { api } from '@/lib/api'
import type { Me, SiteSummary, SpaceSummary } from '@/lib/types'

const SEARCH_DEBOUNCE_MS = 200

export function CommandPalette({
  open,
  onOpenChange,
  user,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  user: Me | null
}) {
  const navigate = useNavigate()
  // Two independent fetchers: remote site search (driven by the input) and the caller's
  // spaces (loaded once when the palette opens). Event-driven — no effects.
  const search = useFetcher<SiteSummary[]>()
  const spacesFetcher = useFetcher<SpaceSummary[]>()
  const [query, setQuery] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const term = query.trim()
  const sites = term ? ((search.data as SiteSummary[] | undefined) ?? []) : []
  const spaces = (spacesFetcher.data as SpaceSummary[] | undefined) ?? []

  function handleOpenChange(o: boolean) {
    if (o && user && spacesFetcher.state === 'idle' && !spacesFetcher.data) spacesFetcher.load('/api/spaces/mine')
    if (!o) {
      if (timer.current) clearTimeout(timer.current)
      setQuery('')
    }
    onOpenChange(o)
  }

  // Debounced remote search. cmdk filters items client-side by their `value`; the server
  // already ranked these, so each result's value embeds the live query to survive that
  // filter while the static commands still filter naturally.
  function onSearchChange(v: string) {
    setQuery(v)
    if (timer.current) clearTimeout(timer.current)
    const q = v.trim()
    if (!q) return
    timer.current = setTimeout(() => {
      search.load(`/api/sites/search?q=${encodeURIComponent(q)}`)
    }, SEARCH_DEBOUNCE_MS)
  }

  const run = (fn: () => void) => {
    onOpenChange(false)
    fn()
  }
  const copyUrl = (url: string) => {
    void navigator.clipboard?.writeText(url)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Command palette"
      description="Search sites and run actions"
    >
      <CommandInput placeholder="Search all your sites or run a command…" onValueChange={onSearchChange} />
      <CommandList>
        <CommandEmpty>{term ? 'No matching sites.' : 'No results.'}</CommandEmpty>
        {sites.length > 0 && (
          <CommandGroup heading="Sites">
            {sites.map((s) => (
              <CommandItem
                key={s.id}
                value={`${query} site ${s.spaceSlug}/${s.siteSlug} ${s.title ?? ''}`}
                onSelect={() => run(() => window.open(s.url, '_blank', 'noopener,noreferrer'))}
              >
                <ExternalLink />
                <span className="truncate">
                  {s.title ? `${s.title} · ` : ''}
                  {s.spaceSlug}/{s.siteSlug}
                </span>
                <button
                  type="button"
                  aria-label="Copy URL"
                  title="Copy URL"
                  className="ml-auto rounded-sm p-1 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation()
                    copyUrl(s.url)
                  }}
                >
                  <Copy className="size-4" />
                </button>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandGroup heading="Navigate">
          <CommandItem onSelect={() => run(() => navigate('/dashboard'))}>
            <LayoutDashboard />
            Dashboard
          </CommandItem>
          {user?.role === 'superadmin' && (
            <CommandItem onSelect={() => run(() => navigate('/admin'))}>
              <Shield />
              Admin
            </CommandItem>
          )}
          <CommandItem onSelect={() => run(() => navigate('/dashboard?new=space'))}>
            <Plus />
            New space
          </CommandItem>
          <CommandItem onSelect={() => run(() => navigate('/cli'))}>
            <Terminal />
            Install CLI
          </CommandItem>
        </CommandGroup>
        {spaces.length > 0 && (
          <CommandGroup heading="Spaces">
            {spaces.map((sp) => (
              <CommandItem
                key={sp.id}
                value={`space ${sp.slug} ${sp.name}`}
                onSelect={() => run(() => navigate(`/${sp.slug}`))}
              >
                <Folder />
                <span className="truncate">{sp.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">{sp.slug}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandSeparator />
        <CommandGroup heading="Preferences">
          <CommandItem onSelect={() => run(toggleTheme)}>
            <SunMoon />
            Toggle theme
          </CommandItem>
          {user && (
            <CommandItem
              onSelect={() =>
                run(async () => {
                  try {
                    await api.post('/api/auth/logout')
                  } finally {
                    window.location.href = '/login'
                  }
                })
              }
            >
              <LogOut />
              Sign out
            </CommandItem>
          )}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
