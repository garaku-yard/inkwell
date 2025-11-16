# Script Elements Reference

The `script_elements` table represents individual lines and components of a screenplay, enabling line-by-line editing and real-time collaboration.

## Element Types

### Scene Structure
- **`scene_heading`** - Scene headers like "INT. COFFEE SHOP - DAY"
- **`action`** - Narrative description and action lines
- **`transition`** - Scene transitions like "FADE IN:", "CUT TO:", "FADE OUT"
- **`shot`** - Camera directions like "CLOSE-UP", "WIDE SHOT"

### Character & Dialogue  
- **`character`** - Character name before dialogue (e.g., "JOHN")
- **`dialogue`** - What the character says
- **`parenthetical`** - Character direction in dialogue (e.g., "(angrily)")

## Example Screenplay Structure

```
scene_heading:   INT. COFFEE SHOP - DAY
action:          John sits alone at a corner table, nervously checking his watch.
action:          Sarah enters, looking around uncertainly.
character:       JOHN
parenthetical:   (standing up)
dialogue:        Sarah! Over here!
character:       SARAH
dialogue:        Sorry I'm late. Traffic was horrible.
action:          She sits down across from him.
transition:      CUT TO:
```

## Database Representation

Each line becomes a row in `script_elements`:

| script_element_id | screenplay_id | type           | content                                    | line_number | character_id |
|------------------|---------------|----------------|--------------------------------------------|-------------|--------------|
| uuid-1           | screenplay-1  | scene_heading  | INT. COFFEE SHOP - DAY                    | 1           | null         |
| uuid-2           | screenplay-1  | action         | John sits alone at a corner table...     | 2           | null         |
| uuid-3           | screenplay-1  | action         | Sarah enters, looking around...           | 3           | null         |
| uuid-4           | screenplay-1  | character      | JOHN                                      | 4           | john-char-id |
| uuid-5           | screenplay-1  | parenthetical  | (standing up)                             | 5           | john-char-id |
| uuid-6           | screenplay-1  | dialogue       | Sarah! Over here!                         | 6           | john-char-id |
| uuid-7           | screenplay-1  | character      | SARAH                                     | 7           | sarah-char-id|
| uuid-8           | screenplay-1  | dialogue       | Sorry I'm late. Traffic was horrible.     | 8           | sarah-char-id|
| uuid-9           | screenplay-1  | action         | She sits down across from him.           | 9           | null         |
| uuid-10          | screenplay-1  | transition     | CUT TO:                                   | 10          | null         |

## Formatting Attributes

The `formatting` JSONB column can store element-specific formatting:

```json
{
  "bold": true,
  "italic": false,
  "underline": false,
  "font_size": 12,
  "margin_left": 1.5,
  "margin_right": 1.0,
  "alignment": "left"
}
```

## Benefits for Real-time Editing

1. **Granular Updates** - Edit individual lines without affecting others
2. **Conflict Resolution** - Multiple users can edit different lines simultaneously  
3. **Operation Tracking** - Track exactly what changed on which line
4. **Format Preservation** - Maintain screenplay formatting standards
5. **Character Linking** - Connect dialogue to character entities
6. **Scene Organization** - Optionally group elements by scene

## Use Cases

- **Live Collaborative Editing** - Multiple writers working on different scenes
- **Version Control** - Track changes line by line
- **AI Suggestions** - Generate specific dialogue or action suggestions
- **Format Validation** - Ensure proper screenplay formatting
- **Export Generation** - Convert to standard screenplay formats (PDF, Final Draft)
- **Comment Threading** - Attach comments to specific lines
- **Revision Tracking** - Highlight changes between script versions