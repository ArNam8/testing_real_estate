/*
  # Add document_brand column (freeze brand colors at generation time)

  1. Change
    - `properties.document_brand` (jsonb, nullable) — snapshots the exact
      primary/secondary hex colors and brand name used when a property's
      documents were generated, e.g.:
      { "primary_hex": "C16B4F", "secondary_hex": "3F6B52", "brand_name": "Smith Realty" }

  2. Why
    - The in-app document viewer previously re-colored itself using
      whichever Brand Kit is currently active, every time a document was
      opened — meaning a document generated with one set of colors could
      look different in-app after the user later changed their Brand Kit,
      while the downloaded .docx file (which bakes colors in at generation
      time) stayed the same. That mismatch is now resolved by freezing:
      a document always looks the way it did the day it was generated,
      in-app and in the downloaded file alike.
    - Existing properties generated before this column existed will have
      `document_brand = NULL`; the app falls back to Walkthrough AI's own
      default navy/sage in that case (the closest honest approximation,
      since there's no record of what was actually used at the time).
*/

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS document_brand jsonb DEFAULT NULL;
