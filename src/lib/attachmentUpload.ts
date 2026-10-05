import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { UPLOAD_CACHE_CONTROL } from '@/lib/uploadCacheControl'

type Client = SupabaseClient<Database>

/**
 * The bucket the storage migration made: public-read, service-account write.
 */
export const ATTACHMENTS_BUCKET = 'cell-attachments'

/**
 * Where an attachment's object lives: ids and nothing else.
 *
 * `cells/<cell id>/<object id>.<ext>` — the cell's id so the bucket can be
 * read by cell, a minted id so two uploads never collide, and no name from
 * anywhere. Renaming the placement, the touchpoint or the cell changes
 * nothing here, which is what makes the URL in the row stable.
 *
 * The extension is the file's own, lowercased and narrowed to what the
 * write policy's pattern admits; a file with none, or one made of
 * punctuation, is stored under `bin` rather than refused — the bucket's
 * mime list already decided what may come in.
 */
export function attachmentObjectKey(
  cellId: string,
  objectId: string,
  fileName: string,
): string {
  return `cells/${cellId}/${objectId}.${objectExtension(fileName)}`
}

/**
 * Where a touchpoint's icon lives: the same bucket, under its own prefix.
 *
 * `touchpoints/<touchpoint id>/<object id>.<ext>` — the registry entry's id,
 * so a rename moves no URL, and a minted id per upload, so replacing an icon
 * writes a new object rather than overwriting one a cached page may still be
 * showing. The bucket's write policies admit this prefix beside `cells/` and
 * under the same pattern.
 */
export function touchpointIconObjectKey(
  touchpointId: string,
  objectId: string,
  fileName: string,
): string {
  return `touchpoints/${touchpointId}/${objectId}.${objectExtension(fileName)}`
}

/** The file's own extension, narrowed to what the write policies' pattern admits. */
function objectExtension(fileName: string): string {
  const raw = fileName.includes('.') ? fileName.split('.').pop()! : ''
  const extension = raw.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8)
  return extension || 'bin'
}

/** What a finished upload hands back: the row to add, kind already decided. */
export type UploadedAttachment = {
  kind: 'attachment'
  /** The file's own name without its extension — what the row is called. */
  name: string
  /** The object's public URL. Stable: it names ids, not names. */
  url: string
  objectKey: string
}

/**
 * Put a file in the bucket and describe the attachment row it becomes.
 *
 * Only the upload happens here. The row is written by whichever list the
 * file was dropped into — the placement's or the cell's — so that a
 * drop and a save are the same two steps they are for a pasted link, and
 * an upload that lands but is never saved leaves an object, not a row.
 *
 * `upsert: false`: the key is minted, so a collision would mean a broken id
 * generator, and the right answer is an error rather than a silent
 * overwrite of somebody else's file.
 */
export async function uploadAttachment(
  client: Client,
  input: { cellId: string; file: File; objectId?: string },
): Promise<UploadedAttachment> {
  const objectId = input.objectId ?? crypto.randomUUID()
  const objectKey = attachmentObjectKey(input.cellId, objectId, input.file.name)
  const bucket = client.storage.from(ATTACHMENTS_BUCKET)
  const { error } = await bucket.upload(objectKey, input.file, {
    contentType: input.file.type || undefined,
    upsert: false,
    cacheControl: UPLOAD_CACHE_CONTROL,
  })
  if (error) throw new Error(`The file could not be uploaded: ${error.message}`)
  const { data } = bucket.getPublicUrl(objectKey)
  return {
    kind: 'attachment',
    name: input.file.name.replace(/\.[^.]+$/, '') || 'Attachment',
    url: data.publicUrl,
    objectKey,
  }
}

/** What a finished icon upload hands back. */
export type UploadedTouchpointIcon = {
  /** The object's public URL — the value `icon_url` is saved with. */
  url: string
  objectKey: string
}

/**
 * Put an icon file in the bucket and hand back the URL to save.
 *
 * Only the upload, for the reason `uploadAttachment` gives: the URL reaches
 * the registry through `updateTouchpoint`, with the rest of the entry, so an
 * icon chosen and then abandoned leaves an object and no half-saved row.
 * Clearing the icon is that same save with no URL — there is nothing to
 * delete here, because the bucket keeps objects nobody points at.
 *
 * Images only. The bucket also admits video, audio and PDF for resources, and
 * an icon is drawn in an `<img>`, so anything else would save and then render
 * as a broken mark.
 */
export async function uploadTouchpointIcon(
  client: Client,
  input: { touchpointId: string; file: File; objectId?: string },
): Promise<UploadedTouchpointIcon> {
  if (!input.file.type.startsWith('image/')) {
    throw new Error('A touchpoint icon has to be an image file.')
  }
  const objectId = input.objectId ?? crypto.randomUUID()
  const objectKey = touchpointIconObjectKey(input.touchpointId, objectId, input.file.name)
  const bucket = client.storage.from(ATTACHMENTS_BUCKET)
  const { error } = await bucket.upload(objectKey, input.file, {
    contentType: input.file.type,
    upsert: false,
    cacheControl: UPLOAD_CACHE_CONTROL,
  })
  if (error) throw new Error(`The icon could not be uploaded: ${error.message}`)
  const { data } = bucket.getPublicUrl(objectKey)
  return { url: data.publicUrl, objectKey }
}
