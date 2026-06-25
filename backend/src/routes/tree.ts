import { Router } from 'express';
import { getDatabase } from '../db/connection.js';
import { PersonRepository } from '../repositories/PersonRepository.js';
import { FamilyRepository } from '../repositories/FamilyRepository.js';
import { UserRepository } from '../repositories/UserRepository.js';
import type { PersonWithNames, Family } from '../types/db.js';

export const treeRouter = Router();

function paramStr(val: string | string[]): string {
  return Array.isArray(val) ? val[0] : val;
}

interface TreeNode {
  person: PersonWithNames;
  generation: number;
  parents: TreeNode[];
  spouses: { person: PersonWithNames; family: Family }[];
  children: TreeNode[];
}

function clampGenerations(query: string | undefined): number {
  const gen = parseInt(query as string) || 4;
  return Math.min(Math.max(gen, 1), 20);
}

function resolveHomePersonId(userId: string): string | null {
  const db = getDatabase();
  const userRepo = new UserRepository();
  const user = userRepo.findById(userId);
  let homeId = user?.home_person_id ?? null;
  if (!homeId) {
    const first = db.prepare('SELECT id FROM persons ORDER BY created_at ASC LIMIT 1').get() as { id: string } | undefined;
    homeId = first?.id ?? null;
  }
  return homeId;
}

function bfsAllReachable(startId: string): Set<string> {
  const db = getDatabase();
  const visited = new Set<string>();
  const queue = [startId];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    // Spouse families → follow spouses and children
    const spouseFamilies = db.prepare(
      'SELECT id, spouse1_id, spouse2_id FROM families WHERE spouse1_id = ? OR spouse2_id = ?'
    ).all(id, id) as { id: string; spouse1_id: string | null; spouse2_id: string | null }[];

    for (const fam of spouseFamilies) {
      const spouseId = fam.spouse1_id === id ? fam.spouse2_id : fam.spouse1_id;
      if (spouseId && !visited.has(spouseId)) queue.push(spouseId);

      const children = db.prepare(
        'SELECT person_id FROM family_members WHERE family_id = ?'
      ).all(fam.id) as { person_id: string }[];
      for (const c of children) {
        if (!visited.has(c.person_id)) queue.push(c.person_id);
      }
    }

    // Parent families → follow parents and siblings
    const parentFamilies = db.prepare(
      'SELECT family_id FROM family_members WHERE person_id = ?'
    ).all(id) as { family_id: string }[];

    for (const pf of parentFamilies) {
      const fam = db.prepare(
        'SELECT id, spouse1_id, spouse2_id FROM families WHERE id = ?'
      ).get(pf.family_id) as { id: string; spouse1_id: string | null; spouse2_id: string | null } | undefined;
      if (!fam) continue;
      if (fam.spouse1_id && !visited.has(fam.spouse1_id)) queue.push(fam.spouse1_id);
      if (fam.spouse2_id && !visited.has(fam.spouse2_id)) queue.push(fam.spouse2_id);

      const siblings = db.prepare(
        'SELECT person_id FROM family_members WHERE family_id = ?'
      ).all(fam.id) as { person_id: string }[];
      for (const s of siblings) {
        if (!visited.has(s.person_id)) queue.push(s.person_id);
      }
    }
  }

  return visited;
}

function findConnectedComponents(ids: string[]): string[][] {
  const db = getDatabase();
  const pool = new Set(ids);
  const visited = new Set<string>();
  const components: string[][] = [];

  for (const startId of ids) {
    if (visited.has(startId)) continue;

    const component: string[] = [];
    const queue = [startId];

    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      component.push(id);

      const spouseFamilies = db.prepare(
        'SELECT id, spouse1_id, spouse2_id FROM families WHERE spouse1_id = ? OR spouse2_id = ?'
      ).all(id, id) as { id: string; spouse1_id: string | null; spouse2_id: string | null }[];

      for (const fam of spouseFamilies) {
        const spouseId = fam.spouse1_id === id ? fam.spouse2_id : fam.spouse1_id;
        if (spouseId && pool.has(spouseId) && !visited.has(spouseId)) queue.push(spouseId);

        const children = db.prepare(
          'SELECT person_id FROM family_members WHERE family_id = ?'
        ).all(fam.id) as { person_id: string }[];
        for (const c of children) {
          if (pool.has(c.person_id) && !visited.has(c.person_id)) queue.push(c.person_id);
        }
      }

      const parentFamilies = db.prepare(
        'SELECT family_id FROM family_members WHERE person_id = ?'
      ).all(id) as { family_id: string }[];

      for (const pf of parentFamilies) {
        const fam = db.prepare(
          'SELECT id, spouse1_id, spouse2_id FROM families WHERE id = ?'
        ).get(pf.family_id) as { id: string; spouse1_id: string | null; spouse2_id: string | null } | undefined;
        if (!fam) continue;
        if (fam.spouse1_id && pool.has(fam.spouse1_id) && !visited.has(fam.spouse1_id)) queue.push(fam.spouse1_id);
        if (fam.spouse2_id && pool.has(fam.spouse2_id) && !visited.has(fam.spouse2_id)) queue.push(fam.spouse2_id);

        const siblings = db.prepare(
          'SELECT person_id FROM family_members WHERE family_id = ?'
        ).all(fam.id) as { person_id: string }[];
        for (const s of siblings) {
          if (pool.has(s.person_id) && !visited.has(s.person_id)) queue.push(s.person_id);
        }
      }
    }

    components.push(component);
  }

  return components;
}

function buildAncestorTree(
  personId: string,
  generation: number,
  maxGen: number,
  personRepo: PersonRepository,
  familyRepo: FamilyRepository,
  visited: Set<string>,
): TreeNode | null {
  if (visited.has(personId)) return null;
  visited.add(personId);

  const person = personRepo.findById(personId);
  if (!person) return null;

  const db = getDatabase();
  const node: TreeNode = {
    person,
    generation,
    parents: [],
    spouses: [],
    children: [],
  };

  // Get spouses
  const spouseFamilies = db.prepare(
    'SELECT * FROM families WHERE spouse1_id = ? OR spouse2_id = ?',
  ).all(personId, personId) as Family[];

  for (const family of spouseFamilies) {
    const spouseId = family.spouse1_id === personId ? family.spouse2_id : family.spouse1_id;
    if (spouseId) {
      const spouse = personRepo.findById(spouseId);
      if (spouse) {
        node.spouses.push({ person: spouse, family });
      }
    }
  }

  // Get parents (recurse) if within generation limit
  if (generation < maxGen) {
    const parentFamilies = db.prepare(
      'SELECT f.* FROM families f INNER JOIN family_members fm ON f.id = fm.family_id WHERE fm.person_id = ?',
    ).all(personId) as Family[];

    for (const family of parentFamilies) {
      for (const parentId of [family.spouse1_id, family.spouse2_id]) {
        if (parentId) {
          const parentNode = buildAncestorTree(parentId, generation + 1, maxGen, personRepo, familyRepo, visited);
          if (parentNode) node.parents.push(parentNode);
        }
      }
    }
  }

  return node;
}

function buildDescendantTree(
  personId: string,
  generation: number,
  maxGen: number,
  personRepo: PersonRepository,
  familyRepo: FamilyRepository,
  visited: Set<string>,
): TreeNode | null {
  if (visited.has(personId)) return null;
  visited.add(personId);

  const person = personRepo.findById(personId);
  if (!person) return null;

  const db = getDatabase();
  const node: TreeNode = {
    person,
    generation,
    parents: [],
    spouses: [],
    children: [],
  };

  // Get families where person is a spouse
  const families = db.prepare(
    'SELECT * FROM families WHERE spouse1_id = ? OR spouse2_id = ?',
  ).all(personId, personId) as Family[];

  for (const family of families) {
    const spouseId = family.spouse1_id === personId ? family.spouse2_id : family.spouse1_id;
    if (spouseId) {
      const spouse = personRepo.findById(spouseId);
      if (spouse) {
        node.spouses.push({ person: spouse, family });
      }
    }

    // Get children (recurse) if within generation limit
    if (generation < maxGen) {
      const members = familyRepo.getMembers(family.id);
      for (const member of members) {
        const childNode = buildDescendantTree(member.person_id, generation + 1, maxGen, personRepo, familyRepo, visited);
        if (childNode) node.children.push(childNode);
      }
    }
  }

  return node;
}

// Build a flat { persons, families } list for the canvas, starting from rootPersonId
function buildFlatTree(
  rootPersonId: string,
  generations: number,
  personRepo: PersonRepository,
): { persons: object[]; families: object[] } {
  const db = getDatabase();
  const visitedPersons = new Set<string>();
  const visitedFamilies = new Set<string>();
  const persons: object[] = [];
  const families: object[] = [];

  const queue: Array<{ id: string; gen: number }> = [{ id: rootPersonId, gen: 0 }];

  while (queue.length > 0) {
    const item = queue.shift()!;
    if (visitedPersons.has(item.id)) continue;
    visitedPersons.add(item.id);

    const person = personRepo.findById(item.id);
    if (!person) continue;

    const birthEvent = db.prepare(
      "SELECT event_date FROM events WHERE person_id = ? AND event_type = 'birth' LIMIT 1",
    ).get(item.id) as { event_date: string | null } | undefined;

    const deathEvent = db.prepare(
      "SELECT event_date FROM events WHERE person_id = ? AND event_type = 'death' LIMIT 1",
    ).get(item.id) as { event_date: string | null } | undefined;

    const primaryPhoto = db.prepare(
      'SELECT mi.id FROM media_items mi INNER JOIN person_media pm ON mi.id = pm.media_id WHERE pm.person_id = ? AND pm.is_primary = 1 LIMIT 1',
    ).get(item.id) as { id: string } | undefined;

    persons.push({
      id: person.id,
      displayName: person.displayName ?? null,
      display_name: person.display_name ?? null,
      given_name: person.primary_name?.given_name ?? null,
      middle_name: person.primary_name?.middle_name ?? null,
      surname: person.primary_name?.surname ?? null,
      sex: person.sex,
      birth_date: birthEvent?.event_date ?? null,
      death_date: deathEvent?.event_date ?? null,
      is_living: person.is_living === 1,
      is_private: person.is_private === 1,
      photo_url: primaryPhoto ? `/api/v1/media/${primaryPhoto.id}` : null,
    });

    if (item.gen >= generations) continue;

    // Spouse/child families
    const spouseFamilies = db.prepare(
      'SELECT * FROM families WHERE spouse1_id = ? OR spouse2_id = ?',
    ).all(item.id, item.id) as Family[];

    for (const fam of spouseFamilies) {
      const spouseId = fam.spouse1_id === item.id ? fam.spouse2_id : fam.spouse1_id;
      if (spouseId && !visitedPersons.has(spouseId)) {
        queue.push({ id: spouseId, gen: item.gen });
      }

      if (!visitedFamilies.has(fam.id)) {
        visitedFamilies.add(fam.id);
        const childRows = db.prepare(
          'SELECT person_id FROM family_members WHERE family_id = ?',
        ).all(fam.id) as Array<{ person_id: string }>;

        families.push({
          id: fam.id,
          spouse1_id: fam.spouse1_id,
          spouse2_id: fam.spouse2_id,
          children_ids: childRows.map(r => r.person_id),
          marriage_date: fam.marriage_date,
        });

        for (const child of childRows) {
          if (!visitedPersons.has(child.person_id)) {
            queue.push({ id: child.person_id, gen: item.gen + 1 });
          }
        }
      }
    }

    // Parent families (ancestors)
    const parentFamilies = db.prepare(
      'SELECT f.* FROM families f INNER JOIN family_members fm ON f.id = fm.family_id WHERE fm.person_id = ?',
    ).all(item.id) as Family[];

    for (const fam of parentFamilies) {
      if (!visitedFamilies.has(fam.id)) {
        visitedFamilies.add(fam.id);
        const childRows = db.prepare(
          'SELECT person_id FROM family_members WHERE family_id = ?',
        ).all(fam.id) as Array<{ person_id: string }>;

        families.push({
          id: fam.id,
          spouse1_id: fam.spouse1_id,
          spouse2_id: fam.spouse2_id,
          children_ids: childRows.map(r => r.person_id),
          marriage_date: fam.marriage_date,
        });
      }

      if (fam.spouse1_id && !visitedPersons.has(fam.spouse1_id)) {
        queue.push({ id: fam.spouse1_id, gen: item.gen + 1 });
      }
      if (fam.spouse2_id && !visitedPersons.has(fam.spouse2_id)) {
        queue.push({ id: fam.spouse2_id, gen: item.gen + 1 });
      }
    }
  }

  return { persons, families };
}

// GET /tree — Root endpoint: uses caller's home_person_id
treeRouter.get('/', (req, res) => {
  try {
    const userRepo = new UserRepository();
    const personRepo = new PersonRepository();

    const user = userRepo.findById(req.user!.userId);
    let homePersonId = user?.home_person_id ?? null;

    if (!homePersonId) {
      const db = getDatabase();
      const first = db.prepare('SELECT id FROM persons ORDER BY created_at ASC LIMIT 1').get() as { id: string } | undefined;
      homePersonId = first?.id ?? null;
    }

    if (!homePersonId) {
      res.json({ persons: [], families: [], home_person_id: null });
      return;
    }

    const generations = clampGenerations(req.query.generations as string);
    const { persons, families } = buildFlatTree(homePersonId, generations, personRepo);

    res.json({ persons, families, home_person_id: homePersonId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get tree' });
  }
});

// GET /tree/:personId/ancestors — Ancestors only
treeRouter.get('/:personId/ancestors', (req, res) => {
  try {
    const personRepo = new PersonRepository();
    const familyRepo = new FamilyRepository();
    const generations = clampGenerations(req.query.generations as string);
    const personId = paramStr(req.params.personId);

    const person = personRepo.findById(personId);
    if (!person) {
      res.status(404).json({ error: 'Person not found' });
      return;
    }

    const tree = buildAncestorTree(personId, 0, generations, personRepo, familyRepo, new Set());
    res.json(tree);
  } catch (error) {
    res.status(500).json({ error: 'Failed to build ancestor tree' });
  }
});

// GET /tree/:personId/descendants — Descendants only
treeRouter.get('/:personId/descendants', (req, res) => {
  try {
    const personRepo = new PersonRepository();
    const familyRepo = new FamilyRepository();
    const generations = clampGenerations(req.query.generations as string);
    const personId = paramStr(req.params.personId);

    const person = personRepo.findById(personId);
    if (!person) {
      res.status(404).json({ error: 'Person not found' });
      return;
    }

    const tree = buildDescendantTree(personId, 0, generations, personRepo, familyRepo, new Set());
    res.json(tree);
  } catch (error) {
    res.status(500).json({ error: 'Failed to build descendant tree' });
  }
});

// GET /tree/unconnected-segments — Branches disconnected from the home person's tree
treeRouter.get('/unconnected-segments', (req, res) => {
  try {
    const db = getDatabase();
    const personRepo = new PersonRepository();

    const homePersonId = resolveHomePersonId(req.user!.userId);
    if (!homePersonId) {
      res.json({ segments: [] });
      return;
    }

    // Find every person reachable from the home person (no generation limit)
    const masterSet = bfsAllReachable(homePersonId);

    // All person IDs not in the master set
    const allIds = (db.prepare('SELECT id FROM persons').all() as { id: string }[]).map(r => r.id);
    const disconnectedIds = allIds.filter(id => !masterSet.has(id));

    if (disconnectedIds.length === 0) {
      res.json({ segments: [] });
      return;
    }

    // Group disconnected people into connected components
    const components = findConnectedComponents(disconnectedIds);

    // Sort by component size descending (largest branch first)
    components.sort((a, b) => b.length - a.length);

    // Build a mini-tree for each component
    const segments = components.map(componentIds => {
      // Root = first member with no parents in this component
      const componentSet = new Set(componentIds);
      let rootId = componentIds[0];

      for (const id of componentIds) {
        const parentFamilies = db.prepare(
          'SELECT family_id FROM family_members WHERE person_id = ?'
        ).all(id) as { family_id: string }[];

        const hasParent = parentFamilies.some(pf => {
          const fam = db.prepare(
            'SELECT spouse1_id, spouse2_id FROM families WHERE id = ?'
          ).get(pf.family_id) as { spouse1_id: string | null; spouse2_id: string | null } | undefined;
          return fam && (
            (fam.spouse1_id && componentSet.has(fam.spouse1_id)) ||
            (fam.spouse2_id && componentSet.has(fam.spouse2_id))
          );
        });

        if (!hasParent) {
          rootId = id;
          break;
        }
      }

      const { persons, families } = buildFlatTree(rootId, 20, personRepo);
      return { persons, families };
    });

    res.json({ segments });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get unconnected segments' });
  }
});

// GET /tree/unconnected-people — People with no family connections
treeRouter.get('/unconnected-people', (_req, res) => {
  try {
    const db = getDatabase();
    const personRepo = new PersonRepository();

    const rows = db.prepare(`
      SELECT p.id FROM persons p
      WHERE NOT EXISTS (SELECT 1 FROM families WHERE spouse1_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM families WHERE spouse2_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM family_members WHERE person_id = p.id)
      ORDER BY p.created_at ASC
    `).all() as { id: string }[];

    const people = rows
      .map(r => personRepo.findById(r.id))
      .filter(Boolean)
      .map(person => {
        const birthEvent = db.prepare(
          "SELECT event_date FROM events WHERE person_id = ? AND event_type = 'birth' LIMIT 1"
        ).get(person!.id) as { event_date: string | null } | undefined;

        const deathEvent = db.prepare(
          "SELECT event_date FROM events WHERE person_id = ? AND event_type = 'death' LIMIT 1"
        ).get(person!.id) as { event_date: string | null } | undefined;

        const primaryPhoto = db.prepare(
          'SELECT mi.id FROM media_items mi INNER JOIN person_media pm ON mi.id = pm.media_id WHERE pm.person_id = ? AND pm.is_primary = 1 LIMIT 1'
        ).get(person!.id) as { id: string } | undefined;

        return {
          id: person!.id,
          displayName: person!.displayName ?? null,
          display_name: person!.display_name ?? null,
          given_name: person!.primary_name?.given_name ?? null,
          middle_name: person!.primary_name?.middle_name ?? null,
          surname: person!.primary_name?.surname ?? null,
          sex: person!.sex,
          birth_date: birthEvent?.event_date ?? null,
          death_date: deathEvent?.event_date ?? null,
          is_living: person!.is_living === 1,
          is_private: person!.is_private === 1,
          photo_url: primaryPhoto ? `/api/v1/media/${primaryPhoto.id}` : null,
        };
      });

    res.json({ people });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get unconnected people' });
  }
});

// GET /tree/:personId — Flat tree centered on a specific person
treeRouter.get('/:personId', (req, res) => {
  try {
    const personRepo = new PersonRepository();
    const generations = clampGenerations(req.query.generations as string);
    const personId = paramStr(req.params.personId);

    const person = personRepo.findById(personId);
    if (!person) {
      res.status(404).json({ error: 'Person not found' });
      return;
    }

    const { persons, families } = buildFlatTree(personId, generations, personRepo);

    res.json({ persons, families, home_person_id: personId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to build tree' });
  }
});
