# Importing project photos from Immich

Semisto keeps its project photos in Immich, on the same server as Designer.
This one-off import brings them into the Designer maps, one Immich album per
map. Code: `lib/tasks/immich.rake`, `app/services/imports/immich/`.

## What it does

- Only **project albums** are imported: their name starts with « 📍 »
  (« 📍 Les Griants »). Other albums (trainings, events at Les 4 Sources…)
  are hidden from `immich:albums` (`ALL=1` shows them) and refused by
  `immich:import` (`FORCE=1` to import one anyway). The pin is dropped from
  the map's album name.

- Each **image** of the album becomes a map photo (`source: "import"`), filed
  in a photo album of the map named after the Immich album (`ALBUM_NAME=…`
  to rename it).
- **Position and date** come from the EXIF Immich already read
  (`exifInfo.latitude/longitude`, `dateTimeOriginal`). Photos without GPS
  land in « À placer ». The Immich description becomes the caption.
- **Direction** is not in Immich's API: imported photos have no heading.
- **HEIC, RAW** and files over 25 MB come as Immich's own JPEG rendition
  (full size when the server generates it, else the ~1440 px preview).
  JPEG, PNG and WebP come as originals.
- **Videos** are left out (images only in v1).
- **Re-runnable**: imported assets are recorded in `ImportRecord`
  (source `immich`), and a file already on the map is never added twice.
- Nothing is written to Immich.

## Running it

1. In Immich: Account settings > API keys > New API key, with the
   permissions `album.read`, `asset.read` and `asset.download`.
2. In the Coolify terminal of the Designer app (the key stays on the
   command line, not in the app's environment):

   ```sh
   IMMICH_URL=https://photos.example IMMICH_API_KEY=… bin/rails immich:albums
   ```

   Lists every project album with its number of photos, how many have GPS, the
   Designer maps whose outline contains them, and the command to run.
3. For each album, try it dry, then for real:

   ```sh
   IMMICH_URL=… IMMICH_API_KEY=… bin/rails immich:import ALBUM=<album id> MAP_ID=12 DRY_RUN=1
   IMMICH_URL=… IMMICH_API_KEY=… bin/rails immich:import ALBUM=<album id> MAP_ID=12
   ```
4. Delete the API key in Immich when done.
