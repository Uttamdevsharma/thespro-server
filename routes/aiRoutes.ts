import express from 'express';
import { chatWithAI, generateProposalDescription } from '../controllers/aiController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Routes for AI assistant
router.post('/chat', chatWithAI);
router.post('/generate-description', protect, generateProposalDescription);

export default router;
