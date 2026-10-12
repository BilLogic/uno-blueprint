/**
 * Where the vendored shadcn stylesheet lives, named once.
 *
 * `scripts/check-vendored-css.mjs` holds the copy to upstream and
 * `src/lib/tokenModel.ts` leaves it out of the token model; both read the path
 * from here, so moving the file is a change to one line.
 */

/** The copy, as an application path: a deployment reads it out of the package. */
export const VENDORED = 'src/styles/shadcn-tailwind.css'
