import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { FamilyRepository } from '../repositories/FamilyRepository.js';
import { PersonRepository } from '../repositories/PersonRepository.js';

export const familiesRouter = Router();

function paramStr(val: string | string[]): string {
  return Array.isArray(val) ? val[0] : val;
}

function toSpouseSummary(person: ReturnType<PersonRepository['findById']> | null | undefined) {
  if (!person) return null;
  return {
    id: person.id,
    displayName: person.displayName ?? null,
    display_name: person.display_name ?? null,
    given_name: person.primary_name?.given_name ?? null,
    middle_name: person.primary_name?.middle_name ?? null,
    surname: person.primary_name?.surname ?? null,
  };
}

// GET /families — List families (paginated)
familiesRouter.get('/', (req, res) => {
  try {
    const repo = new FamilyRepository();
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const cursor = req.query.cursor as string | undefined;
    const search = req.query.q as string | undefined;
    const sortParam = req.query.sort as string | undefined;
    const filterParam = req.query.filter as string | undefined;

    const result = repo.findAll({
      limit,
      cursor,
      search,
      sort: sortParam === 'surname' ? 'surname' : undefined,
      filter: filterParam === 'unlinked' ? 'unlinked' : undefined,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list families' });
  }
});

// POST /families — Create family
familiesRouter.post(
  '/',
  requireRole('admin', 'editor', 'limited_editor'),
  validate([
    { field: 'spouse1_id', type: 'string' },
    { field: 'spouse2_id', type: 'string' },
  ]),
  (req, res) => {
    try {
      const familyRepo = new FamilyRepository();
      const personRepo = new PersonRepository();
      const { spouse1_id, spouse2_id, marriage_date, marriage_place } = req.body;

      const family = familyRepo.create({ spouse1_id, spouse2_id, marriage_date, marriage_place });
      const spouse1 = toSpouseSummary(family.spouse1_id ? personRepo.findById(family.spouse1_id) : null);
      const spouse2 = toSpouseSummary(family.spouse2_id ? personRepo.findById(family.spouse2_id) : null);
      res.status(201).json({ ...family, spouse1, spouse2 });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create family' });
    }
  },
);

// GET /families/person/:personId/active — Get active (non-divorced) marriages for a person
familiesRouter.get('/person/:personId/active', (req, res) => {
  try {
    const repo = new FamilyRepository();
    const personId = paramStr(req.params.personId);
    const activeMarriages = repo.findActiveByPerson(personId);
    res.json({ activeMarriages });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get active marriages' });
  }
});

// GET /families/:id — Get family with members
familiesRouter.get('/:id', (req, res) => {
  try {
    const familyRepo = new FamilyRepository();
    const personRepo = new PersonRepository();

    const family = familyRepo.findById(paramStr(req.params.id));
    if (!family) {
      res.status(404).json({ error: 'Family not found' });
      return;
    }

    const members = familyRepo.getMembers(family.id);
    const spouse1 = toSpouseSummary(family.spouse1_id ? personRepo.findById(family.spouse1_id) : null);
    const spouse2 = toSpouseSummary(family.spouse2_id ? personRepo.findById(family.spouse2_id) : null);
    const children = members.map(m => ({
      ...m,
      person: personRepo.findById(m.person_id),
    }));

    res.json({ ...family, spouse1, spouse2, children });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get family' });
  }
});

// PUT /families/:id — Update family
familiesRouter.put(
  '/:id',
  requireRole('admin', 'editor'),
  (req, res) => {
    try {
      const familyRepo = new FamilyRepository();
      const personRepo = new PersonRepository();
      const { spouse1_id, spouse2_id, marriage_date, marriage_place, divorce_date, divorce_place } = req.body;

      const family = familyRepo.update(paramStr(req.params.id), {
        spouse1_id, spouse2_id, marriage_date, marriage_place, divorce_date, divorce_place,
      });
      if (!family) {
        res.status(404).json({ error: 'Family not found' });
        return;
      }

      const spouse1 = toSpouseSummary(family.spouse1_id ? personRepo.findById(family.spouse1_id) : null);
      const spouse2 = toSpouseSummary(family.spouse2_id ? personRepo.findById(family.spouse2_id) : null);
      res.json({ ...family, spouse1, spouse2 });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update family' });
    }
  },
);

// DELETE /families/:id — Delete family
familiesRouter.delete(
  '/:id',
  requireRole('admin', 'editor'),
  (req, res) => {
    try {
      const repo = new FamilyRepository();
      const deleted = repo.delete(paramStr(req.params.id));
      if (!deleted) {
        res.status(404).json({ error: 'Family not found' });
        return;
      }

      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete family' });
    }
  },
);

// POST /families/:id/members — Add a child/member to a family
familiesRouter.post(
  '/:id/members',
  requireRole('admin', 'editor', 'limited_editor'),
  (req, res) => {
    try {
      const familyRepo = new FamilyRepository();
      const personRepo = new PersonRepository();

      const familyId = paramStr(req.params.id);
      const family = familyRepo.findById(familyId);
      if (!family) {
        res.status(404).json({ error: 'Family not found' });
        return;
      }

      const { person_id, role = 'child' } = req.body;
      if (!person_id) {
        res.status(400).json({ error: 'person_id is required' });
        return;
      }

      const person = personRepo.findById(person_id as string);
      if (!person) {
        res.status(404).json({ error: 'Person not found' });
        return;
      }

      const member = familyRepo.addMember(familyId, person_id as string, role as 'child' | 'adopted' | 'foster' | 'step');
      res.status(201).json(member);
    } catch (error) {
      res.status(500).json({ error: 'Failed to add family member' });
    }
  },
);

// DELETE /families/:id/members/:personId — Remove a member from a family
familiesRouter.delete(
  '/:id/members/:personId',
  requireRole('admin', 'editor'),
  (req, res) => {
    try {
      const repo = new FamilyRepository();
      const familyId = paramStr(req.params.id);
      const personId = paramStr(req.params.personId);

      const family = repo.findById(familyId);
      if (!family) {
        res.status(404).json({ error: 'Family not found' });
        return;
      }

      const removed = repo.removeMember(familyId, personId);
      if (!removed) {
        res.status(404).json({ error: 'Member not found in family' });
        return;
      }

      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to remove family member' });
    }
  },
);
