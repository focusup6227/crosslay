import { useEffect, useState } from 'react'
import { addPhoto } from '../lib/preplans'
import { compressImage, PHOTO_BUCKET, storagePath, uploadToBucket } from '../lib/storage'

interface Pending {
  file: File
  caption: string
  previewUrl: string
}

interface Props {
  preplanId: string
  departmentId: string
  onUploaded: () => void
}

export function PhotoUploader({ preplanId, departmentId, onUploaded }: Props) {
  const [pending, setPending] = useState<Pending[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Revoke object URLs when the queue changes / unmounts to avoid leaks.
  useEffect(() => {
    return () => pending.forEach((p) => URL.revokeObjectURL(p.previewUrl))
  }, [pending])

  function addFiles(files: FileList | null) {
    if (!files) return
    const next = Array.from(files).map((file) => ({
      file,
      caption: '',
      previewUrl: URL.createObjectURL(file),
    }))
    setPending((prev) => [...prev, ...next])
  }

  function setCaption(i: number, caption: string) {
    setPending((prev) => prev.map((p, idx) => (idx === i ? { ...p, caption } : p)))
  }
  function remove(i: number) {
    setPending((prev) => {
      URL.revokeObjectURL(prev[i].previewUrl)
      return prev.filter((_, idx) => idx !== i)
    })
  }

  async function upload() {
    if (pending.some((p) => !p.caption.trim())) {
      setError('Every photo needs a short caption (e.g. “Alarm panel — electrical room”).')
      return
    }
    setError(null)
    setBusy(true)
    try {
      for (const p of pending) {
        const { blob, contentType, ext } = await compressImage(p.file)
        const name = p.file.name.replace(/\.[^.]+$/, '') + '.' + ext
        const path = storagePath(departmentId, preplanId, name)
        await uploadToBucket(PHOTO_BUCKET, path, blob, contentType)
        await addPhoto(preplanId, path, p.caption)
      }
      pending.forEach((p) => URL.revokeObjectURL(p.previewUrl))
      setPending([])
      onUploaded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed — try again')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <label className="inline-block min-h-11 cursor-pointer rounded-md border border-night-600 px-4 py-2.5 font-semibold text-hiviz-400">
        + Add photos
        <input
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </label>

      {pending.length > 0 && (
        <div className="mt-3 space-y-3">
          {pending.map((p, i) => (
            <div key={i} className="flex gap-3 rounded-md border border-night-700 bg-night-800 p-3">
              <img
                src={p.previewUrl}
                alt=""
                className="h-20 w-20 shrink-0 rounded object-cover"
              />
              <div className="flex-1">
                <input
                  value={p.caption}
                  onChange={(e) => setCaption(i, e.target.value)}
                  placeholder="Caption (required)"
                  className="min-h-11 w-full rounded-md border border-night-600 bg-night-900 px-3 text-ash-100 placeholder:text-night-600 focus:border-hiviz-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="mt-2 text-sm font-semibold text-oos-400"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}

          {error && <p className="text-oos-400">{error}</p>}

          <button
            type="button"
            onClick={upload}
            disabled={busy}
            className="min-h-12 w-full rounded-md bg-hiviz-400 px-4 font-display text-lg font-semibold uppercase tracking-wide text-night-950 disabled:opacity-50"
          >
            {busy ? 'Uploading…' : `Upload ${pending.length} photo${pending.length > 1 ? 's' : ''}`}
          </button>
        </div>
      )}
      {error && pending.length === 0 && <p className="mt-2 text-oos-400">{error}</p>}
    </div>
  )
}
