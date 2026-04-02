import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { FamilyRepository } from '../repositories/FamilyRepository.js';
import { PersonRepository } from '../repositories/PersonRepository.js';

export const familiesRouter = Router();

function paramStr(val: string | string[]): string {
  return Array.isArray(val) ? val[0] : val;
}

// GET /families — List families (paginated)
familiesRouter.get('/', (req, res) => {
  try {
    const repo = new FamilyRepository();
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const cursor = req.query.cursor as string | undefined;

    const result = repo.findAll({ limit, cursor });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list families' });
  }
});

// POST /families — Create family
familiesRouter.post(
  '/',
  requireRole('admin', 'editor'),
  validate([
    { field: 'spouse1_id', type: 'string' },
    { field: 'spouse2_id', type: 'string' },
  ]),
  (req, res) => {
    try {
      const repo = new FamilyRepository();
      const { spouse1_id, spouse2_id, marriage_date, marriage_place } = req.body;

      const family = repo.create({ spouse1_id, spouse2_id, marriage_date, marriage_place });
      res.status(201).json(family);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create family' });
    }
  },
);

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
    const spouse1 = family.spouse1_id ? personRepo.findById(family.spouse1_id) : null;
    const spouse2 = family.spouse2_id ? personRepo.findById(family.spouse2_id) : null;
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
      const repo = new FamilyRepository();
      const { spouse1_id, spouse2_id, marriage_date, marriage_place, divorce_date, divorce_place } = req.body;

      const family = repo.update(paramStr(req.params.id), {
        spouse1_id, spouse2_id, marriage_date, marriage_place, divorce_date, divorce_place,
      });
      if (!family) {
        res.status(404).json({ error: 'Family not found' });
        return;
      }

      res.json(family);
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
