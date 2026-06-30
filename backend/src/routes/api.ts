import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { peopleRouter } from './people.js';
import { eventsRouter } from './events.js';
import { familiesRouter } from './families.js';
import { treeRouter } from './tree.js';
import { mediaRouter } from './media.js';
import { artifactsRouter } from './artifacts.js';
import { placesRouter } from './places.js';
import { relationshipsRouter } from './relationships.js';
import { sourcesRouter } from './sources.js';
import { homePersonRouter } from './homePerson.js';
import { adminRouter } from './admin.js';
import { settingsRouter } from './settings.js';
import { gedcomRouter } from './gedcom.js';
import { toolsRouter } from './tools.js';

const apiRouter = Router();

// All v1 routes require authentication
apiRouter.use('/v1', requireAuth);
apiRouter.use('/v1/people', peopleRouter);
apiRouter.use('/v1/events', eventsRouter);
apiRouter.use('/v1/families', familiesRouter);
apiRouter.use('/v1/tree', treeRouter);
apiRouter.use('/v1/media', mediaRouter);
apiRouter.use('/v1/artifacts', artifactsRouter);
apiRouter.use('/v1/places', placesRouter);
apiRouter.use('/v1/relationships', relationshipsRouter);
apiRouter.use('/v1/sources', sourcesRouter);
apiRouter.use('/v1/home-person', homePersonRouter);
apiRouter.use('/v1/admin', adminRouter);
apiRouter.use('/v1/admin', settingsRouter);
apiRouter.use('/v1/gedcom', gedcomRouter);
apiRouter.use('/v1/tools', toolsRouter);

export { apiRouter };
