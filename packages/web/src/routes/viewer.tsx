import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MessageSquarePlus } from 'lucide-react'
import { type LoaderFunctionArgs, useLoaderData } from 'react-router'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api'
import { toLogin } from '@/lib/nav'
import { comments, type Thread } from '@/lib/comments'
import { type DOMRectLike, type Intent, parseIntent } from '@/lib/parseIntent'
import type { Me, ViewerSite } from '@/lib/types'
import { Spinner } from '@/components/states'
import { PreviewToolbar } from '@/components/PreviewToolbar'
import { ReviewRail } from '@/components/review/ReviewRail'
import { Button } from '@/components/ui/button'

export async function loader({ params, request }: LoaderFunctionArgs) {
  try {
    return await api.get<ViewerSite>(`/api/sites/${params.space}/${params.site}`)
  } catch (err) {
    // 401 → sign in, returning here afterward; 403/404/410 bubble to the ErrorBoundary.
    if (err instanceof ApiError && err.status === 401) throw toLogin(request)
    throw err
  }
}

type Pending = { quote: string; prefix: string; suffix: string; rect?: DOMRectLike }

// One persistent iframe hosts the deployed HTML for the whole tab; opening comments slides a rail
// in beside it WITHOUT reloading the frame. For review-capable (non-public) sites the iframe always
// runs the annotate client (?glance_annotate=1), so toggling comments is a pure layout change — only
// the rail and the in-page affordances are gated on `review`. Public sites have no comments (the
// anonymous-spam exclusion), so they load the plain URL and never offer the rail.
export function Component() {
  const site = useLoaderData() as ViewerSite
  const canReview = site.visibility !== 'public'

  const iframeRef = useRef<HTMLIFrameElement>(null)
  const contentOrigin = useMemo(() => new URL(site.contentUrl).origin, [site.contentUrl])
  const src = useMemo(
    () => (canReview ? withAnnotate(site.contentUrl) : site.contentUrl),
    [site.contentUrl, canReview],
  )

  const [review, setReview] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [me, setMe] = useState<Me | null>(null)
  const [filePath, setFilePath] = useState<string | null>(null)
  const [threads, setThreads] = useState<Thread[]>([])
  const [selection, setSelection] = useState<Pending | null>(null)
  const [composing, setComposing] = useState<Pending | null>(null)

  // Paint the (non-orphaned) anchors back into the iframe via the trusted parent→child channel —
  // only while reviewing; leaving review repaints with [] so the highlights clear.
  const paint = useCallback(() => {
    const win = iframeRef.current?.contentWindow
    if (!win) return
    const anchors = review
      ? threads
          .filter((t) => t.anchorType === 'text' && t.quote && t.anchorStatus !== 'orphaned')
          .map((t) => ({ id: t.id, quote: t.quote as string }))
      : []
    win.postMessage({ type: 'glance:paint', anchors }, contentOrigin)
  }, [threads, contentOrigin, review])

  const refresh = useCallback(
    async (fp: string) => {
      try {
        setThreads(await comments.list(site, fp))
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'Failed to load comments')
      }
    },
    [site],
  )

  // Listen for intents from the iframe. parseIntent re-validates origin+source; it is a filter,
  // not a trust oracle — nothing here writes without a subsequent explicit user action.
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      const intent: Intent | null = parseIntent(e, { origin: contentOrigin, source: iframeRef.current?.contentWindow ?? null })
      if (!intent) return
      if (intent.type === 'ready') setFilePath(intent.filePath)
      else if (intent.type === 'select') setSelection({ quote: intent.quote, prefix: intent.prefix, suffix: intent.suffix, rect: intent.rect })
      else if (intent.type === 'clear') setSelection(null)
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [contentOrigin])

  useEffect(() => {
    if (canReview) api.get<Me>('/api/auth/me').then(setMe).catch(() => setMe(null))
  }, [canReview])

  // Load threads lazily the first time comments open (and refresh on re-entry). The frame is already
  // mounted, so this is just a fetch — never a reload.
  useEffect(() => {
    if (review && filePath) refresh(filePath)
  }, [review, filePath, refresh])

  useEffect(paint, [paint])

  const startComposer = () => {
    setComposing(selection)
    setSelection(null)
  }

  async function createThread(body: string) {
    if (!filePath || !composing) return
    try {
      await comments.create(site, { filePath, body, quote: composing.quote, prefix: composing.prefix, suffix: composing.suffix })
      setComposing(null)
      await refresh(filePath)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to add comment')
    }
  }

  function exitReview() {
    setReview(false)
    setSelection(null)
    setComposing(null)
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-background md:flex-row">
      <div className="relative min-h-0 min-w-0 flex-1">
        <iframe
          ref={iframeRef}
          className="size-full border-0"
          src={src}
          title={site.title ?? site.siteSlug}
          onLoad={() => setLoaded(true)}
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        />
        {review && selection?.rect && (
          <Button
            size="sm"
            className="absolute z-10 shadow-lg"
            style={{ top: selection.rect.top + selection.rect.height + 6, left: selection.rect.left }}
            onClick={startComposer}
          >
            <MessageSquarePlus className="size-3.5" />
            Comment
          </Button>
        )}
        {!loaded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background text-muted-foreground">
            <Spinner className="size-6" />
            <span className="text-sm">Loading preview…</span>
          </div>
        )}
      </div>

      {review ? (
        <ReviewRail
          site={site}
          me={me}
          threads={threads}
          composing={composing}
          onCancelComposer={() => setComposing(null)}
          onCreate={createThread}
          onChanged={() => filePath && refresh(filePath)}
          onFocusAnchor={(quote) => iframeRef.current?.contentWindow?.postMessage({ type: 'glance:focus', quote }, contentOrigin)}
          onExit={exitReview}
        />
      ) : (
        <PreviewToolbar site={site} onReview={canReview ? () => setReview(true) : undefined} />
      )}
    </div>
  )
}

function withAnnotate(u: string): string {
  const url = new URL(u)
  url.searchParams.set('glance_annotate', '1')
  return url.toString()
}
