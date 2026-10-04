/**
 * Typography customization for @tailwindcss/typography.
 *
 * Loaded via `@config './typography.config.js'` in tailwind.config.css.
 * Only contains theme.extend.typography — everything else (colors, animations,
 * variants, utilities, base) lives in CSS in this directory.
 *
 * Mirrors Supabase's packages/config/typography.config.js structure-for-
 * structure. The only edits are token spellings: their prose maps onto their
 * semantic vocabulary (--foreground-light, --background-surface-200); ours
 * maps the same slots onto ours (--muted-foreground, --muted). The pairing:
 *
 *   --foreground-default            → --foreground
 *   --foreground-light              → --muted-foreground
 *   --foreground-lighter / -muted   → --tertiary-foreground
 *   --background-default            → --background
 *   --background-surface-200        → --muted
 *   --background-surface-300        → --secondary
 *   --background-selection          → --accent
 *   --background-alternative-*     → --canvas
 *   --border-default / -muted / -strong → --border
 *
 * The typography plugin reads theme.typography to generate .prose, .prose-toc,
 * and .prose-docs classes (and to make them @apply-able). See:
 * https://github.com/tailwindlabs/tailwindcss-typography#customizing-the-css
 */

module.exports = {
  theme: {
    extend: {
      typography: {
        DEFAULT: {
          css: {
            // Removal of backticks in code blocks.
            // https://github.com/tailwindlabs/tailwindcss-typography/issues/135
            'code::before': { content: '""' },
            'code::after': { content: '""' },
            '--tw-prose-body': 'var(--muted-foreground)',
            '--tw-prose-headings': 'var(--foreground)',
            '--tw-prose-lead': 'var(--muted-foreground)',
            '--tw-prose-links': 'var(--brand)',
            '--tw-prose-bold': 'var(--muted-foreground)',
            '--tw-prose-counters': 'var(--muted-foreground)',
            '--tw-prose-bullets': 'var(--tertiary-foreground)',
            '--tw-prose-hr': 'var(--secondary)',
            '--tw-prose-quotes': 'var(--muted-foreground)',
            '--tw-prose-quote-borders': 'var(--secondary)',
            '--tw-prose-captions': 'var(--border)',
            '--tw-prose-code': 'var(--foreground)',
            '--tw-prose-pre-code': 'var(--tertiary-foreground)',
            '--tw-prose-pre-bg': 'var(--muted)',
            '--tw-prose-th-borders': 'var(--secondary)',
            '--tw-prose-td-borders': 'var(--background)',
            '--tw-prose-invert-body': 'var(--background)',
            '--tw-prose-invert-headings': 'white',
            '--tw-prose-invert-lead': 'var(--secondary)',
            '--tw-prose-invert-links': 'white',
            '--tw-prose-invert-bold': 'white',
            '--tw-prose-invert-counters': 'var(--muted)',
            '--tw-prose-invert-bullets': 'var(--accent)',
            '--tw-prose-invert-hr': 'var(--border)',
            '--tw-prose-invert-quotes': 'var(--canvas)',
            '--tw-prose-invert-quote-borders': 'var(--border)',
            '--tw-prose-invert-captions': 'var(--muted)',
            h4: { fontSize: '1.15em' },
            // h5 isn't included in --tw-prose-headings.
            h5: { color: 'var(--color-scale-1200)' },
            h1: { fontWeight: '400' },
            'h2, h3, h4, h5, h6': { fontWeight: 'var(--font-weight-heading)' },
            'article h2, article h3, article h4, article h5, article h6': {
              marginTop: '2em',
              marginBottom: '1em',
            },
            p: { fontWeight: '400' },
            strong: { fontWeight: '500' },
            pre: {
              background: 'none',
              padding: 0,
              marginBottom: '32px',
            },
            ul: {
              listStyleType: 'none',
              paddingLeft: '1rem',
            },
            'ul li': { position: 'relative' },
            'ul li::before': {
              position: 'absolute',
              top: '0.75rem',
              left: '-1rem',
              height: '0.125rem',
              width: '0.5rem',
              borderRadius: '0.25rem',
              backgroundColor: 'var(--border)',
              content: '""',
            },
            ol: {
              paddingLeft: '1rem',
              counterReset: 'item',
              listStyleType: 'none',
              marginBottom: '3rem',
            },
            'ol>li': {
              display: 'block',
              position: 'relative',
              paddingLeft: '1rem',
            },
            'ol>li::before': {
              position: 'absolute',
              top: '0.25rem',
              left: '-1rem',
              height: '1.2rem',
              width: '1.2rem',
              borderRadius: '0.25rem',
              backgroundColor: 'var(--card)',
              border: '1px solid var(--border)',
              content: 'counter(item) "  "',
              counterIncrement: 'item',
              fontSize: '12px',
              color: 'var(--tertiary-foreground)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            },
            'p img': {
              border: '1px solid var(--border)',
              borderRadius: '4px',
              overflow: 'hidden',
            },
            iframe: {
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
            },
            td: {
              borderBottom: '1px solid var(--muted)',
            },
            code: {
              fontWeight: '400',
              padding: '0.2rem 0.4rem',
              backgroundColor: 'var(--muted)',
              border: '1px solid var(--secondary)',
              borderRadius: 'var(--radius-lg)',
            },
            a: {
              position: 'relative',
              transition:
                'color var(--motion-micro) var(--ease-arrive), text-decoration-color var(--motion-micro) var(--ease-arrive)',
              paddingBottom: '2px',
              fontWeight: '400',
              opacity: 1,
              color: 'var(--brand)',
              textDecorationLine: 'underline',
              textDecorationColor: 'var(--brand)',
              textDecorationThickness: '1px',
              textUnderlineOffset: '2px',
            },
            'a:hover': {
              color: 'var(--foreground)',
              textDecorationColor: 'var(--brand)',
            },
            figcaption: {
              color: 'var(--tertiary-foreground)',
              fontFamily: 'var(--font-mono)',
            },
            'figure.quote-figure p:first-child': {
              marginTop: '0 !important',
            },
            'figure.quote-figure p:last-child': {
              marginBottom: '0 !important',
            },
            figure: { margin: '3rem 0' },
            'figure img': { margin: '0 !important' },
          },
        },

        toc: {
          css: {
            ul: {
              'list-style-type': 'none',
              'padding-left': 0,
              margin: 0,
              li: { 'padding-left': 0 },
              a: {
                display: 'block',
                marginBottom: '0.4rem',
                'text-decoration': 'none',
                fontSize: '0.8rem',
                fontWeight: '200',
                color: 'var(--muted-foreground)',
                '&:hover': {
                  color: 'var(--foreground)',
                },
                'font-weight': '400',
              },
              ul: {
                'list-style-type': 'none',
                li: {
                  marginTop: '0.2rem',
                  marginBottom: '0.2rem',
                  'padding-left': '0 !important',
                  'margin-left': '0.5rem',
                },
                a: {
                  fontWeight: '200',
                  color: 'var(--tertiary-foreground)',
                  '&:hover': {
                    color: 'var(--foreground)',
                  },
                },
              },
            },
          },
        },

        // Used in docs and changelog content.
        docs: {
          css: {
            '--tw-prose-body': 'var(--muted-foreground)',
            '--tw-prose-headings': 'var(--foreground)',
            '--tw-prose-lead': 'var(--muted-foreground)',
            '--tw-prose-links': 'inherit',
            '--tw-prose-bold': 'var(--muted-foreground)',
            '--tw-prose-counters': 'var(--muted-foreground)',
            '--tw-prose-bullets': 'var(--tertiary-foreground)',
            '--tw-prose-hr': 'var(--secondary)',
            '--tw-prose-quotes': 'var(--muted-foreground)',
            '--tw-prose-quote-borders': 'var(--secondary)',
            '--tw-prose-captions': 'var(--border)',
            '--tw-prose-code': 'var(--foreground)',
            '--tw-prose-pre-code': 'var(--tertiary-foreground)',
            '--tw-prose-pre-bg': 'var(--muted)',
            '--tw-prose-th-borders': 'var(--secondary)',
            '--tw-prose-td-borders': 'var(--background)',
            '--tw-prose-invert-body': 'var(--background)',
            '--tw-prose-invert-headings': 'white',
            '--tw-prose-invert-lead': 'var(--secondary)',
            '--tw-prose-invert-links': 'white',
            '--tw-prose-invert-bold': 'white',
            '--tw-prose-invert-counters': 'var(--muted)',
            '--tw-prose-invert-bullets': 'var(--accent)',
            '--tw-prose-invert-hr': 'var(--border)',
            '--tw-prose-invert-quotes': 'var(--canvas)',
            '--tw-prose-invert-quote-borders': 'var(--border)',
            '--tw-prose-invert-captions': 'var(--muted)',
            h1: { fontWeight: '400' },
            'h2, h3, h4, h5': { fontWeight: 'var(--font-weight-heading)' },
          },
        },
      },
    },
  },
}
