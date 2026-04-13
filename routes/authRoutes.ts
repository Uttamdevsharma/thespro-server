import express from 'express';
import { registerUser, loginUser, googleAuth, googleCallback } from '../controllers/authController.js';

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/google', googleAuth);
router.get('/callback/google', googleCallback);

export default router;