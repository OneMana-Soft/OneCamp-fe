"use client"

import * as React from 'react'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import type { ElementDimensions } from '../hooks/use-drag-resize'
import { useDragResize } from '../hooks/use-drag-resize'
import { ResizeHandle } from './resize-handle'
import { cn } from '@/lib/utils/helpers/cn'

import { ActionButton, ActionWrapper, ImageActions } from './image-actions'
import { useImageActions } from '../hooks/use-image-actions'
import { blobUrlToBase64, randomId } from '../../../utils'
import { InfoCircledIcon, TrashIcon } from '@radix-ui/react-icons'
import { ImageOverlay } from './image-overlay'
import type { UploadReturnType } from '../image'
import {LoaderCircle} from "lucide-react";
;
import { useMediaFetch } from '@/hooks/useFetch';
import { GetMediaURLRes } from '@/types/file';


const MAX_HEIGHT = 600
const MIN_HEIGHT = 120
const MIN_WIDTH = 120

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
    // Skip fetching if it's already a direct attachment endpoint that redirects to MinIO
    // These work fine in <img> tags but fail in authenticated XHR due to CORS * + credentials:true
    return !imageState.src.includes('/getDocAttachment/') && !imageState.src.includes('/getFile/')
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
  const containerMaxWidth = containerRef.current
    ? parseFloat(getComputedStyle(containerRef.current).getPropertyValue('--editor-width'))
    : Infinity

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
      
      const newWidth = img.width || newNaturalSize.width
      const newHeight = img.height || newNaturalSize.height

      if (Math.abs((initialWidth || 0) - newWidth) > 1 || Math.abs((initialHeight || 0) - newHeight) > 1) {
        updateAttributes({
          width: newWidth,
          height: newHeight,
          alt: img.alt,
          title: img.title
        })
      }

      if (!initialWidth) {
        updateDimensions(state => ({ ...state, width: newNaturalSize.width }))
      }
    },
    [initialWidth, initialHeight, updateAttributes, updateDimensions]
  )

  const handleImageError = React.useCallback(() => {
    setImageState(prev => ({ ...prev, error: true, imageLoaded: true }))
  }, [])

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
    <NodeViewWrapper ref={containerRef} data-drag-handle className="relative text-center leading-none">
      <div
        className="group/node-image relative mx-auto rounded-md object-contain"
        style={{
          maxWidth: `min(${maxWidth}px, 100%)`,
          width: currentWidth,
          maxHeight: MAX_HEIGHT,
          aspectRatio: `${imageState.naturalSize.width} / ${imageState.naturalSize.height}`
        }}
      >
        <div
          className={cn('relative flex h-full cursor-default flex-col items-center gap-2 rounded', {
            'outline outline-2 outline-offset-1 outline-primary': selected || isResizing
          })}
        >
          <div className="h-full contain-paint">
            <div className="relative h-full">
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
                    className={cn('h-auto rounded object-contain transition-shadow', {
                      'opacity-0': !imageState.imageLoaded || imageState.error
                    })}
                    style={{
                      maxWidth: `min(100%, ${maxWidth}px)`,
                      minWidth: `${MIN_WIDTH}px`,
                      maxHeight: MAX_HEIGHT
                    }}
                    width={currentWidth}
                    height={currentHeight}
                    onError={handleImageError}
                    onLoad={handleImageLoad}
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
    </NodeViewWrapper>
  )
}
