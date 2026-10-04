---
'uno-blueprint': minor
---

The template ships teal. The filled control and the identity fill are now `#00806a` in light and `#3ecfb0` in dark, the Uno Blueprint site's teal, in place of the near-black and near-white neutral. Buttons, focus rings, selected sidebar rows, links and the cover call to action pick it up through the existing token chain; surfaces, text and borders stay neutral grey. The dials are `--hue: 175` in both themes, `--primary-lightness: 0.536` / `--primary-chroma: 0.101` in light and `0.771` / `0.129` in dark. Ink on the fill measures 4.69:1 in light and 9.15:1 in dark, so the guard on `--primary-foreground` now holds AA (4.5:1) rather than the 7:1 the neutral fill could hold. The two themes no longer have to share a primary chroma, only a hue and whether there is colour at all. Warning, destructive and info lean 2.4 degrees further toward the brand through the existing harmony pull. The print override now restates `--primary-chroma`, since the themes differ on it.

**Upgrading a deployment**

- A deployment that declares its own `--hue`, `--primary-lightness` and `--primary-chroma` in both theme blocks is unaffected: its file loads after the package's and wins on source order.
- A deployment that does not declares none of them, and turns teal on its next pin bump. To stay neutral, add this to its own theme file, loaded after the package's styles:

  ```css
  :root,
  .light {
    --hue: 159;
    --primary-lightness: 0.205;
    --primary-chroma: 0;
  }
  .dark {
    --hue: 159;
    --primary-lightness: 0.922;
    --primary-chroma: 0;
  }
  @media print {
    :root,
    .dark {
      --primary-lightness: 0.205;
    }
  }
  ```

  The print block is there because this file loads after the package's print override, so without it a page printed from dark mode keeps the near-white fill on paper.
- A deployment that declares only some of the three gets the template's value for the rest. Check `--primary-chroma` in particular: one left unset now inherits 0.101 or 0.129.
