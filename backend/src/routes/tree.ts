import { Router } from 'express';
import { getDatabase } from '../db/connection.js';
import { PersonRepository } from '../repositories/PersonRepository.js';
import { FamilyRepository } from '../repositories/FamilyRepository.js';
import { TreeRepository } from '../repositories/TreeRepository.js';
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

// GET /tree — Root endpoint: uses caller's home_person_id
treeRouter.get('/', (req, res) => {
  try {
    const userRepo = new UserRepository();
    const treeRepo = new TreeRepository();

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
    const { persons, families } = treeRepo.getFlatTree(homePersonId, generations);

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
    const treeRepo = new TreeRepository();

    const homePersonId = resolveHomePersonId(req.user!.userId);
    if (!homePersonId) {
      res.json({ segments: [] });
      return;
    }

    // Find every person reachable from the home person (no generation limit)
    const masterSet = treeRepo.getReachablePersonIds(homePersonId);

    // All person IDs not in the master set
    const allIds = (db.prepare('SELECT id FROM persons').all() as { id: string }[]).map(r => r.id);
    const disconnectedIds = allIds.filter(id => !masterSet.has(id));

    if (disconnectedIds.length === 0) {
      res.json({ segments: [] });
      return;
    }

    // Group disconnected people into connected components
    const components = treeRepo.findConnectedComponents(disconnectedIds);

    // Sort by component size descending (largest branch first)
    components.sort((a, b) => b.length - a.length);

    // Build a mini-tree for each component
    const segments = components.map(componentIds => {
      // Root = first member with no parents in this component
      const componentSet = new Set(componentIds);
      let rootId = componentIds[0];

      for (const id of componentIds) {
        const hasParent = treeRepo.getAllTreeFamilies().some((family) => (
          family.children_ids.includes(id) &&
          ((family.spouse1_id && componentSet.has(family.spouse1_id)) ||
            (family.spouse2_id && componentSet.has(family.spouse2_id)))
        ));

        if (!hasParent) {
          rootId = id;
          break;
        }
      }

      const { persons, families } = treeRepo.getFlatTree(rootId, 20);
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
    const treeRepo = new TreeRepository();

    const rows = db.prepare(`
      SELECT p.id FROM persons p
      ORDER BY p.created_at ASC
    `).all() as { id: string }[];

    const people = rows
      .filter(r => !treeRepo.personHasTreeConnection(r.id))
      .map(r => treeRepo.getTreePersonById(r.id))
      .filter((person): person is NonNullable<typeof person> => Boolean(person));

    res.json({ people });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get unconnected people' });
  }
});

// GET /tree/:personId — Flat tree centered on a specific person
treeRouter.get('/:personId', (req, res) => {
  try {
    const personRepo = new PersonRepository();
    const treeRepo = new TreeRepository();
    const generations = clampGenerations(req.query.generations as string);
    const personId = paramStr(req.params.personId);

    const person = personRepo.findById(personId);
    if (!person) {
      res.status(404).json({ error: 'Person not found' });
      return;
    }

    const { persons, families } = treeRepo.getFlatTree(personId, generations);

    res.json({ persons, families, home_person_id: personId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to build tree' });
  }
});
