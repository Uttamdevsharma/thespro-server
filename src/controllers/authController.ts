import User from '../models/User.js';
import generateToken from '../utils/generateToken.js';
import asyncHandler from 'express-async-handler';

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
const registerUser = asyncHandler(async (req, res) => {
  console.log('registerUser called with body:', req.body);
  const { name, email, password } = req.body;

  const userExists = await User.findOne({ email });

  if (userExists) {
    res.status(400);
    throw new Error('User already exists');
  }

  const user = await User.create({
    name,
    email,
    password,
    role: 'student', // Default role for public registration
  });

  console.log('user created:', user);

  if (user) {
    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      studentId: user.studentId,
      profilePicture: user.profilePicture,
      department: user.department,
      currentCGPA: user.currentCGPA,
      token: generateToken(user._id),
    });
  } else {
    res.status(400);
    throw new Error('Invalid user data');
  }
});

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  console.log('Login attempt for email:', email);

  const user = await User.findOne({ email }).populate('department', 'name');
  console.log('User found:', user);
  
  if (user && (await user.matchPassword(password))) {
    console.log('Password matched for user:', user.email);
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      studentId: user.studentId,
      profilePicture: user.profilePicture,
      department: user.department || null,
      currentCGPA: user.currentCGPA,
      token: generateToken(user._id),
      currentGroupCount: user.currentGroupCount,
    });
  } else {
    console.log('Invalid email or password for email:', email);
    res.status(401);
    throw new Error('Invalid email or password');
  }
});

import { OAuth2Client } from 'google-auth-library';

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_CALLBACK_URL
);

export { registerUser, loginUser };

// @desc    Redirect to Google OAuth
// @route   GET /api/auth/google
// @access  Public
export const googleAuth = asyncHandler(async (req, res) => {
  const url = client.generateAuthUrl({
    access_type: 'offline',
    scope: ['profile', 'email'],
    prompt: 'consent',
  });
  res.redirect(url);
});

// @desc    Google OAuth Callback
// @route   GET /api/auth/callback/google
// @access  Public
export const googleCallback = asyncHandler(async (req, res) => {
  const { code } = req.query;

  // Exchange code for tokens
  const { tokens } = await client.getToken(code as string);

  client.setCredentials(tokens);

  // Get user info from Google
  const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const googleUser = await userInfoRes.json();

  if (!googleUser.email) {
    res.status(400);
    throw new Error('Google account must have an email');
  }

  // Find or create user
  let user = await User.findOne({ email: googleUser.email });

  if (!user) {
    user = await User.create({
      name: googleUser.name,
      email: googleUser.email,
      password: Math.random().toString(36).slice(-16), // Dummy password for Google users
      role: 'student', // Default role for Google login
      profilePicture: googleUser.picture,
    });
  }

  const token = generateToken(user._id);

  // Prepare user info for frontend hydration
  const userData = {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    studentId: user.studentId,
    profilePicture: user.profilePicture,
    department: user.department,
    currentCGPA: user.currentCGPA,
    token
  };

  const encodedUser = Buffer.from(JSON.stringify(userData)).toString('base64');

  // Redirect to frontend with token and user data
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  res.redirect(`${frontendUrl}/google-success?data=${encodedUser}`);
});
