import { Router } from 'express';
import { getDatabase } from '../db/connection.js';
import { PersonRepository } from '../repositories/PersonRepository.js';
import { FamilyRepository } from '../repositories/FamilyRepository.js';
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

// GET /tree/:personId — Combined tree (ancestors + descendants)
treeRouter.get('/:personId', (req, res) => {
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

    const ancestorTree = buildAncestorTree(personId, 0, generations, personRepo, familyRepo, new Set());
    const descendantTree = buildDescendantTree(personId, 0, generations, personRepo, familyRepo, new Set());

    // Merge: root node gets ancestors' parents and descendants' children
    const combined: TreeNode = {
      person,
      generation: 0,
      parents: ancestorTree?.parents ?? [],
      spouses: ancestorTree?.spouses ?? descendantTree?.spouses ?? [],
      children: descendantTree?.children ?? [],
    };

    res.json(combined);
  } catch (error) {
    res.status(500).json({ error: 'Failed to build tree' });
  }
});
