# Classroom V2 — CC0 Asset Import

TrueMetaverse is preparing a new classroom built from the **2D School Classroom Asset Pack by Styloo**.

Source: https://styloo.itch.io/2dclassroom

License: **Creative Commons Zero v1.0 Universal (CC0 1.0)** as stated on the author's asset page.

The pack contains 3000+ transparent PNG sprites, including school/classroom furniture and props, with 8-direction variants. It is distributed as `2dClassroomAssetPackByStyloo.zip` (about 103 MB).

## Target repository layout

```text
metaverse/apps/web/public/assets/classroom-v2/
├── floor.png
├── walls.png
├── objects.png
├── decorations.png
└── source/
    └── ...original PNG files...
```

The runtime should use the curated atlas files where possible instead of loading thousands of individual PNGs.

## Import rules

1. Keep the original downloaded archive outside the production build until it has been curated.
2. Do not modify the source artwork destructively.
3. Generate atlases/spritesheets from the original PNGs.
4. Keep gameplay coordinates in `src/game/config/classroomV2.ts`, independent from source filenames.
5. Add collision separately from visual art.
6. Add interaction IDs separately from visual art.
7. Add shadows/depth sorting in the game layer.
8. Do not replace the existing `classroom` map until the V2 build passes CI and a playable Render build is verified.

## Current implementation foundation

`src/game/config/classroomV2.ts` defines the first playable classroom layout, object types, learning zones, and future atlas paths.

The current production classroom remains unchanged until the actual CC0 asset archive is imported and the new map is validated.
