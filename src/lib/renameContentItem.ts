/**
 * `rename_content_item`, ported: what a rename does to one cell's text.
 *
 * The match is against a whole ITEM of the delimited list, never a substring:
 * `cells.content` is what `parseCellContentItems` splits on newline or comma
 * and trims, so renaming `Zoom` has to leave `Zoom Recording` alone. Split
 * keeping the delimiters, map the items, join — which puts the author's
 * spacing back verbatim wherever nothing matched.
 *
 * Two readers, one copy. The tests that model a rename use it to stand in for
 * the SQL, and the cell editor uses it to move its own copy of the text when
 * a rename lands while it is open: the database rewrote the cell, and the
 * form has to hold the same words or its next Save writes the old name back.
 * Two models of the same function would be two places to drift from the SQL
 * it mirrors. The SQL proves itself in the migration that defines it.
 */
export function renameContentItem(content: string, from: string, to: string): string {
  return content
    .split(/([\n,])/)
    .map((part) => {
      if (part === '\n' || part === ',') return part
      if (part.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '') !== from) return part
      const lead = /^[ \t\r\n]*/.exec(part)![0]
      const tail = /[ \t\r\n]*$/.exec(part)![0]
      return `${lead}${to}${tail}`
    })
    .join('')
}
