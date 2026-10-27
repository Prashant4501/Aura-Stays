import { Router } from 'express';
import { listProperties, getPropertyById } from '../controllers/propertyController.js';

const router = Router();

// Public property endpoints
router.get('/', listProperties);
router.get('/:id', getPropertyById);

export default router;
