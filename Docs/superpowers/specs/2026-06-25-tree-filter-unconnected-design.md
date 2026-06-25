# Design: Tree Page — Unconnected People & Unconnected Trees Filters

**Date:** 2026-06-25
**Status:** Approved

---

## Overview

Add two filter modes to the Tree page canvas:

- **Unconnected People** — people who belong to no family (no spouse, no parent family). Canvas shows only their cards.
- **Unconnected Trees** — people in branches that are not reachable from the home person's tree ("master tree"). Canvas shows each disconnected branch as its own laid-out mini-tree.

When a filter is active the canvas fully replaces its contents with the filtered view. The normal tree is restored by selecting "All" or clicking "Clear filter" in the banner.

---

## Backend

### `GET /api/v1/tree/unconnected-people`

Returns all people who have no family connections.

**SQL logic** (reuses existing PersonRepository unconnected query):
```sql
WHERE NOT EXISTS (SELECT 1 FROM families WHERE spouse1_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM families WHERE spouse2_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM family_members WHERE person_id = p.id)
```

**Response:**
```json
{ "people": [ ...Person[] ] }
```

No auth beyond the existing API guard. No pagination (unconnected people sets are expected to be small).

---

### `GET /api/v1/tree/unconnected-segments`

Returns all people and families that are disconnected from the home person's tree, grouped into connected components.

**Algorithm:**

1. Resolve home person: read `user.home_person_id`; fall back to earliest `created_at` person (same logic as existing `GET /api/v1/tree`).
2. **BFS from home person** following all family edges in both directions (spouses via `families.spouse1_id` / `spouse2_id`, children/parents via `family_members`). No generation limit. Produces the **master tree set** — all person IDs reachable from home.
3. **Disconnected set** = all people NOT in master tree set.
4. **Component BFS** within the disconnected set: for each unvisited disconnected person, BFS following the same family edges but restricted to disconnected people only. Each BFS produces one connected component.
5. For each component, identify the root: the member(s) with no parents within the component (not a child in any family whose spouses are also in the component). If multiple roots exist (siblings with no parents recorded), pick the one with the earliest `created_at`.
6. Call existing `buildFlatTree()` for each component rooted at the identified root.

**Response:**
```json
{
  "segments": [
    { "persons": [ ...Person[] ], "families": [ ...Family[] ] },
    ...
  ]
}
```

Segments are ordered by descending size (largest first) so the most significant disconnected branches appear leftmost on canvas.

---

## Frontend

### Filter State

Local state in `TreePage`:

```typescript
type TreeFilter = 'all' | 'unconnected-people' | 'unconnected-trees';
const [treeFilter, setTreeFilter] = useState<TreeFilter>('all');
```

On filter change, fetch the appropriate endpoint and update `canvasStore` via `setNodes` / `setFamilies` / `setConnectors`. The canvas itself has no awareness of filter mode.

---

### Filter Dropdown

Added to the existing TreePage controls bar alongside the generations slider. A `<select>` with three options:

| Value | Label |
|-------|-------|
| `all` | All (default) |
| `unconnected-people` | Unconnected People |
| `unconnected-trees` | Unconnected Trees |

Selecting "All" reloads the normal home-person tree. The generations slider is hidden while any non-"all" filter is active (it only applies to the normal tree).

---

### Active Filter Banner

When `treeFilter !== 'all'`, a dismissible banner renders absolutely positioned at the top of the canvas (does not affect layout). It displays:

- Filter name (e.g. "Showing: Unconnected People")
- A **"Clear filter"** button — resets to `'all'` and reloads the normal tree

Selecting "All" in the dropdown also clears the banner.

---

### Canvas Layout — Unconnected People

People with no family connections cannot be placed by `layoutTree()`. Instead, synthetic `TreeNode` objects are created for each person and positioned in a wrapping grid:

- 4 cards per row
- Card slot size: 260px wide × 180px tall
- `setConnectors([])` — no lines
- `fitToScreen()` called after placement

---

### Canvas Layout — Unconnected Trees

For each segment returned by the API:

1. Call `layoutTree({ persons, families })` — produces nodes anchored at origin (0, 0).
2. Offset the segment horizontally: `xOffset += segmentWidth + 120px gap`.
3. Merge all segments' nodes and families into single `setNodes` / `setFamilies` calls.
4. `setConnectors()` with each segment's connectors (already offset).
5. `fitToScreen()` called after all segments are placed.

Segments are rendered left to right in descending size order (matching the API's sort order).

---

## Files Affected

| File | Change |
|------|--------|
| `backend/src/routes/tree.ts` | Add two new GET handlers |
| `backend/src/repositories/PersonRepository.ts` | Add `findUnconnected()` and `findDisconnectedComponents(homePerson)` methods |
| `frontend/src/pages/TreePage.tsx` | Add filter dropdown, banner, fetch logic, layout logic |
| `frontend/src/pages/TreePage.module.css` | Banner styles, controls bar update |

No new components required. No changes to `canvasStore`, `layoutTree`, or `ModalManager`.

---

## Edge Cases

| Case | Behaviour |
|------|-----------|
| No home person set | Use first-person fallback (existing tree behaviour) |
| No disconnected segments | Canvas shows empty state: "No unconnected branches found" |
| No unconnected people | Canvas shows empty state: "No unconnected people found" |
| Single person in a segment | Shown as a lone card with no connectors |
| Unconnected person also appears in segments endpoint | Not possible by definition — unconnected people have no families and are therefore not in any component |

---

## Verification Checklist

- [ ] Filter dropdown appears in tree controls bar
- [ ] Selecting "Unconnected People" replaces canvas with floating cards grid; no connectors visible
- [ ] Selecting "Unconnected Trees" replaces canvas with laid-out mini-trees separated by gaps
- [ ] Multiple disconnected segments each render as separate trees on canvas
- [ ] `fitToScreen()` fires after each filtered load so all nodes are visible
- [ ] Active filter banner appears with correct label
- [ ] "Clear filter" button in banner resets to normal tree
- [ ] Selecting "All" in dropdown resets to normal tree
- [ ] Generations slider hidden when filter is active
- [ ] Empty states show readable message when no results
- [ ] No TypeScript errors (`tsc --noEmit`)
- [ ] Existing tree functionality unaffected when filter is "All"
