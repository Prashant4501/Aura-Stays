import { Router } from 'express';
import {
  searchAvailableRooms,
  getRoomById,
  roomSearchSchema,
} from '../controllers/roomController.js';
import { validateRequest } from '../middlewares/validate.js';

const router = Router();

// Public room search endpoint
router.get('/search', validateRequest({ query: roomSearchSchema }), searchAvailableRooms);

// Public single room details & booked dates endpoint
router.get('/:id', getRoomById);

export default router;
