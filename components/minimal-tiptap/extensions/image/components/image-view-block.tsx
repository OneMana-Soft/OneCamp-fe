"use client"

import * as React from 'react'
import { createPortal } from 'react-dom'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import type { ElementDimensions } from '../hooks/use-drag-resize'
import { useDragResize } from '../hooks/use-drag-resize'
import { ResizeHandle } from './resize-handle'
import { cn } from '@/lib/utils/helpers/cn'

import { ActionButton, ActionWrapper, ImageActions } from './image-actions'
import { useImageActions } from '../hooks/use-image-actions'
import { blobUrlToBase64, randomId } from '../../../utils'
import { Cross2Icon, InfoCircledIcon, TrashIcon } from '@radix-ui/react-icons'
import { ImageOverlay } from './image-overlay'
import type { UploadReturnType } from '../image'
import { LoaderCircle } from "@/lib/icons";
import { useMediaFetch } from '@/hooks/useFetch';
import { GetMediaURLRes } from '@/types/file';


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
// than to a tiny first-paint placeholder, on both desktop and mobile.
function measureColumnWidth(el: HTMLElement | null): number {
  if (!el) return MAX_DISPLAY_WIDTH
  const cssVar = parseFloat(getComputedStyle(el).getPropertyValue('--editor-width'))
  if (cssVar && cssVar > 0) return cssVar
  const measured = el.clientWidth
  if (measured && measured > 0) return measured
  return MAX_DISPLAY_WIDTH
}

interface ImageState {
  src: string
  isServerUploading: boolean
  imageLoaded: boolean
  isZoomed: boolean
  error: boolean
  naturalSize: ElementDimensions
}

const normalizeUploadResponse = (res: UploadReturnType) => ({
  src: typeof res === 'string' ? res : res.src,
  id: typeof res === 'string' ? randomId() : res.id
})

export const ImageViewBlock: React.FC<NodeViewProps> = ({ editor, node, selected, updateAttributes }) => {
  const { src: initialSrc, width: initialWidth, height: initialHeight, fileName } = node.attrs
  const uploadAttemptedRef = React.useRef(false)

  const initSrc = React.useMemo(() => {
    if (typeof initialSrc === 'string') {
      return initialSrc
    }
    return initialSrc.src
  }, [initialSrc])

  const [imageState, setImageState] = React.useState<ImageState>({
    src: initSrc,
    isServerUploading: false,
    imageLoaded: false,
    isZoomed: false,
    error: false,
    naturalSize: { width: initialWidth, height: initialHeight }
  })

  const isExternal = React.useMemo(() => {
    return typeof imageState.src === 'string' && (imageState.src.startsWith('http') || imageState.src.startsWith('/')) && !imageState.src.startsWith('blob:') && !imageState.src.startsWith('data:')
  }, [imageState.src])

  const shouldFetchMedia = React.useMemo(() => {
    if (!isExternal) return false
    const src = imageState.src as string
    // Only OneCamp's OWN media-resolution endpoints return a {url} JSON that
    // needs an authenticated fetch. A truly cross-origin image (Giphy, any
    // third-party CDN, or an absolute URL on another host) is already a
    // directly-renderable <img> source — fetching it via axios (which sends
    // withCredentials:true) trips CORS ("Allow-Origin: *" can't be combined
    // with credentials) and floods the console with net::ERR_FAILED on every
    // render + 4-min refresh. So: never XHR a cross-origin URL.
    if (isCrossOrigin(src)) return false
    // Same-origin direct attachment endpoints stream/redirect to MinIO and
    // render fine in <img> but fail an authenticated XHR — skip them too.
    return !src.includes('/getDocAttachment/') && !src.includes('/getFile/')
  }, [isExternal, imageState.src])

  const { data: mediaData } = useMediaFetch<GetMediaURLRes>(shouldFetchMedia ? imageState.src : '')
  const displaySrc = React.useMemo(() => {
    if (mediaData?.url) return mediaData.url
    return imageState.src
  }, [mediaData, imageState.src])

  const containerRef = React.useRef<HTMLDivElement>(null)
  const [activeResizeHandle, setActiveResizeHandle] = React.useState<'left' | 'right' | null>(null)

  const onDimensionsChange = React.useCallback(
    ({ width, height }: ElementDimensions) => {
      updateAttributes({ width, height })
    },
    [updateAttributes]
  )

  const aspectRatio = imageState.naturalSize.width / imageState.naturalSize.height
  const maxWidth = MAX_HEIGHT * aspectRatio
  const containerMaxWidth = measureColumnWidth(containerRef.current)

  const { isLink, onView, onDownload, onCopy, onCopyLink, onRemoveImg } = useImageActions({
    editor,
    node,
    src: imageState.src,
    onViewClick: isZoomed => setImageState(prev => ({ ...prev, isZoomed }))
  })

  const { currentWidth, currentHeight, updateDimensions, initiateResize, isResizing } = useDragResize({
    initialWidth: initialWidth ?? imageState.naturalSize.width,
    initialHeight: initialHeight ?? imageState.naturalSize.height,
    contentWidth: imageState.naturalSize.width,
    contentHeight: imageState.naturalSize.height,
    gridInterval: 0.1,
    onDimensionsChange,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    maxWidth: containerMaxWidth > 0 ? containerMaxWidth : maxWidth
  })

  const shouldMerge = React.useMemo(() => currentWidth <= 180, [currentWidth])

  React.useEffect(() => {
    setImageState(prev => {
      if (prev.src === initSrc) return prev
      return { ...prev, src: initSrc }
    })
  }, [initSrc])

  const handleImageLoad = React.useCallback(
    (ev: React.SyntheticEvent<HTMLImageElement>) => {
      const img = ev.target as HTMLImageElement
      const newNaturalSize = {
        width: img.naturalWidth,
        height: img.naturalHeight
      }
      setImageState(prev => ({
        ...prev,
        naturalSize: newNaturalSize,
        imageLoaded: true
      }))

      // Size from the image's INTRINSIC (natural) dimensions, not img.width —
      // img.width is the *rendered* width, which on first paint is the tiny
      // placeholder size (the node had no width/height attrs, e.g. a /giphy
      // GIF inserted as <img src=…>). Reading the rendered width and writing it
      // back permanently shrank the image. Natural size, capped to the editor
      // column width, gives a correctly-sized image on both desktop and mobile.
      if (!newNaturalSize.width || !newNaturalSize.height) return

      const colWidth = measureColumnWidth(containerRef.current)
      // Never upscale past the image's own resolution; cap to the column width.
      const cap = Math.min(colWidth || MAX_DISPLAY_WIDTH, MAX_DISPLAY_WIDTH)
      const targetWidth = Math.min(newNaturalSize.width, cap)

      if (
        Math.abs((initialWidth || 0) - targetWidth) > 1 ||
        !initialHeight
      ) {
        updateAttributes({
          width: targetWidth,
          // Let height follow the aspect ratio from natural size.
          height: Math.round(targetWidth * (newNaturalSize.height / newNaturalSize.width)),
          alt: img.alt,
          title: img.title
        })
      }

      if (!initialWidth) {
        updateDimensions(state => ({ ...state, width: targetWidth }))
      }
    },
    [initialWidth, initialHeight, updateAttributes, updateDimensions]
  )

  const handleImageError = React.useCallback(() => {
    setImageState(prev => ({ ...prev, error: true, imageLoaded: true }))
  }, [])

  const closeZoom = React.useCallback(() => {
    setImageState(prev => (prev.isZoomed ? { ...prev, isZoomed: false } : prev))
  }, [])

  // Close the lightbox on Escape and lock body scroll while it's open.
  React.useEffect(() => {
    if (!imageState.isZoomed) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeZoom()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [imageState.isZoomed, closeZoom])

  const handleResizeStart = React.useCallback(
    (direction: 'left' | 'right') => (event: React.PointerEvent<HTMLDivElement>) => {
      setActiveResizeHandle(direction)
      initiateResize(direction)(event)
    },
    [initiateResize]
  )

  const handleResizeEnd = React.useCallback(() => {
    setActiveResizeHandle(null)
  }, [])

  React.useEffect(() => {
    if (!isResizing) {
      handleResizeEnd()
    }
  }, [isResizing, handleResizeEnd])

  React.useEffect(() => {
    const handleImage = async () => {
      if (!initSrc.startsWith('blob:') || uploadAttemptedRef.current) {
        return
      }

      uploadAttemptedRef.current = true
      const imageExtension = editor.options.extensions.find(ext => ext.name === 'image')
      const { uploadFn } = imageExtension?.options ?? {}

      if (!uploadFn) {
        try {
          const base64 = await blobUrlToBase64(initSrc)
          setImageState(prev => ({ ...prev, src: base64 }))
          updateAttributes({ src: base64 })
        } catch {
          setImageState(prev => ({ ...prev, error: true }))
        }
        return
      }

      try {
        setImageState(prev => ({ ...prev, isServerUploading: true }))
        const response = await fetch(initSrc)
        const blob = await response.blob()
        const file = new File([blob], fileName, { type: blob.type })

        const url = await uploadFn(file, editor)
        const normalizedData = normalizeUploadResponse(url)

        setImageState(prev => ({
          ...prev,
          ...normalizedData,
          isServerUploading: false
        }))

        updateAttributes(normalizedData)
      } catch (e: unknown) {
        console.error('Image upload failed in ImageViewBlock', e)
        setImageState(prev => ({
          ...prev,
          error: true,
          isServerUploading: false
        }))
      }
    }

    handleImage()
  }, [editor, fileName, initSrc, updateAttributes])

  return (
    <NodeViewWrapper ref={containerRef} data-drag-handle className="relative">
      <div
        className="group/node-image relative rounded-md"
        style={{
          maxWidth: `min(${maxWidth}px, 100%)`,
          width: currentWidth,
        }}
      >
        <div
          className={cn('relative flex cursor-default flex-col items-center rounded', {
            'outline outline-2 outline-offset-1 outline-primary': selected || isResizing
          })}
        >
          <div className="contain-paint">
            <div className="relative">
              {imageState.isServerUploading && !imageState.error && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <LoaderCircle className="h-4 w-4 animate-spin"/>

                </div>
              )}

              {imageState.error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <InfoCircledIcon className="size-8 text-destructive" />
                  <p className="mt-2 text-sm text-muted-foreground">Failed to load image</p>
                </div>
              )}

              {!displaySrc || typeof displaySrc !== 'string' || displaySrc.trim() === "" || imageState.error ? null : (
                  <img
                    src={displaySrc}
                    className={cn('rounded object-contain transition-shadow', {
                      'opacity-0': !imageState.imageLoaded || imageState.error,
                      'cursor-zoom-in': !editor.isEditable && imageState.imageLoaded
                    })}
                    style={{
                      width: `${currentWidth}px`,
                      height: `${currentHeight}px`,
                      maxWidth: '100%',
                      maxHeight: `${MAX_HEIGHT}px`,
                    }}
                    width={currentWidth}
                    height={currentHeight}
                    onError={handleImageError}
                    onLoad={handleImageLoad}
                    onClick={() => {
                      // In read-only surfaces (chat/posts), clicking the image
                      // opens the lightbox — matching Notion/Slack. In the
                      // editor the click is reserved for selection/resize.
                      if (!editor.isEditable && imageState.imageLoaded && !imageState.error) {
                        onView()
                      }
                    }}
                    alt={node.attrs.alt || ''}
                    title={node.attrs.title || ''}
                    id={node.attrs.id}
                  />
              )}
            </div>

            {imageState.isServerUploading && <ImageOverlay />}

            {editor.isEditable && imageState.imageLoaded && !imageState.error && !imageState.isServerUploading && (
              <>
                <ResizeHandle
                  onPointerDown={handleResizeStart('left')}
                  className={cn('left-1', {
                    hidden: isResizing && activeResizeHandle === 'right'
                  })}
                  isResizing={isResizing && activeResizeHandle === 'left'}
                />
                <ResizeHandle
                  onPointerDown={handleResizeStart('right')}
                  className={cn('right-1', {
                    hidden: isResizing && activeResizeHandle === 'left'
                  })}
                  isResizing={isResizing && activeResizeHandle === 'right'}
                />
              </>
            )}
          </div>

          {imageState.error && (
            <ActionWrapper>
              <ActionButton icon={<TrashIcon className="size-4" />} tooltip="Remove image" onClick={onRemoveImg} />
            </ActionWrapper>
          )}

          {/* Caption input */}
          {editor.isEditable && imageState.imageLoaded && !imageState.error && !imageState.isServerUploading && (
            <div className="w-full mt-1.5">
              <input
                type="text"
                placeholder="Add caption..."
                defaultValue={node.attrs.caption || ''}
                onBlur={(e) => updateAttributes({ caption: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    editor.chain().focus().createParagraphNear().run()
                  }
                }}
                className="w-full text-center text-sm text-muted-foreground bg-transparent border-none outline-none placeholder:text-muted-foreground/50 focus:text-foreground transition-colors"
              />
            </div>
          )}
          {!editor.isEditable && node.attrs.caption && (
            <div className="w-full mt-1.5 text-center text-sm text-muted-foreground">
              {node.attrs.caption}
            </div>
          )}

          {!isResizing && !imageState.error && !imageState.isServerUploading && (
            <ImageActions
              shouldMerge={shouldMerge}
              isLink={isLink}
              onView={onView}
              onDownload={onDownload}
              onCopy={onCopy}
              onCopyLink={onCopyLink}
            />
          )}
        </div>
      </div>

      {imageState.isZoomed && typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            onClick={closeZoom}
            style={{
              paddingTop: 'env(safe-area-inset-top)',
              paddingBottom: 'env(safe-area-inset-bottom)',
            }}
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          >
            <button
              type="button"
              onClick={closeZoom}
              aria-label="Close"
              style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
              className="absolute right-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 active:bg-white/30"
            >
              <Cross2Icon className="size-6" />
            </button>
            {/* Stop propagation so clicking the image itself doesn't close. */}
            <img
              src={displaySrc}
              alt={node.attrs.alt || ''}
              onClick={e => e.stopPropagation()}
              className="max-h-[90vh] max-w-[95vw] rounded object-contain shadow-2xl sm:max-w-[90vw]"
            />
          </div>,
          document.body
        )}
    </NodeViewWrapper>
  )
}
