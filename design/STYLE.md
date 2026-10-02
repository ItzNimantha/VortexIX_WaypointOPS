# Waypoint OPS style tokens (extracted from `Vortex_IX.fig`, page "Prototypes")

All four roles use one navy + royal-blue system on Inter. Values are the most frequent fills/text colors actually used in the frames.

| Token | Hex | Used for |
|---|---|---|
| `navy-900` | `#0F1F3D` | Headers, hero cards, loader dark surfaces |
| `navy-800` | `#10233E` | Driver dark surfaces (treat as navy-900) |
| `navy-700` | `#253B60` | Raised dark surfaces |
| `blue-600` (primary) | `#1D6FDB` | Primary buttons, links, active tab, progress. Driver `#1769E0` and dispatcher `#1F6FE5` are the same intent |
| `blue-100` | `#E6F0FD` | Selected / info surface (variants `#EFF6FF`, `#E8F1FF`) |
| `surface` | `#F2F5FA` | App background (variants `#F3F6FB`, `#F4F7FB`) |
| `card` | `#FFFFFF` | Cards |
| `border` | `#E5E7EB` | Hairlines (variants `#DCE4EE`, `#E3E8F0`) |
| `text` | `#1A1A2E` | Primary text (dispatcher `#111827`, driver `#17263B`) |
| `muted` | `#6B7280` | Secondary text (variants `#667085`, `#68778A`) |
| `muted-on-navy` | `#A8B7CE` | Text on navy (variant `#98A2B3`) |
| `success` | `#1E8A4C` | Delivered, OK. Surface `#E3F4EA` (dispatcher `#DCFCE7`, text `#166534`) |
| `danger` | `#D92D3A` | Errors, breakdown. Surface `#FDECEE` (dispatcher `#FEF2F2`) |
| `warning` | `#F5A623` | Pending, at risk. Surface `#FFF4D6`, text `#8A5A00` |

## Typography
Inter only: Regular 400, Medium 500, Semi Bold 600, Bold 700, Extra Bold 800.
Phone sizes: 10, 11, 12, 13, 14 (body), 16, 20 (titles), 24 (driver hero numbers). Desktop: 11-15 body, 18 section titles, 30 big numbers.

## Shape
Radii: 8 (inputs, chips), 12 (cards), 16 (large cards), 28 (hero), 999 (pills, avatars). Dispatcher tables also use 6, 4, 3.

## Rules of use
- Status is always icon + text + color, never color alone.
- Primary action: solid `blue-600`, white text, radius 12, min height 44px on phone.
- Emergency / destructive: `danger` surface, `danger` text, icon.
- Offline: `warning` banner "No connection. Data may not be up to date. Auto-syncs when back online".

> Verify once in Figma Dev Mode. If a value differs, Figma wins: update this file, not the code.
