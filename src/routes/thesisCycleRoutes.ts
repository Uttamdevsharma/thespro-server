import express from 'express';
import {
  createThesisCycle,
  getThesisCycles,
  getThesisCycleById,
  updateThesisCycle,
  archiveThesisCycle,
  setActiveCohort,
  getActiveCohort,
  getOpenForRegistration,
  getMyCohort,
  setProposalSubmission,
  setRegistrationWindow,
} from '../controllers/thesisCycleController.js';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';

const router = express.Router();

// Open registration cohorts — public so the registration page can show them
router.get('/open-for-registration', getOpenForRegistration);

// Active cohort — any authenticated user
router.get('/active', protect, getActiveCohort);

// The current user's assigned cohort — any authenticated user
router.get('/me', protect, getMyCohort);

router.use(protect);

// Admin-only cohort management
router.route('/')
  .post(authorizeRoles('admin'), createThesisCycle)
  .get(authorizeRoles('admin'), getThesisCycles);

// Any authenticated user may read a single cohort (students need their own cohort)
router.get('/:id', getThesisCycleById);

// Committee manages proposal submission windows per cohort
router.put('/:id/proposal-submission', authorizeRoles('committee'), setProposalSubmission);

// Admin manages registration windows and lifecycle
router.put('/:id/registration', authorizeRoles('admin'), setRegistrationWindow);
router.put('/:id/activate', authorizeRoles('admin'), setActiveCohort);
router.patch('/:id/archive', authorizeRoles('admin'), archiveThesisCycle);
router.put('/:id', authorizeRoles('admin'), updateThesisCycle);

export default router;
