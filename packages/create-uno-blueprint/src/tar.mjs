/**
 * A tar reader, as small as a release tarball lets it be.
 *
 * The initialiser has no runtime dependencies and asks nothing of the machine
 * it runs on, so it cannot reach for a package or for the system's `tar`. What
 * it has to read is one kind of archive: what `git archive` writes and GitHub
 * serves for a tag. That is ustar, with two additions this reader follows:
 *
 *   - a pax GLOBAL header first, carrying the commit as a comment. Skipped.
 *   - a pax header ahead of any entry whose path fits neither the 100-byte
 *     name field nor the name and prefix fields together. Its `path` record
 *     is the entry's real path.
 *
 * The GNU long-name entry is read too, because it is the other way an
 * archiver says the same thing and costs three lines.
 *
 * It reads; it does not judge. A path comes back exactly as the archive
 * states it, `..` and all, and deciding what may be written where is the
 * caller's.
 */

const BLOCK = 512

const utf8 = new TextDecoder()

/**
 * @typedef {object} TarEntry
 * @property {string} path  as the archive states it, top-level folder included
 * @property {'file' | 'directory' | 'other'} kind  `other` is anything that is neither: a link, a device
 * @property {number} mode  the permission bits
 * @property {Uint8Array} data  a file's content; empty for anything else
 */

/**
 * Every entry of an uncompressed tar, in archive order.
 *
 * Throws on bytes that are not a tar or that stop part-way, so a truncated
 * download fails here rather than yielding a tree with its tail missing.
 *
 * @param {Uint8Array} bytes
 * @returns {Generator<TarEntry>}
 */
export function* readTar(bytes) {
  let offset = 0
  /** The path a pax or GNU header gave for the entry that follows it. */
  let statedPath = null

  while (offset + BLOCK <= bytes.length) {
    const header = bytes.subarray(offset, offset + BLOCK)
    // An all-zero block is the end marker. Whatever follows is padding.
    if (header.every((byte) => byte === 0)) return
    if (checksum(header) !== octal(header, 148, 8)) throw new Error('it is not a tar archive')

    const size = octal(header, 124, 12)
    const data = bytes.subarray(offset + BLOCK, offset + BLOCK + size)
    if (data.length < size) break
    offset += BLOCK + Math.ceil(size / BLOCK) * BLOCK

    const type = String.fromCharCode(header[156])
    if (type === 'g') continue
    if (type === 'x') {
      statedPath = paxRecords(data).path ?? statedPath
      continue
    }
    if (type === 'L') {
      statedPath = text(data)
      continue
    }

    const name = text(header.subarray(0, 100))
    const prefix = text(header.subarray(257, 262)) === 'ustar' ? text(header.subarray(345, 500)) : ''
    const path = statedPath ?? (prefix ? `${prefix}/${name}` : name)
    statedPath = null

    // A directory is type 5, or — in archives older than ustar — a plain
    // entry whose name ends in a slash.
    const isFile = type === '0' || type === '\0'
    const kind = type === '5' || (isFile && path.endsWith('/')) ? 'directory' : isFile ? 'file' : 'other'
    yield { path, kind, mode: octal(header, 100, 8), data: kind === 'file' ? data : data.subarray(0, 0) }
  }

  if (offset !== bytes.length) throw new Error('the archive ends in the middle of an entry')
}

/** A header field's text, up to its first NUL. */
function text(field) {
  const end = field.indexOf(0)
  return utf8.decode(end === -1 ? field : field.subarray(0, end))
}

/** A header field holding an octal number, padded with spaces or NULs. An empty field is zero. */
function octal(header, start, length) {
  const digits = text(header.subarray(start, start + length)).trim()
  if (digits === '') return 0
  if (!/^[0-7]+$/.test(digits)) throw new Error('it is not a tar archive')
  return parseInt(digits, 8)
}

/** A header's checksum: every byte summed, with the checksum field itself read as spaces. */
function checksum(header) {
  let sum = 0
  for (let index = 0; index < BLOCK; index += 1) {
    sum += index >= 148 && index < 156 ? 0x20 : header[index]
  }
  return sum
}

/**
 * The records of a pax header. Each is `<length> <key>=<value>\n`, where the
 * length counts the whole record in bytes, its own digits included — so a
 * value is read by length, never by looking for the newline it may contain.
 */
function paxRecords(data) {
  const records = {}
  let at = 0
  while (at < data.length) {
    const space = data.indexOf(0x20, at)
    const length = space === -1 ? NaN : Number(utf8.decode(data.subarray(at, space)))
    if (!Number.isInteger(length) || length <= space - at || at + length > data.length) {
      throw new Error('a pax header in it is malformed')
    }
    const record = utf8.decode(data.subarray(space + 1, at + length - 1))
    const equals = record.indexOf('=')
    records[record.slice(0, equals)] = record.slice(equals + 1)
    at += length
  }
  return records
}
