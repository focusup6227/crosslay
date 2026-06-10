import { supabase } from './supabase'

export const PDF_BUCKET = 'preplan-pdfs'
export const PHOTO_BUCKET = 'preplan-photos'

// Signed URLs live long enough to view + (later) cache, short enough to respect
// that buckets are private. One hour is plenty for a single session on a truck.
const SIGNED_URL_TTL = 60 * 60

/** Storage path convention enforced by RLS: {department_id}/{preplan_id}/{file}. */
export function storagePath(departmentId: string, preplanId: string, filename: string): string {
  const safe = filename.replace(/[^\w.\-]+/g, '_').slice(-80)
  return `${departmentId}/${preplanId}/${crypto.randomUUID()}-${safe}`
}

export async function uploadToBucket(
  bucket: string,
  path: string,
  body: Blob,
  contentType: string,
): Promise<void> {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, body, { contentType, upsert: false })
  if (error) throw error
}

export async function removeFromBucket(bucket: string, path: string): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove([path])
  if (error) throw error
}

/** Stored columns hold the object path; views render signed URLs on demand. */
export async function signedUrl(bucket: string, path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL)
  if (error) {
    console.error('Failed to sign URL', bucket, path, error)
    return null
  }
  return data.signedUrl
}

/**
 * Downscale + re-encode an image to JPEG before upload. Crews are on cell
 * connections, so we cap the long edge and trade a little quality for size.
 * Falls back to the original file if the browser can't decode it.
 */
export async function compressImage(
  file: File,
  maxEdge = 1600,
  quality = 0.8,
): Promise<{ blob: Blob; contentType: string; ext: string }> {
  if (!file.type.startsWith('image/')) {
    return { blob: file, contentType: file.type || 'application/octet-stream', ext: extOf(file.name) }
  }
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context')
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    )
    if (!blob) throw new Error('toBlob failed')
    return { blob, contentType: 'image/jpeg', ext: 'jpg' }
  } catch (err) {
    console.warn('Image compression failed; uploading original', err)
    return { blob: file, contentType: file.type || 'application/octet-stream', ext: extOf(file.name) }
  }
}

function extOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : 'bin'
}
