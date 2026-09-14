# Patch field semantics

Patch requests preserve whether each JSON and protobuf field was present. An
omitted field remains unchanged. Empty and zero values are applied when the
field supports them.

| Resource | Clearable fields | Required fields that reject empty | Zero-valid fields |
| --- | --- | --- | --- |
| Project | description | title, status | — |
| Scene | outline link, heading, content | — | order index |
| Element | content | type | — |
| Character | description, role, attributes | name | — |
| Outline unit | description, color, icon, tags | title | order index |
| Beat | title, description, scene numbers, color, image | — | coordinates, dimensions, act, order, pages |
| Lane | color | name | order |
| Outline item | — | beat and lane IDs must be valid UUIDs | order, timeline position, width |
| Workspace / organization | description, avatar | name | — |
| Identity profile | first name, last name, avatar | email, username | — |

Locations currently have no update RPC or HTTP route. Their create contract is
unchanged. Drawings already use `DrawingPatch`, including zero-valid order and
clearable whole-shape data.
