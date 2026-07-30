# Clinic image OCR metadata

The KO clinic import runs OCR once while source images are collected. The cached
manifest metadata is the only value consumed by the compiler; serving and export
never invoke OCR.

Rebuild the checked-in Apple Vision helper on macOS:

```bash
xcrun swiftc \
  scripts/clinic-image-ocr.swift \
  -o scripts/clinic-image-ocr
```

Then regenerate the image manifest:

```bash
npx tsx scripts/sync-edom-clinic-assets.ts
```

`textDense` is true when recognized bounding boxes cover at least 2.5% of the
image, or when at least 6 lines and 48 non-whitespace characters are recognized.
The area threshold catches large baked headlines; the line/character threshold
catches dense small-print cards whose boxes are individually small. Hero
selection rejects either condition and falls back to the next source image.
