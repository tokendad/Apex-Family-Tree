import { Router } from 'express';
import { UserRepository } from '../repositories/UserRepository.js';
import { PersonRepository } from '../repositories/PersonRepository.js';

export const homePersonRouter = Router();

// GET /home-person — Get current user's home person
homePersonRouter.get('/', (req, res) => {
  try {
    const userRepo = new UserRepository();
    const personRepo = new PersonRepository();

    const user = userRepo.findById(req.user!.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (!user.home_person_id) {
      res.json({ home_person: null });
      return;
    }

    const person = personRepo.findById(user.home_person_id);
    res.json({ home_person: person || null });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get home person' });
  }
});

// PUT /home-person — Set home person for current user
homePersonRouter.put('/', (req, res) => {
  try {
    const userRepo = new UserRepository();
    const personRepo = new PersonRepository();

    const { person_id } = req.body;

    if (person_id) {
      const person = personRepo.findById(person_id);
      if (!person) {
        res.status(404).json({ error: 'Person not found' });
        return;
      }
    }

    userRepo.update(req.user!.userId, { home_person_id: person_id || null });

    const updatedUser = userRepo.findById(req.user!.userId);
    const homePerson = updatedUser?.home_person_id
      ? personRepo.findById(updatedUser.home_person_id)
      : null;

    res.json({ home_person: homePerson || null });
  } catch (error) {
    res.status(500).json({ error: 'Failed to set home person' });
  }
});
