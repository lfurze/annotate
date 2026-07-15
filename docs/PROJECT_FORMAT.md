# Annotate project format

Annotate's portable project payload is JSON embedded in an exported HTML file. The
rendered HTML is the human-viewable copy; only the JSON payload is trusted as editable
project data, and it is strictly validated before use.

## Version 1

The root object contains:

- `v`: schema version, currently `1`.
- `title`: display title.
- `pages`: ordered page records with a unique `id`, `kind`, dimensions, and either a
  raster `bg` data URL or sanitised `html`. PDF pages can also contain bounded text-layer
  records and a small thumbnail.
- `anns`: annotation records. Every record has a unique `id`, a valid `pageId`, a known
  annotation `type`, and type-specific bounded geometry and content.

Unknown, malformed, over-limit, duplicate, or dangling data causes the whole load to
fail without replacing the open project. Imported HTML is sanitised even when the
surrounding project is otherwise valid.

## Compatibility policy

Schema versions are integers. A breaking representation change increments `v` and must
ship with a tested migration from every format version the release promises to support.
Readers must reject newer unknown versions instead of guessing. Additive implementation
fields may be normalised away at the validation boundary without changing the version.

IndexedDB layout versions are separate from this portable schema. They may use blobs or
split metadata for efficient local persistence, but hydration always recreates the
portable version-1 representation before validation.
