import { useEffect, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

// Bundle the worker locally (no CDN dependency on a fire-truck MDT connection).
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

export function PdfViewer({ url, title }: { url: string; title: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [numPages, setNumPages] = useState(0)
  const [error, setError] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setWidth(Math.floor(w))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={containerRef} className="w-full">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="truncate font-semibold text-ash-100">{title}</span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-md border border-night-600 px-3 py-1.5 text-sm font-semibold text-hiviz-400"
        >
          Open PDF
        </a>
      </div>

      {error ? (
        <div className="rounded-md border border-night-600 bg-night-800 p-4 text-ash-300">
          Couldn't render this PDF in-app. Use “Open PDF” above.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-night-600 bg-night-800">
          <Document
            file={url}
            onLoadSuccess={({ numPages }) => setNumPages(numPages)}
            onLoadError={() => setError(true)}
            onSourceError={() => setError(true)}
            loading={<div className="p-4 text-ash-500">Loading PDF…</div>}
            error={<div className="p-4 text-oos-400">Couldn't load PDF.</div>}
          >
            {Array.from({ length: numPages }, (_, i) => (
              <Page
                key={i}
                pageNumber={i + 1}
                width={width || undefined}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                className="border-b border-night-700 last:border-b-0"
              />
            ))}
          </Document>
        </div>
      )}
    </div>
  )
}
