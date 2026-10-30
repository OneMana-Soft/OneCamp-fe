"use client"

import * as React from 'react'
import { drawnSelected } from "@/components/minimal-tiptap/utils"
import { createPortal } from 'react-dom'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import type { ElementDimensions } from '../hooks/use-drag-resize'
import { useDragResize } from '../hooks/use-drag-resize'
import { ResizeHandle } from './resize-handle'
import { cn } from '@/lib/utils/helpers/cn'
import { AlertCircle, AlignCenter, AlignLeft, Copy, Crop, Download, Link2, Maximize2, Replace, RotateCcw, StretchHorizontal, Type, WifiOff, X } from '@/lib/icons'
import { FloatingBar, FloatingBarButton, FloatingBarDivider } from '@/components/ui/FloatingBar'
import { toast } from '@/hooks/use-toast'
import { useMediaFetch } from '@/hooks/useFetch'
import { isComposingKey } from '@/lib/keys/ime'
import { onEscape } from '@/lib/keys/onEscape'
import { GetMediaURLRes } from '@/types/file'
import { useGuestReader } from '@/components/minimal-tiptap/guestReader'
import { busFor } from '@/components/docEditor/registry/commandBus'
import { viewableFileUrl } from '@/lib/docFiles'
import { isSafeHref } from '@/lib/utils/safeHref'
import { imageUploadsOf, isImagePlaceholder } from '../uploads'
import { cropBox } from '../crop'
import { ImagePlaceholder, useImageUpload } from './image-placeholder'
import { ix } from "@/lib/ui/interactive"

const MAX_HEIGHT = 600
const MIN_HEIGHT = 120
const MIN_WIDTH = 120
// Fallback display cap when no editor column width can be measured. Keeps a
// lone GIF/image from blowing out the layout while still being comfortably
// large on desktop and full-bleed on mobile (clamped by maxWidth:100%).
const MAX_DISPLAY_WIDTH = 480

// isCrossOrigin reports whether an absolute http(s) URL points at a different
// origin than the app. Cross-origin images (Giphy, third-party CDNs) must be
// rendered directly in <img> and never fetched via the credentialed axios
// client, which would trip CORS. Relative URLs ("/getFile/…") are same-origin.
function isCrossOrigin(src: string): boolean {
  if (!/^https?:\/\//i.test(src)) return false // relative → same-origin
  try {
    if (typeof window === "undefined") return true
    return new URL(src, window.location.href).origin !== window.location.origin
  } catch {
    return true
  }
}

// measureColumnWidth resolves the available display width for an image. It
// prefers the editor's --editor-width CSS var (the text column width) when
// defined, otherwise measures the node's own container, and finally falls back
// to MAX_DISPLAY_WIDTH. This keeps a lone GIF/image sized to the column rather
// than to a tiny first-paint placeholder, on both desktop and mobile. The var
// is read on the editor's own container: it isn't inherited (styles/index.css).
export function measureColumnWidth(el: HTMLElement | null): number {
  if (!el) return MAX_DISPLAY_WIDTH
  const host = el.closest<HTMLElement>('[data-measured="editor"]') ?? el
  const cssVar = parseFloat(getComputedStyle(host).getPropertyValue('--editor-width'))
  if (cssVar && cssVar > 0) return cssVar
  const measured = el.clientWidth
  if (measured && measured > 0) return measured
  return MAX_DISPLAY_WIDTH
}

/** Whether the browser says it is online (true where it can't tell). */
function useOnline(): boolean {
  return React.useSyncExternalStore(
    (cb) => {
      window.addEventListener('online', cb)
      window.addEventListener('offline', cb)
      return () => {
        window.removeEventListener('online', cb)
        window.removeEventListener('offline', cb)
      }
    },
    () => navigator.onLine !== false,
    () => true,
  )
}

/** The doc's block actions on this picture (links-media/blockActions.ts), as the block menu runs them. */
function runAction(editor: NodeViewProps['editor'], getPos: NodeViewProps['getPos'], size: number, id: 'crop' | 'alt' | 'link' | 'replace') {
  const bus = busFor(editor)
  const pos = typeof getPos === 'function' ? getPos() : undefined
  if (!bus || pos == null) return
  void import('../../links-media/blockActions').then((m) =>
    m.runBlockAction(id, { docId: bus.docId, editor, canEdit: true, bus, state: { range: { from: pos, to: pos + size } } }),
  )
}

const ALIGN = { left: 'mr-auto', center: 'mx-auto', full: 'w-full' } as const
type Align = keyof typeof ALIGN

interface ImageState {
  imageLoaded: boolean
  isZoomed: boolean
  error: boolean
  /** Loads tried after a failure; each asks for the picture again. */
  attempt: number
  naturalSize: ElementDimensions
}

/**
 * An image in the editor. One with no address yet is its upload's placeholder
 * (ImagePlaceholder, uploads.ts): the document never holds a `blob:` address
 * while a file uploads. Two components, so moving from one to the other never
 * changes the hooks a component runs.
 */
export const ImageViewBlock: React.FC<NodeViewProps> = (props) =>
  isImagePlaceholder(props.node.attrs) ? <ImagePlaceholder {...props} /> : <ImageView {...props} />

const ImageView: React.FC<NodeViewProps> = ({ editor, node, selected, updateAttributes, getPos }) => {
  const { src: storedSrc, width: initialWidth, height: initialHeight } = node.attrs
  const guest = useGuestReader()
  const online = useOnline()
  const src = typeof storedSrc === 'string' ? storedSrc : ''
  const align: Align = node.attrs.align in ALIGN ? node.attrs.align : 'center'
  const crop = cropBox(node.attrs.crop)
  const cropped = crop.w < 1 || crop.h < 1
  const href = typeof node.attrs.href === 'string' && isSafeHref(node.attrs.href) && /^https?:\/\//i.test(node.attrs.href) ? node.attrs.href : ''
  // The doc's own editing: a doc's editor (it has a bus), someone who can edit.
  const docEditing = editor.isEditable && !!busFor(editor)

  // Just uploaded in this tab: the file's own preview stands in until the
  // uploaded copy has loaded, then is let go. A picture being replaced keeps
  // its old self while the new one goes up, with the progress on it.
  const uploads = imageUploadsOf(editor)
  const uploadId = typeof node.attrs.id === 'string' ? node.attrs.id : ''
  const upload = useImageUpload(uploads, uploadId)
  const preview = upload?.status === 'done' ? upload.preview : undefined

  const [imageState, setImageState] = React.useState<ImageState>({
    imageLoaded: false,
    isZoomed: false,
    error: false,
    attempt: 0,
    naturalSize: { width: initialWidth, height: initialHeight },
  })

  const shouldFetchMedia = React.useMemo(() => {
    if (!src || guest || src.startsWith('blob:') || src.startsWith('data:')) return false
    if (!(src.startsWith('http') || src.startsWith('/'))) return false
    // Only OneCamp's OWN media-resolution endpoints return a {url} JSON that
    // needs an authenticated fetch. A truly cross-origin image (Giphy, any
    // third-party CDN, or an absolute URL on another host) is already a
    // directly-renderable <img> source; fetching it via axios (which sends
    // withCredentials:true) trips CORS. Same-origin direct attachment
    // endpoints stream or redirect to storage and render fine in <img>.
    if (isCrossOrigin(src)) return false
    return !src.includes('/getDocAttachment/') && !src.includes('/getFile/')
  }, [src, guest])

  // Never for a guest: they have no session, and a 401 signs the page out.
  const { data: mediaData } = useMediaFetch<GetMediaURLRes>(shouldFetchMedia ? src : '')
  const base = mediaData?.url || viewableFileUrl(src, guest)
  // A try again asks for the picture anew (a fresh signed address from the server).
  const displaySrc = imageState.attempt ? `${base}${base.includes('?') ? '&' : '?'}r=${imageState.attempt}` : base

  const containerRef = React.useRef<HTMLDivElement>(null)
  const [activeResizeHandle, setActiveResizeHandle] = React.useState<'left' | 'right' | null>(null)

  const onDimensionsChange = React.useCallback(
    ({ width, height }: ElementDimensions) => {
      updateAttributes({ width, height })
    },
    [updateAttributes],
  )

  // What shows of the picture: the crop's part of it.
  const shown = { width: imageState.naturalSize.width * crop.w, height: imageState.naturalSize.height * crop.h }
  const aspectRatio = shown.width / shown.height
  const maxWidth = MAX_HEIGHT * aspectRatio
  const containerMaxWidth = measureColumnWidth(containerRef.current)

  const { currentWidth, currentHeight, updateDimensions, initiateResize, isResizing } = useDragResize({
    initialWidth: initialWidth ?? shown.width,
    initialHeight: initialHeight ?? shown.height,
    contentWidth: shown.width,
    contentHeight: shown.height,
    gridInterval: 0.1,
    onDimensionsChange,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    maxWidth: containerMaxWidth > 0 ? containerMaxWidth : maxWidth,
  })

  // Whether we have real, positive pixel dimensions for this image yet.
  // Fresh /giphy inserts and legacy posts whose stored HTML has no width/height
  // attrs start with undefined dimensions (currentWidth/currentHeight are NaN
  // until the image's onLoad computes them). Reserving layout height up front
  // for those cases is what prevents the virtualized message list from
  // overlapping rows: without it the row paints at ~0px, then jumps to full
  // height when the bytes arrive, landing on top of the next message.
  const hasPixelDims = Number.isFinite(currentWidth) && Number.isFinite(currentHeight) && currentWidth > 0 && currentHeight > 0
  const full = align === 'full'

  // Placeholder height reserved while dimensions are unknown (pre-load).
  const UNKNOWN_DIMS_MIN_HEIGHT = 160

  React.useEffect(() => {
    setImageState((prev) => (prev.error ? { ...prev, error: false, imageLoaded: false, attempt: 0 } : prev))
  }, [src])

  // A picture that couldn't load comes back by itself with the connection.
  React.useEffect(() => {
    if (!imageState.error) return
    const again = () => setImageState((prev) => ({ ...prev, error: false, imageLoaded: false, attempt: prev.attempt + 1 }))
    window.addEventListener('online', again)
    return () => window.removeEventListener('online', again)
  }, [imageState.error])

  const handleImageLoad = React.useCallback(
    (ev: React.SyntheticEvent<HTMLImageElement>) => {
      const img = ev.target as HTMLImageElement
      const natural = { width: img.naturalWidth, height: img.naturalHeight }
      setImageState((prev) => ({ ...prev, naturalSize: natural, imageLoaded: true, error: false }))
      // The uploaded copy is showing: the local preview can go.
      if (upload?.status === 'done' && uploadId) uploads?.remove(uploadId)

      // Size from the image's INTRINSIC (natural) dimensions, not img.width:
      // img.width is the *rendered* width, which on first paint is the tiny
      // placeholder size. Natural size (of the crop's part), capped to the
      // editor column width, gives a correctly-sized image on desktop and phone.
      if (!natural.width || !natural.height) return
      const part = { width: natural.width * crop.w, height: natural.height * crop.h }
      const colWidth = measureColumnWidth(containerRef.current)
      // Never upscale past the image's own resolution; cap to the column width.
      const cap = Math.min(colWidth || MAX_DISPLAY_WIDTH, MAX_DISPLAY_WIDTH)
      const targetWidth = Math.round(Math.min(part.width, cap))
      // Only an editor fills in a size, and only a missing one: a size
      // someone set stays (it was reset to 480 px on every load, by readers too).
      if (!editor.isEditable) return
      if (!initialWidth || !initialHeight) {
        updateAttributes({ width: initialWidth || targetWidth, height: Math.round((initialWidth || targetWidth) * (part.height / part.width)) })
      }
      if (!initialWidth) updateDimensions((state) => ({ ...state, width: targetWidth }))
    },
    [initialWidth, initialHeight, updateAttributes, updateDimensions, upload?.status, uploadId, uploads, crop.w, crop.h, editor],
  )

  const handleImageError = React.useCallback(() => {
    setImageState((prev) => ({ ...prev, error: true, imageLoaded: true }))
    if (upload?.status === 'done' && uploadId) uploads?.remove(uploadId)
  }, [upload?.status, uploadId, uploads])

  const closeZoom = React.useCallback(() => {
    setImageState((prev) => (prev.isZoomed ? { ...prev, isZoomed: false } : prev))
  }, [])

  // Close the lightbox on Escape and lock body scroll while it's open.
  React.useEffect(() => {
    if (!imageState.isZoomed) return
    const stopEscape = onEscape('overlay', closeZoom)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      stopEscape()
      document.body.style.overflow = prevOverflow
    }
  }, [imageState.isZoomed, closeZoom])

  const handleResizeStart = React.useCallback(
    (direction: 'left' | 'right') => (event: React.PointerEvent<HTMLDivElement>) => {
      setActiveResizeHandle(direction)
      initiateResize(direction)(event)
    },
    [initiateResize],
  )

  React.useEffect(() => {
    if (!isResizing) setActiveResizeHandle(null)
  }, [isResizing])

  const name = String(node.attrs.fileName || node.attrs.alt || 'picture')
  const fileTools = React.useMemo(
    () => ({
      download: () => void import('../../links-media/blockActions').then((m) => m.downloadFile(src, name, guest)),
      copy: async () => {
        try {
          const blob = await (await fetch(displaySrc)).blob()
          await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
          toast({ title: 'Picture copied' })
        } catch {
          toast({ title: "Couldn't copy the picture", description: 'Download it instead, or copy it from the full view.', variant: 'destructive' })
        }
      },
    }),
    [src, name, guest, displaySrc],
  )

  const loading = !imageState.imageLoaded && !imageState.error
  const replacing = !!upload && upload.status !== 'done'
  const pos = () => (typeof getPos === 'function' ? getPos() : undefined)
  const act = (id: 'crop' | 'alt' | 'link' | 'replace') => runAction(editor, getPos, node.nodeSize, id)

  // A box can hold its pictures shorter than a message shows them
  // (--editor-image-max-h, set by the phone's box): the picture keeps its
  // shape, narrower, so the words around it stay in the box's height. Unset,
  // the picture is as it always was.
  const frame: React.CSSProperties = full
    ? { width: '100%', aspectRatio: hasPixelDims && Number.isFinite(aspectRatio) ? String(aspectRatio) : undefined }
    : {
        width: hasPixelDims ? `min(${currentWidth}px, calc(var(--editor-image-max-h, 99999px) * ${currentWidth / currentHeight}))` : '100%',
        maxWidth: '100%',
        aspectRatio: hasPixelDims ? `${currentWidth} / ${currentHeight}` : undefined,
        minHeight: hasPixelDims ? undefined : `min(${UNKNOWN_DIMS_MIN_HEIGHT}px, var(--editor-image-max-h, ${UNKNOWN_DIMS_MIN_HEIGHT}px))`,
        maxHeight: cropped ? undefined : `var(--editor-image-max-h, ${MAX_HEIGHT}px)`,
      }
  // The crop's part, scaled to fill the frame: the picture runs past it on every side.
  const cropStyle: React.CSSProperties | undefined = cropped
    ? { position: 'absolute', width: `${100 / crop.w}%`, height: `${100 / crop.h}%`, left: `${(-crop.x / crop.w) * 100}%`, top: `${(-crop.y / crop.h) * 100}%`, maxWidth: 'none' }
    : undefined

  const img =
    !displaySrc || imageState.error ? null : (
      <img
        key={imageState.attempt}
        src={displaySrc}
        className={cn('rounded object-contain transition-opacity duration-[140ms]', {
          'opacity-0': !imageState.imageLoaded,
          'cursor-zoom-in': !editor.isEditable && imageState.imageLoaded && !href,
          'cursor-pointer': !editor.isEditable && !!href,
        })}
        style={cropStyle ?? { width: '100%', height: hasPixelDims || full ? '100%' : 'auto' }}
        width={cropped ? undefined : currentWidth}
        height={cropped ? undefined : currentHeight}
        onError={handleImageError}
        onLoad={handleImageLoad}
        onClick={() => {
          // A reader's click opens the picture's link, else the full view
          // (as Notion's and Slack's). In the editor a click selects it.
          if (editor.isEditable || !imageState.imageLoaded || imageState.error) return
          if (href) window.open(href, '_blank', 'noopener,noreferrer')
          else setImageState((prev) => ({ ...prev, isZoomed: true }))
        }}
        alt={node.attrs.alt || ''}
        title={node.attrs.title || undefined}
        id={node.attrs.id || undefined}
        draggable={false}
      />
    )

  return (
    <NodeViewWrapper ref={containerRef} data-drag-handle data-image-align={align} className="relative">
      <div className={cn('group/node-image relative', ALIGN[align])} style={full ? undefined : { maxWidth: `min(${maxWidth}px, 100%)`, width: hasPixelDims ? currentWidth : '100%' }}>
        <div
          className={cn('relative overflow-hidden rounded-md', {
            'outline outline-2 outline-offset-1 outline-brand': drawnSelected(editor, selected) || isResizing,
            'bg-sunken': loading || imageState.error,
          })}
          style={frame}
        >
          {/* The file as it was picked, while its uploaded copy loads. */}
          {preview && !imageState.imageLoaded ? <img src={preview} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full rounded object-contain" /> : null}
          {img}

          {imageState.error ? (
            <div role="alert" className="absolute inset-0 flex min-h-[160px] flex-col items-center justify-center gap-2 p-4 text-center">
              {online ? <AlertCircle className="size-5 text-danger-ink" aria-hidden="true" /> : <WifiOff className="size-5 text-ink-3" aria-hidden="true" />}
              <p className="text-ui-sm font-medium text-ink">{online ? "This picture couldn't load." : "You're offline. The picture shows when you're back online."}</p>
              {node.attrs.alt ? <p className="max-w-[40ch] text-meta text-ink-3">{node.attrs.alt}</p> : null}
              {online ? (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setImageState((prev) => ({ ...prev, error: false, imageLoaded: false, attempt: prev.attempt + 1 }))}
                  className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-raised px-2.5 text-ui-sm font-medium text-ink shadow-e1 outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand [&_svg]:size-3.5"
                >
                  <RotateCcw aria-hidden="true" />
                  Try again
                </button>
              ) : null}
            </div>
          ) : null}

          {replacing ? (
            upload!.status === 'failed' ? (
              <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-sheet/80 p-4 text-center">
                <p className="text-ui-sm font-medium text-ink">Couldn&apos;t upload the new picture.</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      const upload = editor.extensionManager.extensions.find((e) => e.name === 'image')?.options.uploadFn
                      if (upload) void import('../../links-media/blockActions').then((m) => m.replaceUpload(editor, uploadId, 'image', upload))
                    }}
                    className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-raised px-2.5 text-ui-sm font-medium text-ink shadow-e1 outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand [&_svg]:size-3.5"
                  >
                    <RotateCcw aria-hidden="true" />
                    Try again
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => uploads?.remove(uploadId)}
                    className="inline-flex h-7 items-center rounded-lg px-2.5 text-ui-sm font-medium text-ink-2 outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    Keep this one
                  </button>
                </div>
              </div>
            ) : (
              <div className="absolute inset-x-4 bottom-4 h-1 overflow-hidden rounded-xs bg-press">
                <div
                  role="progressbar"
                  aria-label="Uploading the new picture"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(upload!.progress * 100)}
                  className="h-full origin-left bg-brand transition-transform duration-[160ms] ease-[var(--ease-out)]"
                  style={{ transform: `scaleX(${Math.max(0.04, upload!.progress)})` }}
                />
              </div>
            )
          ) : null}

          {href && docEditing && imageState.imageLoaded ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="absolute left-2 top-2 inline-flex h-6 max-w-[60%] items-center gap-1 rounded-md bg-pop px-2 text-meta font-medium text-ink-2 shadow-e1 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Link2 className="size-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{href.replace(/^https?:\/\/(www\.)?/, '')}</span>
            </a>
          ) : null}
        </div>

        {editor.isEditable && imageState.imageLoaded && !imageState.error && !full ? (
          <>
            <ResizeHandle onPointerDown={handleResizeStart('left')} className={cn('left-1', { hidden: isResizing && activeResizeHandle === 'right' })} isResizing={isResizing && activeResizeHandle === 'left'} />
            <ResizeHandle onPointerDown={handleResizeStart('right')} className={cn('right-1', { hidden: isResizing && activeResizeHandle === 'left' })} isResizing={isResizing && activeResizeHandle === 'right'} />
          </>
        ) : null}

        {!isResizing && imageState.imageLoaded && !imageState.error ? (
          <FloatingBar
            label="Picture"
            className={cn(
              'absolute right-2 top-2 opacity-0 transition-opacity duration-[140ms] focus-within:opacity-100 group-hover/node-image:opacity-100 [@media(hover:none)]:opacity-100 max-sm:hidden',
              drawnSelected(editor, selected) && 'opacity-100',
            )}
          >
            {docEditing ? (
              <>
                <FloatingBarButton label="Align left" active={align === 'left'} onClick={() => updateAttributes({ align: 'left' })}>
                  <AlignLeft />
                </FloatingBarButton>
                <FloatingBarButton label="Centre" active={align === 'center'} onClick={() => updateAttributes({ align: null })}>
                  <AlignCenter />
                </FloatingBarButton>
                <FloatingBarButton label="Full width" active={full} onClick={() => updateAttributes({ align: full ? null : 'full' })}>
                  <StretchHorizontal />
                </FloatingBarButton>
                <FloatingBarDivider />
                <FloatingBarButton label="Crop" onClick={() => act('crop')}>
                  <Crop />
                </FloatingBarButton>
                <FloatingBarButton label="Alt text" active={!!node.attrs.alt} onClick={() => act('alt')}>
                  <Type />
                </FloatingBarButton>
                <FloatingBarButton label={href ? 'Edit the link' : 'Link'} active={!!href} onClick={() => act('link')}>
                  <Link2 />
                </FloatingBarButton>
                <FloatingBarButton label="Replace" onClick={() => act('replace')}>
                  <Replace />
                </FloatingBarButton>
                <FloatingBarDivider />
              </>
            ) : null}
            <FloatingBarButton label="Full view" onClick={() => setImageState((prev) => ({ ...prev, isZoomed: true }))}>
              <Maximize2 />
            </FloatingBarButton>
            <FloatingBarButton label="Download" onClick={fileTools.download}>
              <Download />
            </FloatingBarButton>
            <FloatingBarButton label="Copy the picture" onClick={() => void fileTools.copy()}>
              <Copy />
            </FloatingBarButton>
          </FloatingBar>
        ) : null}

        {/* Caption */}
        {editor.isEditable && imageState.imageLoaded && !imageState.error ? (
          <input
            type="text"
            aria-label="Caption"
            placeholder="Add a caption"
            defaultValue={node.attrs.caption || ''}
            onBlur={(e) => e.target.value !== (node.attrs.caption || '') && updateAttributes({ caption: e.target.value || null })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isComposingKey(e.nativeEvent)) {
                e.preventDefault()
                const at = pos()
                editor.chain().focus(at == null ? undefined : at + node.nodeSize).createParagraphNear().run()
              }
            }}
            {...ix("field")}
            className="mt-1.5 w-full rounded-sm border-none bg-transparent text-center text-meta text-ink-3 placeholder:text-ink-3 focus:text-ink"
          />
        ) : null}
        {!editor.isEditable && node.attrs.caption ? <p className="mt-1.5 w-full text-center text-meta text-ink-3">{node.attrs.caption}</p> : null}
      </div>

      {imageState.isZoomed && typeof document !== 'undefined'
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              data-escape-own=""
              aria-label={node.attrs.alt || 'Picture'}
              onClick={closeZoom}
              style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
              className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
            >
              <button
                type="button"
                onClick={closeZoom}
                aria-label="Close"
                style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
                className="absolute right-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 active:bg-white/30"
              >
                <X className="size-6" />
              </button>
              {/* Stop propagation so clicking the image itself doesn't close. */}
              <img src={displaySrc} alt={node.attrs.alt || ''} onClick={(e) => e.stopPropagation()} className="max-h-[90vh] max-w-[95vw] rounded object-contain shadow-e4 sm:max-w-[90vw]" />
            </div>,
            document.body,
          )
        : null}
    </NodeViewWrapper>
  )
}
