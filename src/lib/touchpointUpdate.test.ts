/**
 * One save of a registry entry is one write, one ledger row and one undo.
 *
 * The rows are the function's business, and it proves them where it lives:
 * `scripts/tests/update-touchpoint.test.sh` replays the series onto the seed
 * and calls `update_touchpoint` as an author and as a reader — the five fields
 * landing together, the name moving in every bearing cell, a refused rename
 * leaving the other four unwritten, a refused kind taking the rename back out.
 *
 * What is left for this file is the seam SQL cannot reach: that the CLIENT
 * posts the whole entry in one call, records one entry whose inverse is the
 * previous values the function returned (not values the caller remembered),
 * and that reverting it through the real `executeRevert` puts back every
 * field and the cell text. The model below is a port of the function's
 * contract — atomic by construction, so a refusal is all-or-nothing — and
 * reuses the delimited-item rename the rename's own test ports.
 */
import { beforeEach, expect, test, vi } from 'vitest'
import { updateTouchpoint, type TouchpointEntry } from '@/lib/touchpointMutations'
import { touchpointIconObjectKey, uploadTouchpointIcon } from '@/lib/attachmentUpload'
import { executeRevert } from '@/lib/revertChange'
import { clearSession, describeChange, sessionSnapshot } from '@/lib/authoringSession'
import { renameContentItem } from '@/lib/renameContentItem'

type Row = {
  id: string
  name: string
  kind: string
  summary: string | null
  url: string | null
  icon_url: string | null
}
type Db = {
  touchpoints: Row[]
  /** cell id → content, and which touchpoints each cell bears. */
  cells: { id: string; content: string; bears: string[] }[]
  calls: { fn: string; args: Record<string, unknown> }[]
}

const KINDS = new Set(['app', 'document', 'physical', 'channel', 'service', 'other'])

const blankToNull = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : null

/**
 * The function's two link rules, checked only where the value changes: a link
 * is absolute https; an icon is that, a path on this site, or http on a
 * loopback host. Its sentences, word for word, so the test also proves they
 * survive the client's translation rather than becoming the console fallback.
 */
const HTTPS = /^https:\/\/[^\s/?#]+([/?#]\S*)?$/i
const ICON =
  /^(https:\/\/[^\s/?#]+([/?#]\S*)?|\/[^/\\\s]\S*|http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:[0-9]+)?([/?#]\S*)?)$/i
const LINK_REFUSED = 'A touchpoint’s link has to be a full address that starts with https.'
const LINK_HTTP = 'A touchpoint’s link has to be https — that one is http, which is not secure.'
const ICON_REFUSED =
  'A touchpoint’s icon has to be an https address, a path on this site, or nothing at all.'
function refuseLinks(args: Record<string, unknown>, row: Row) {
  const url = blankToNull(args.p_url)
  if (url !== null && url !== row.url && !HTTPS.test(url)) {
    throw new Error(/^http:/i.test(url) ? LINK_HTTP : LINK_REFUSED)
  }
  const icon = blankToNull(args.p_icon_url)
  if (icon !== null && icon !== row.icon_url && !ICON.test(icon)) {
    throw new Error(ICON_REFUSED)
  }
}

/** `update_touchpoint`, ported — all of it, or an exception and nothing. */
function updateTouchpointRpc(db: Db, args: Record<string, unknown>) {
  const name = String(args.p_name ?? '').trim()
  const kind = String(args.p_kind ?? '').trim()
  if (!name) throw new Error('a touchpoint needs a name')
  const row = db.touchpoints.find((entry) => entry.id === args.p_touchpoint_id)
  if (!row) throw new Error('touchpoint does not exist')
  if (db.touchpoints.some((entry) => entry.id !== row.id && entry.name === name)) {
    throw new Error('duplicate key value violates unique constraint "touchpoints_name_key"')
  }
  if (!KINDS.has(kind)) throw new Error('violates check constraint "touchpoints_kind_check"')
  refuseLinks(args, row)

  const previous = { ...row }
  const unchanged =
    previous.name === name &&
    previous.kind === kind &&
    previous.summary === blankToNull(args.p_summary) &&
    previous.url === blankToNull(args.p_url) &&
    previous.icon_url === blankToNull(args.p_icon_url)
  const reply = (changed: boolean, cellIds: string[]) => ({
    touchpoint_id: row.id,
    name,
    previous_name: previous.name,
    cell_ids: cellIds,
    changed,
    previous: {
      name: previous.name,
      kind: previous.kind,
      summary: previous.summary,
      url: previous.url,
      icon_url: previous.icon_url,
    },
  })
  if (unchanged) return reply(false, [])

  const cellIds: string[] = []
  if (previous.name !== name) {
    for (const cell of db.cells.filter((entry) => entry.bears.includes(row.id))) {
      const next = renameContentItem(cell.content, previous.name, name)
      if (next !== cell.content) {
        cell.content = next
        cellIds.push(cell.id)
      }
    }
  }
  Object.assign(row, {
    name,
    kind,
    summary: blankToNull(args.p_summary),
    url: blankToNull(args.p_url),
    icon_url: blankToNull(args.p_icon_url),
  })
  return reply(true, cellIds)
}

function clientFor(db: Db) {
  return {
    rpc(fn: string, args: Record<string, unknown>) {
      db.calls.push({ fn, args })
      try {
        if (fn !== 'update_touchpoint') throw new Error(`no function ${fn}`)
        return Promise.resolve({ data: updateTouchpointRpc(db, args), error: null })
      } catch (thrown) {
        return Promise.resolve({ data: null, error: { message: (thrown as Error).message } })
      }
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a stand-in, not a SupabaseClient
  } as any
}

function fixture(): Db {
  return {
    touchpoints: [
      {
        id: 'tp-zoom',
        name: 'Zoom',
        kind: 'other',
        summary: 'Where sessions happen',
        url: null,
        icon_url: 'https://cdn.example.com/zoom.png',
      },
      {
        id: 'tp-recording',
        name: 'Zoom Recording',
        kind: 'document',
        summary: null,
        url: null,
        icon_url: null,
      },
    ],
    cells: [
      { id: 'cell-1', content: 'Zoom,\n  Zoom Recording', bears: ['tp-zoom', 'tp-recording'] },
      { id: 'cell-2', content: 'Zoom', bears: ['tp-zoom'] },
    ],
    calls: [],
  }
}

const zoom = (db: Db) => db.touchpoints.find((row) => row.id === 'tp-zoom')!
const content = (db: Db, id: string) => db.cells.find((row) => row.id === id)!.content

const NEXT: TouchpointEntry = {
  name: '  Zoom Meetings ',
  kind: 'app',
  summary: 'The room every session opens in',
  url: 'https://zoom.example.com',
  iconUrl: null,
}

beforeEach(() => {
  clearSession()
})

test('one save posts the whole entry in one call', async () => {
  const db = fixture()
  await updateTouchpoint(clientFor(db), 'tp-zoom', NEXT)

  expect(db.calls).toEqual([
    {
      fn: 'update_touchpoint',
      args: {
        p_touchpoint_id: 'tp-zoom',
        p_name: 'Zoom Meetings',
        p_kind: 'app',
        p_summary: 'The room every session opens in',
        p_url: 'https://zoom.example.com',
        // Clearing is sent as empty, which the function stores as null.
        p_icon_url: '',
      },
    },
  ])
  expect(zoom(db)).toMatchObject({
    name: 'Zoom Meetings',
    kind: 'app',
    summary: 'The room every session opens in',
    url: 'https://zoom.example.com',
    icon_url: null,
  })
  expect(content(db, 'cell-1')).toBe('Zoom Meetings,\n  Zoom Recording')
  expect(content(db, 'cell-2')).toBe('Zoom Meetings')
})

test('the save records one entry whose inverse is what the database returned', async () => {
  const db = fixture()
  const result = await updateTouchpoint(clientFor(db), 'tp-zoom', NEXT)

  expect(result.cellIds).toEqual(['cell-1', 'cell-2'])
  const entries = sessionSnapshot()
  expect(entries).toHaveLength(1)
  const [entry] = entries
  expect(entry.fn).toBe('update_touchpoint')
  expect(entry.args).toEqual({
    touchpoint_id: 'tp-zoom',
    name: 'Zoom Meetings',
    previous_name: 'Zoom',
    cell_ids: ['cell-1', 'cell-2'],
  })
  // Keyed on the id, and every field as the row stood before — the icon the
  // edit cleared included — in the same text shape the forward call posts.
  expect(entry.revert).toEqual({
    fn: 'update_touchpoint',
    args: {
      p_touchpoint_id: 'tp-zoom',
      p_name: 'Zoom',
      p_kind: 'other',
      p_summary: 'Where sessions happen',
      p_url: '',
      p_icon_url: 'https://cdn.example.com/zoom.png',
    },
  })
  expect(describeChange(entry)).toBe(
    'Edited touchpoint “Zoom”, renamed to “Zoom Meetings” (2 cells)',
  )
})

test('reverting the entry restores every field and the name in cell content', async () => {
  const db = fixture()
  const before = structuredClone(db.touchpoints)
  const client = clientFor(db)
  await updateTouchpoint(client, 'tp-zoom', NEXT)
  const [entry] = sessionSnapshot()

  await executeRevert(client, entry)

  expect(db.touchpoints).toEqual(before)
  expect(content(db, 'cell-1')).toBe('Zoom,\n  Zoom Recording')
  expect(content(db, 'cell-2')).toBe('Zoom')
  // Undoing an edit must not append an edit to the list it is in.
  expect(sessionSnapshot()).toHaveLength(1)
})

test('an edit that keeps the name reads as an edit, not a rename', async () => {
  const db = fixture()
  await updateTouchpoint(clientFor(db), 'tp-zoom', { ...NEXT, name: 'Zoom' })

  expect(content(db, 'cell-1')).toBe('Zoom,\n  Zoom Recording')
  expect(describeChange(sessionSnapshot()[0])).toBe('Edited touchpoint “Zoom”')
})

test('a save that changes nothing records nothing', async () => {
  const db = fixture()
  const result = await updateTouchpoint(clientFor(db), 'tp-zoom', {
    name: ' Zoom ',
    kind: 'other',
    summary: 'Where sessions happen',
    url: '',
    iconUrl: 'https://cdn.example.com/zoom.png',
  })

  // The function was asked — it is the one that knows what the row holds —
  // and said nothing changed, so there is nothing to undo.
  expect(db.calls).toHaveLength(1)
  expect(result.changed).toBe(false)
  expect(sessionSnapshot()).toHaveLength(0)
})

test('record: false writes and logs nothing', async () => {
  const db = fixture()
  await updateTouchpoint(clientFor(db), 'tp-zoom', NEXT, { record: false })
  expect(zoom(db).name).toBe('Zoom Meetings')
  expect(sessionSnapshot()).toHaveLength(0)
})

test('an empty name never reaches the database', async () => {
  const db = fixture()
  await expect(
    updateTouchpoint(clientFor(db), 'tp-zoom', { ...NEXT, name: '   ' }),
  ).rejects.toThrow(/needs a name/)
  expect(db.calls).toHaveLength(0)
  expect(sessionSnapshot()).toHaveLength(0)
})

test('a refused rename writes nothing and records nothing', async () => {
  const db = fixture()
  const before = structuredClone(db)
  await expect(
    updateTouchpoint(clientFor(db), 'tp-zoom', { ...NEXT, name: 'Zoom Recording' }),
  ).rejects.toThrow()
  expect(db.touchpoints).toEqual(before.touchpoints)
  expect(db.cells).toEqual(before.cells)
  expect(sessionSnapshot()).toHaveLength(0)
})

test('a refused link or icon writes nothing and records nothing', async () => {
  const db = fixture()
  const before = structuredClone(db)
  await expect(
    updateTouchpoint(clientFor(db), 'tp-zoom', { ...NEXT, url: 'javascript:alert(1)' }),
  ).rejects.toThrow(LINK_REFUSED)
  await expect(
    updateTouchpoint(clientFor(db), 'tp-zoom', { ...NEXT, url: 'http://zoom.example.com' }),
  ).rejects.toThrow(LINK_HTTP)
  await expect(
    updateTouchpoint(clientFor(db), 'tp-zoom', { ...NEXT, iconUrl: 'http://cdn.example.com/x.png' }),
  ).rejects.toThrow(ICON_REFUSED)
  expect(db.touchpoints).toEqual(before.touchpoints)
  expect(db.cells).toEqual(before.cells)
  expect(sessionSnapshot()).toHaveLength(0)
})

test('undoing a replaced seeded logo puts the path back', async () => {
  const db = fixture()
  zoom(db).icon_url = '/touchpoint-logos/zoom.png'
  const client = clientFor(db)
  await updateTouchpoint(client, 'tp-zoom', {
    name: 'Zoom',
    kind: 'other',
    summary: 'Where sessions happen',
    url: null,
    iconUrl: 'https://cdn.example.com/touchpoints/tp-zoom/new.png',
  })
  const [entry] = sessionSnapshot()

  await executeRevert(client, entry)

  expect(zoom(db).icon_url).toBe('/touchpoint-logos/zoom.png')
})

test('a response naming nothing is refused rather than recorded', async () => {
  const client = {
    rpc: () => Promise.resolve({ data: null, error: null }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a stand-in
  } as any
  // Its own words: this edit may not have been a rename at all.
  await expect(updateTouchpoint(client, 'tp-zoom', NEXT)).rejects.toThrow(
    'That touchpoint no longer exists — nothing was saved.',
  )
  expect(sessionSnapshot()).toHaveLength(0)
})

// ---------------------------------------------------------------------------
// The icon file
// ---------------------------------------------------------------------------

test('an icon is keyed by the touchpoint id, never its name', () => {
  expect(touchpointIconObjectKey('tp-1', 'obj-1', 'Zoom Logo.SVG')).toBe(
    'touchpoints/tp-1/obj-1.svg',
  )
  expect(touchpointIconObjectKey('tp-1', 'obj-1', 'logo')).toBe('touchpoints/tp-1/obj-1.bin')
})

test('an icon upload lands in the resource bucket and hands back its URL', async () => {
  const upload = vi.fn().mockResolvedValue({ error: null })
  const getPublicUrl = vi.fn((key: string) => ({
    data: { publicUrl: `https://cdn.example.com/${key}` },
  }))
  const from = vi.fn(() => ({ upload, getPublicUrl }))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a stand-in
  const client = { storage: { from } } as any
  const file = new File(['webp'], 'logo.webp', { type: 'image/webp' })

  const uploaded = await uploadTouchpointIcon(client, {
    touchpointId: 'tp-1',
    file,
    objectId: 'obj-1',
  })

  expect(from).toHaveBeenCalledWith('cell-attachments')
  expect(upload).toHaveBeenCalledWith(
    'touchpoints/tp-1/obj-1.webp',
    file,
    expect.objectContaining({ contentType: 'image/webp', upsert: false }),
  )
  expect(uploaded).toEqual({
    url: 'https://cdn.example.com/touchpoints/tp-1/obj-1.webp',
    objectKey: 'touchpoints/tp-1/obj-1.webp',
  })
})

test.each([
  ['a PDF', new File(['%PDF'], 'brief.pdf', { type: 'application/pdf' })],
  // The bucket admits SVG for resources. An icon must not be one: opened at
  // its public URL, an SVG's script runs on the storage origin.
  ['an SVG', new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' })],
  ['a GIF', new File(['GIF89a'], 'logo.gif', { type: 'image/gif' })],
])('%s is refused before the upload', async (_label, file) => {
  const from = vi.fn()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a stand-in
  const client = { storage: { from } } as any
  await expect(
    uploadTouchpointIcon(client, { touchpointId: 'tp-1', file }),
  ).rejects.toThrow(/PNG, JPEG or WebP/)
  expect(from).not.toHaveBeenCalled()
})

test('a refused upload says so', async () => {
  const upload = vi.fn().mockResolvedValue({ error: { message: 'new row violates row-level security policy' } })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a stand-in
  const client = { storage: { from: () => ({ upload, getPublicUrl: vi.fn() }) } } as any
  const file = new File(['png'], 'logo.png', { type: 'image/png' })
  await expect(
    uploadTouchpointIcon(client, { touchpointId: 'tp-1', file }),
  ).rejects.toThrow(/could not be uploaded/)
})
