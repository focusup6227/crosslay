import { supabase } from './supabase'

// Buckets are private; storage RLS keys off the first path segment:
// {department_id}/{preplan_id}/{filename}
export function storagePath(departmentId: string, preplanId: string, filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  return `${departmentId}/${preplanId}/${Date.now()}-${safe}`
}

export async function uploadFile(
  bucket: 'preplan-pdfs' | 'preplan-photos',
  path: string,
  body: Blob | File,
  contentType: string,
): Promise<void> {
  const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType })
  if (error) throw error
}

export async function signedUrls(
  bucket: 'preplan-pdfs' | 'preplan-photos',
  paths: string[],
  expiresIn = 3600,
): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map()
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, expiresIn)
  if (error) throw error
  const map = new Map<string, string>()
  for (const row of data ?? []) {
    if (row.signedUrl && row.path) map.set(row.path, row.signedUrl)
  }
  return map
}
