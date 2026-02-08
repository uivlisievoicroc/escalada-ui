# UI Translation Summary (Romanian → English)

**Date**: 8 February 2026  
**Scope**: Complete translation of all user-facing Romanian text to English

## Files Modified

### 1. LoginOverlay.jsx
**Location**: `src/components/LoginOverlay.jsx`

| Romanian | English | Context |
|----------|---------|---------|
| `Autentificare` | `Authentication` | Default title prop |
| `Parolă` | `Password` | Password field label |
| `Intră` | `Sign In` | Submit button (default state) |
| `Se conectează…` | `Connecting…` | Submit button (loading state) |
| `Autentificare eșuată. Verifică user/parola.` | `Authentication failed. Check username/password.` | Invalid credentials error |
| `Sesiune expirată. Reîncearcă autentificarea.` | `Session expired. Try authenticating again.` | Token expired error |
| `Autentificare eșuată.` | `Authentication failed.` | Generic error |
| `Nu pot salva sesiunea în browser (storage plin/blocat). Șterge Local Storage/Cache pentru acest site și reîncearcă.` | `Cannot save session in browser (storage full/blocked). Clear Local Storage/Cache for this site and try again.` | Storage full error |

### 2. ControlPanel.tsx
**Location**: `src/components/ControlPanel.tsx`

| Romanian | English | Context |
|----------|---------|---------|
| `Autentificare admin` | `Admin Authentication` | Login overlay title |

### 3. ContestPage.tsx
**Location**: `src/components/ContestPage.tsx`

| Romanian | English | Context |
|----------|---------|---------|
| `Autentificare spectator` | `Spectator Authentication` | Login overlay title |

### 4. PublicLiveClimbing.tsx
**Location**: `src/components/PublicLiveClimbing.tsx`

| Romanian | English | Context |
|----------|---------|---------|
| `Conexiunea a eșuat. Reîncarcă pagina.` | `Connection failed. Reload the page.` | Connection error |
| `Nu s-a putut obține token-ul` | `Could not obtain token` | Token fetch error |
| `Înapoi` | `Back` | Back button |
| `Deconectat` | `Disconnected` | Connection status |
| `Reîncearcă` | `Retry` | Error banner retry button |
| `Se încarcă...` | `Loading...` | Loading state |
| `Această categorie nu a început încă` | `This category has not started yet` | Not initiated message |
| `Actualizează` | `Refresh` | Refresh button |
| `Ruta` | `Route` | Route label |
| `Catără acum` | `Climbing now` | Current climber label |
| `În desfășurare` | `In Progress` | Timer state badge (running) |
| `Pauză` | `Paused` | Timer state badge (paused) |
| `În așteptare` | `Waiting` | Timer state badge (idle) |
| `Progres` | `Progress` | Progress bar label |
| `prize` | `holds` | Holds counter unit |
| `Urmează` | `Next` | Preparing climber label |
| `Timpii sunt înregistrați pentru departajare` | `Times are recorded for tiebreaking` | Time criterion indicator |

### 5. PublicRankings.tsx
**Location**: `src/components/PublicRankings.tsx`

| Romanian | English | Context |
|----------|---------|---------|
| `Înapoi` | `Back` | Back button |
| `Nicio categorie activă momentan` | `No active category at the moment` | Empty state |
| `Selectează o categorie pentru a vedea clasamentul` | `Select a category to see the rankings` | Selection prompt |
| `Niciun rezultat încă pentru această categorie` | `No results yet for this category` | No rankings message |

## Code Comments (Not User-Facing)

The following Romanian comments in code were **not** translated (internal documentation):
- `// colectează scorurile existente` (ContestPage.tsx line 196)
- `// pentru fiecare rută (0‑based)` (ContestPage.tsx line 194)
- `// padding pentru rute lipsă` (ContestPage.tsx line 241)
- `// setează în state pentru UI` (ContestPage.tsx line 1098)
- `// setează scorul pe ruta curentă` (ContestPage.tsx line 1094)
- `// Salvează top-3 concurenți în localStorage pentru Award Ceremony` (ContestPage.tsx line 1186)

**Reason**: These are inline code comments for developers, not user-facing text. If needed, these can be translated in a separate documentation pass.

## Verification

Build successful: ✅ `npm run build` completed in 1.25s with no errors.

All user-facing Romanian text has been translated to English while preserving:
- Component functionality
- Error handling flows
- Accessibility attributes
- State management logic

## Data Model Fields (Unchanged)

The following Romanian field names in the data model remain unchanged (backend contract):
- `concurenti` (competitors array)
- `categorie` (category name)
- `nume` (competitor name field)

These are part of the backend API contract and should only be changed if the backend schema is updated.
