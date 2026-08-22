/*
  # Add room_photos column (agent-uploaded room photos)

  1. Change
    - `properties.room_photos` (jsonb, nullable) — map of room name (exact
      string as it appears in extraction_data.rooms) to an object describing
      the uploaded photo for that room:
      {
        "Kitchen": { "path": "{userId}/{propertyId}/photos/room-0.jpg", "width": 1200, "height": 800 },
        "Primary Bathroom": { "path": "...", "width": 900, "height": 1200 }
      }
    - width/height are the ACTUAL pixel dimensions of the resized image the
      browser uploaded — stored alongside the path so the server-side .docx
      builder can scale the image into the document without distortion,
      without needing to decode the image itself.

  2. Why
    - Agents can optionally attach a photo per room (uploaded from their own
      camera roll, not captured in-app) before documents are generated.
    - Only the Listing Pack document has a natural per-room slot for these
      (its "Room by Room" section) — Client Summary and the other four
      document types have no per-room layout, so photos are not attached to
      those regardless of what's stored here.
    - No photo is required for any room. A room with no entry in this map
      simply has no image in that section of the document — no placeholder
      box or "insert photo" text is ever rendered.

  3. Storage
    - Photos are uploaded directly from the browser to the existing
      `walkthrough-audio` bucket, under `{userId}/{propertyId}/photos/...`.
      This reuses the bucket's original top-level-folder-is-auth.uid()
      storage policies from the very first migration — no new storage
      policy is needed for this feature.
*/

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS room_photos jsonb DEFAULT NULL;
