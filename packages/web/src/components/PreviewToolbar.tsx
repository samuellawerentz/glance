import { useRef, useState } from 'react'
import { Home, MessageSquare } from 'lucide-react'
import { Link } from 'react-router'
import type { ViewerSite } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ShareDialog } from '@/components/ShareDialog'

// Liquid-glass floating menu pinned to the bottom of the full-bleed preview: a compact, always-open
// pill of icon-only actions (Home, Comments, Share). Icon-only so it doesn't hinder the content;
// labels live on hover (title/aria-label). It idle-fades when the cursor leaves to stay out of the
// way — timer is event-driven (ref callback arms it, hover wakes it) per the no-useEffect rule.
// The glass look layers three things: (1) an SVG feTurbulence→feDisplacementMap refraction applied
// to the backdrop (Chromium-only; degrades to plain blur elsewhere), (2) blur+saturate+brightness
// to lift the backdrop, (3) inset specular highlights + a top sheen for the curved-glass edge.
export function PreviewToolbar({ site, onReview }: { site: ViewerSite; onReview?: () => void }) {
  const [dimmed, setDimmed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const armed = useRef(false)

  function clear() {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  function arm() {
    clear()
    timer.current = setTimeout(() => setDimmed(true), 2800)
  }
  function wake() {
    clear()
    setDimmed(false)
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      {/* Refraction filter: organic turbulence warps the backdrop near the pill like real curved
          glass (the signature liquid-glass cue, beyond a flat blur). Referenced by backdrop-filter
          below. SVG-as-backdrop-filter is Chromium-only; elsewhere the url() no-ops and the blur
          fallback still reads as glass. Rendered once; scales to any pill width (no bespoke map). */}
      <svg aria-hidden="true" role="presentation" className="absolute size-0">
        <filter
          id="liquid-glass"
          x="-30%"
          y="-30%"
          width="160%"
          height="160%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence type="fractalNoise" baseFrequency="0.013 0.017" numOctaves="2" seed="11" result="noise" />
          <feGaussianBlur in="noise" stdDeviation="2.4" result="smooth" />
          <feDisplacementMap in="SourceGraphic" in2="smooth" scale="12" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <div
        ref={(n) => {
          if (n && !armed.current) {
            armed.current = true
            arm()
          }
        }}
        onMouseEnter={wake}
        onMouseLeave={arm}
        style={{
          opacity: dimmed ? 0.4 : 1,
          // url() refraction (Chromium) + tone-lift; Safari/-webkit gets glass without the warp.
          backdropFilter: 'url(#liquid-glass) blur(3px) saturate(180%) brightness(1.08)',
          WebkitBackdropFilter: 'blur(3px) saturate(180%) brightness(1.08)',
          // Curved-glass depth: bright top inner edge, soft bottom light-wrap, hairline rim, drop.
          boxShadow:
            'inset 0 1px 1px rgba(255,255,255,0.8), inset 0 -1px 2px rgba(255,255,255,0.22), inset 0 0 0 1px rgba(255,255,255,0.12), 0 8px 32px rgba(0,0,0,0.18)',
        }}
        className={cn(
          'pointer-events-auto relative flex items-center gap-0.5 overflow-hidden rounded-full p-1',
          'border border-white/30 bg-background/45',
          'transition-opacity duration-500',
        )}
      >
        {/* top sheen — the bright specular highlight of curved glass */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-2/3 bg-gradient-to-b from-white/30 via-white/5 to-transparent"
        />
        {/* bottom inner light-wrap — thin caustic line under the glass */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-5 bottom-0 h-px bg-gradient-to-r from-transparent via-white/45 to-transparent"
        />

        {/* icon-only actions */}
        <div className="relative flex items-center gap-0.5">
          <Button asChild variant="ghost" size="icon" className="size-8 rounded-full" title="Home" aria-label="Home">
            <Link to="/dashboard">
              <Home />
            </Link>
          </Button>
          {onReview && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-full"
              onClick={onReview}
              title="Comments"
              aria-label="Comments"
            >
              <MessageSquare />
            </Button>
          )}
          {site.isOwner && <ShareDialog spaceSlug={site.spaceSlug} siteSlug={site.siteSlug} title={site.title} compact />}
        </div>
      </div>
    </div>
  )
}
