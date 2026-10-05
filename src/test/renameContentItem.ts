/**
 * `rename_content_item`, ported, for the tests that model a rename.
 *
 * The match is against a whole ITEM of the delimited list, never a substring:
 * `cells.content` is what `parseCellContentItems` splits on newline or comma
 * and trims, so renaming `Zoom` has to leave `Zoom Recording` alone. Split
 * keeping the delimiters, map the items, join — which puts the author's
 * spacing back verbatim wherever nothing matched.
 *
 * One copy, shared, because two models of the same function are two places
 * for a test to drift from the SQL it stands in for. The SQL proves itself in
 * the migration that defines it.
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
