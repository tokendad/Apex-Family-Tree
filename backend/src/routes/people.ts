import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { PersonRepository } from '../repositories/PersonRepository.js';
import { EventRepository } from '../repositories/EventRepository.js';
import { FamilyRepository } from '../repositories/FamilyRepository.js';
import type { Name } from '../types/db.js';

function paramStr(val: string | string[]): string {
  return Array.isArray(val) ? val[0] : val;
}

export const peopleRouter = Router();

// GET /people — List all persons (paginated, searchable, filterable)
peopleRouter.get('/', async (req, res) => {
  try {
    const repo = new PersonRepository();
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const cursor = req.query.cursor as string | undefined;
    const search = req.query.q as string | undefined;
    const living = req.query.living !== undefined
      ? req.query.living === 'true'
      : undefined;
    const sortParam = req.query.sort as string | undefined;
    const filterParam = req.query.filter as string | undefined;

    // Advanced search filters
    const firstName = req.query.firstName as string | undefined;
    const lastName = req.query.lastName as string | undefined;
    const nameMatch = req.query.nameMatch as string | undefined;
    const initial = req.query.initial as string | undefined;
    const sex = req.query.sex as string | undefined;
    const birthFrom = req.query.birthFrom ? parseInt(req.query.birthFrom as string) : undefined;
    const birthTo = req.query.birthTo ? parseInt(req.query.birthTo as string) : undefined;
    const deathFrom = req.query.deathFrom ? parseInt(req.query.deathFrom as string) : undefined;
    const deathTo = req.query.deathTo ? parseInt(req.query.deathTo as string) : undefined;
    const marriageFrom = req.query.marriageFrom ? parseInt(req.query.marriageFrom as string) : undefined;
    const marriageTo = req.query.marriageTo ? parseInt(req.query.marriageTo as string) : undefined;
    const missingBirth = req.query.missingBirth === 'true' ? true : undefined;
    const missingDeath = req.query.missingDeath === 'true' ? true : undefined;
    const missingMarriage = req.query.missingMarriage === 'true' ? true : undefined;
    const dateQualifierParam = req.query.dateQualifier as string | undefined;
    const place = req.query.place as string | undefined;
    const placeCountry = req.query.placeCountry as string | undefined;
    const placeState = req.query.placeState as string | undefined;
    const placeCity = req.query.placeCity as string | undefined;
    const hasPhoto = req.query.hasPhoto === 'true' ? true : undefined;
    const hasSources = req.query.hasSources === 'true' ? true : undefined;
    const hasMissingData = req.query.hasMissingData === 'true' ? true : undefined;
    const relationship = req.query.relationship as string | undefined;

    const validNameMatch = nameMatch === 'startsWith' || nameMatch === 'exact' || nameMatch === 'soundex' ? nameMatch : 'contains';
    const validSex = sex && ['M', 'F', 'X', 'U'].includes(sex) ? sex : undefined;
    const validRelationship = relationship && ['ancestor', 'descendant', 'sibling', 'spouse'].includes(relationship)
      ? relationship as 'ancestor' | 'descendant' | 'sibling' | 'spouse'
      : undefined;
    const validDateQualifier = dateQualifierParam && ['exact', 'approximate', 'before', 'after'].includes(dateQualifierParam)
      ? dateQualifierParam as 'exact' | 'approximate' | 'before' | 'after'
      : undefined;

    // Read home person from authenticated user for relationship filter
    let homePersonId: string | undefined;
    if (validRelationship && req.user) {
      const { UserRepository } = await import('../repositories/UserRepository.js');
      const userRepo = new UserRepository();
      const user = userRepo.findById(req.user.userId);
      homePersonId = user?.home_person_id ?? undefined;
    }

    const result = repo.findAll({
      limit,
      cursor,
      search,
      isLiving: living,
      sort: sortParam === 'surname' ? 'surname' : undefined,
      filter: filterParam === 'unconnected' ? 'unconnected' : undefined,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      nameMatchType: validNameMatch as 'contains' | 'startsWith' | 'exact' | 'soundex',
      initial: initial || undefined,
      sex: validSex,
      birthYearFrom: birthFrom && !isNaN(birthFrom) ? birthFrom : undefined,
      birthYearTo: birthTo && !isNaN(birthTo) ? birthTo : undefined,
      deathYearFrom: deathFrom && !isNaN(deathFrom) ? deathFrom : undefined,
      deathYearTo: deathTo && !isNaN(deathTo) ? deathTo : undefined,
      marriageYearFrom: marriageFrom && !isNaN(marriageFrom) ? marriageFrom : undefined,
      marriageYearTo: marriageTo && !isNaN(marriageTo) ? marriageTo : undefined,
      missingBirthDate: missingBirth,
      missingDeathDate: missingDeath,
      missingMarriageDate: missingMarriage,
      dateQualifier: validDateQualifier,
      place: place || undefined,
      placeCountry: placeCountry || undefined,
      placeState: placeState || undefined,
      placeCity: placeCity || undefined,
      hasPhoto,
      hasSources,
      hasMissingData,
      relationshipType: validRelationship,
      homePersonId,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list persons' });
  }
});

// POST /people — Create person (with names)
peopleRouter.post(
  '/',
  requireRole('admin', 'editor', 'limited_editor'),
  validate([
    { field: 'sex', type: 'string', enum: ['M', 'F', 'X', 'U'] },
  ]),
  (req, res) => {
    try {
      const repo = new PersonRepository();
      const { sex, is_living, is_private, notes, names } = req.body;

      const person = repo.create({
        sex: sex || 'U',
        is_living: is_living ?? 1,
        is_private: is_private ?? 0,
        notes,
        created_by: req.user!.userId,
      });

      const addedNames: Name[] = [];
      if (Array.isArray(names)) {
        for (const nameData of names) {
          const name = repo.addName(person.id, {
            name_type: nameData.name_type,
            prefix: nameData.prefix,
            given_name: nameData.given_name,
            surname: nameData.surname,
            suffix: nameData.suffix,
            is_primary: nameData.is_primary,
          });
          addedNames.push(name);
        }
      }

      const result = repo.findById(person.id);
      res.status(201).json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create person' });
    }
  },
);

// GET /people/:id — Get person by ID (with names, events)
peopleRouter.get('/:id', (req, res) => {
  try {
    const repo = new PersonRepository();
    const eventRepo = new EventRepository();

    const id = paramStr(req.params.id);
    const person = repo.findById(id);
    if (!person) {
      res.status(404).json({ error: 'Person not found' });
      return;
    }

    const events = eventRepo.findByPerson(person.id);
    res.json({ ...person, events });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get person' });
  }
});

// PUT /people/:id — Update person
peopleRouter.put(
  '/:id',
  requireRole('admin', 'editor'),
  validate([
    { field: 'sex', type: 'string', enum: ['M', 'F', 'X', 'U'] },
  ]),
  (req, res) => {
    try {
      const repo = new PersonRepository();
      const { sex, is_living, is_private, notes } = req.body;
      const id = paramStr(req.params.id);

      const person = repo.update(id, { sex, is_living, is_private, notes });
      if (!person) {
        res.status(404).json({ error: 'Person not found' });
        return;
      }

      const result = repo.findById(person.id);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update person' });
    }
  },
);

// DELETE /people/:id — Delete person (admin/editor only)
peopleRouter.delete(
  '/:id',
  requireRole('admin', 'editor'),
  (req, res) => {
    try {
      const repo = new PersonRepository();
      const deleted = repo.delete(paramStr(req.params.id));
      if (!deleted) {
        res.status(404).json({ error: 'Person not found' });
        return;
      }

      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete person' });
    }
  },
);

// GET /people/:id/relationships — Get relationships
peopleRouter.get('/:id/relationships', (req, res) => {
  try {
    const repo = new PersonRepository();
    const id = paramStr(req.params.id);
    const person = repo.findById(id);
    if (!person) {
      res.status(404).json({ error: 'Person not found' });
      return;
    }

    const result = repo.getRelationshipsForDetail(id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get relationships' });
  }
});

// POST /people/:id/relationships — Add relationship
peopleRouter.post(
  '/:id/relationships',
  requireRole('admin', 'editor', 'limited_editor'),
  validate([
    { field: 'type', required: true, type: 'string', enum: ['spouse', 'child'] },
    { field: 'person_id', required: true, type: 'string' },
  ]),
  (req, res) => {
    try {
      const personRepo = new PersonRepository();
      const familyRepo = new FamilyRepository();
      const { type, person_id, family_id, role } = req.body;
      const personId = paramStr(req.params.id);

      const person = personRepo.findById(personId);
      if (!person) {
        res.status(404).json({ error: 'Person not found' });
        return;
      }

      const relatedPerson = personRepo.findById(person_id);
      if (!relatedPerson) {
        res.status(404).json({ error: 'Related person not found' });
        return;
      }

      if (type === 'spouse') {
        const family = familyRepo.create({
          spouse1_id: personId,
          spouse2_id: person_id,
        });
        res.status(201).json(family);
      } else if (type === 'child') {
        // Add person_id as child to an existing or new family
        let targetFamilyId = family_id;
        if (!targetFamilyId) {
          const family = familyRepo.create({ spouse1_id: personId });
          targetFamilyId = family.id;
        }
        const member = familyRepo.addMember(targetFamilyId, person_id, role || 'child');
        res.status(201).json(member);
      } else {
        res.status(400).json({ error: 'Invalid relationship type' });
      }
    } catch (error) {
      res.status(500).json({ error: 'Failed to add relationship' });
    }
  },
);

// POST /people/:id/names — Add a name to a person
peopleRouter.post(
  '/:id/names',
  requireRole('admin', 'editor', 'limited_editor'),
  (req, res) => {
    try {
      const repo = new PersonRepository();
      const personId = paramStr(req.params.id);

      const person = repo.findById(personId);
      if (!person) {
        res.status(404).json({ error: 'Person not found' });
        return;
      }

      const { name_type, given_name, surname, prefix, suffix, is_primary } = req.body;
      const name = repo.addName(personId, { name_type, given_name, surname, prefix, suffix, is_primary });
      res.status(201).json(name);
    } catch (error) {
      res.status(500).json({ error: 'Failed to add name' });
    }
  },
);

// PUT /people/:id/names/:nameId — Update a name
peopleRouter.put(
  '/:id/names/:nameId',
  requireRole('admin', 'editor'),
  (req, res) => {
    try {
      const repo = new PersonRepository();
      const personId = paramStr(req.params.id);
      const nameId = paramStr(req.params.nameId);

      const person = repo.findById(personId);
      if (!person) {
        res.status(404).json({ error: 'Person not found' });
        return;
      }

      const existingName = repo.findNameById(nameId);
      if (!existingName || existingName.person_id !== personId) {
        res.status(404).json({ error: 'Name not found' });
        return;
      }

      const { name_type, given_name, surname, prefix, suffix, is_primary } = req.body;
      const updated = repo.updateName(nameId, { name_type, given_name, surname, prefix, suffix, is_primary });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update name' });
    }
  },
);

// DELETE /people/:id/names/:nameId — Delete a name
peopleRouter.delete(
  '/:id/names/:nameId',
  requireRole('admin', 'editor'),
  (req, res) => {
    try {
      const repo = new PersonRepository();
      const personId = paramStr(req.params.id);
      const nameId = paramStr(req.params.nameId);

      const person = repo.findById(personId);
      if (!person) {
        res.status(404).json({ error: 'Person not found' });
        return;
      }

      const existingName = repo.findNameById(nameId);
      if (!existingName || existingName.person_id !== personId) {
        res.status(404).json({ error: 'Name not found' });
        return;
      }

      repo.deleteName(nameId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete name' });
    }
  },
);
