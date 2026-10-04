import { describe, expect, it, vi } from 'vitest'
import {
  ATTACHMENTS_BUCKET,
  attachmentObjectKey,
  uploadAttachment,
} from '@/lib/attachmentUpload'
import { UPLOAD_CACHE_CONTROL } from '@/lib/uploadCacheControl'

const CELL = '11111111-1111-4111-8111-111111111111'
const OBJECT = '22222222-2222-4222-8222-222222222222'

describe('attachmentObjectKey', () => {
  it('names ids and the extension, nothing from the file name', () => {
    expect(attachmentObjectKey(CELL, OBJECT, 'Onboarding Modules — step 5.PNG')).toBe(
      `cells/${CELL}/${OBJECT}.png`,
    )
  })

  it('is the same key whatever the placement or the cell is called', () => {
    const before = attachmentObjectKey(CELL, OBJECT, 'a.png')
    const after = attachmentObjectKey(CELL, OBJECT, 'renamed-cell.png')
    expect(after).toBe(before)
  })

  it('stores a file with no usable extension under bin rather than refusing it', () => {
    expect(attachmentObjectKey(CELL, OBJECT, 'README')).toBe(`cells/${CELL}/${OBJECT}.bin`)
    expect(attachmentObjectKey(CELL, OBJECT, 'weird.@@@')).toBe(`cells/${CELL}/${OBJECT}.bin`)
  })

  it('matches the write policy’s pattern', () => {
    const policy = /^cells\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{1,8}$/
    expect(attachmentObjectKey(CELL, OBJECT, 'clip.MOV')).toMatch(policy)
    expect(attachmentObjectKey(CELL, OBJECT, 'x.averylongextension')).toMatch(policy)
  })
})

describe('uploadAttachment', () => {
  function fakeStorage(uploadError: { message: string } | null = null) {
    const upload = vi.fn().mockResolvedValue({ data: null, error: uploadError })
    const getPublicUrl = vi.fn((key: string) => ({
      data: { publicUrl: `https://project.supabase.co/storage/v1/object/public/${ATTACHMENTS_BUCKET}/${key}` },
    }))
    const from = vi.fn(() => ({ upload, getPublicUrl }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a storage client is all this needs
    return { client: { storage: { from } } as any, from, upload, getPublicUrl }
  }

  it('returns an attachment row whose url is the object’s public URL', async () => {
    const { client, from, upload } = fakeStorage()
    const file = new File(['png-bytes'], 'Module opening.png', { type: 'image/png' })
    const row = await uploadAttachment(client, { cellId: CELL, file, objectId: OBJECT })
    expect(from).toHaveBeenCalledWith(ATTACHMENTS_BUCKET)
    expect(upload).toHaveBeenCalledWith(
      `cells/${CELL}/${OBJECT}.png`,
      file,
      { contentType: 'image/png', upsert: false, cacheControl: UPLOAD_CACHE_CONTROL },
    )
    expect(row).toEqual({
      kind: 'attachment',
      name: 'Module opening',
      url: `https://project.supabase.co/storage/v1/object/public/${ATTACHMENTS_BUCKET}/cells/${CELL}/${OBJECT}.png`,
      objectKey: `cells/${CELL}/${OBJECT}.png`,
    })
  })

  it('surfaces a refused upload instead of inventing a row', async () => {
    const { client } = fakeStorage({ message: 'new row violates row-level security policy' })
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    await expect(uploadAttachment(client, { cellId: CELL, file })).rejects.toThrow(
      /could not be uploaded.*row-level security/,
    )
  })
})
