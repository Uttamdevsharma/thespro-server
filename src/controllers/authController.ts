import User from '../models/User.js';
import ThesisCycle from '../models/ThesisCycle.js';
import generateToken from '../utils/generateToken.js';
import asyncHandler from 'express-async-handler';

// Returns true when a cohort's registration window is currently open
const isRegistrationOpen = (cycle: any): boolean => {
  if (!cycle || cycle.archived) return false;
  if (cycle.status === 'Closed') return false;
  // If the committee/admin opened proposal submission for this cohort,
  // registration must be open as well.
  if (cycle.proposalSubmissionOpen === true) return true;
  const now = new Date();
  const start = cycle.registrationStartDate ? new Date(cycle.registrationStartDate) : null;
  const end = cycle.registrationEndDate ? new Date(cycle.registrationEndDate) : null;
  if (start || end) {
    if (start && now < start) return false;
    if (end && now > end) return false;
    return true;
  }
  return cycle.status === 'Active';
};

// Resolve the cohort a new student should join based on the open registration windows.
// Returns the cohort id, or throws an error carrying a `status` for the response.
const resolveRegistrationCohort = async (cohortId?: string): Promise<any> => {
  if (cohortId) {
    const cohort = await ThesisCycle.findById(cohortId);
    if (!cohort || cohort.archived || !isRegistrationOpen(cohort)) {
      const err: any = new Error('The selected cohort is not open for registration.');
      err.status = 400;
      throw err;
    }
    return cohort._id;
  }

  const openCohorts = (await ThesisCycle.find({ archived: false })).filter((c) => isRegistrationOpen(c));
  if (openCohorts.length === 0) {
    const err: any = new Error('Registration for the current cohort has ended. Please wait for the next registration period.');
    err.status = 403;
    throw err;
  }
  if (openCohorts.length === 1) {
    return openCohorts[0]._id;
  }
  const err: any = new Error('Multiple cohorts are open for registration. Please select one.');
  err.status = 400;
  throw err;
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
const registerUser = asyncHandler(async (req, res) => {
  const { name, email, password, cohortId } = req.body;

  const userExists = await User.findOne({ email });

  if (userExists) {
    res.status(400);
    throw new Error('User already exists');
  }

  let assignedCohort: any;
  try {
    assignedCohort = await resolveRegistrationCohort(cohortId);
  } catch (err: any) {
    res.status(err.status || 400);
    throw new Error(err.message);
  }

  const user = await User.create({
    name,
    email,
    password,
    role: 'student', // Default role for public registration
    cohort: assignedCohort,
  });

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
      cohort: user.cohort,
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
      cohort: user.cohort || null,
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
  const cohortId = req.query.cohortId as string | undefined;
  const state = cohortId ? Buffer.from(JSON.stringify({ cohortId })).toString('base64') : undefined;
  const url = client.generateAuthUrl({
    access_type: 'offline',
    scope: ['profile', 'email'],
    prompt: 'consent',
    ...(state ? { state } : {}),
  });
  res.redirect(url);
});

// @desc    Google OAuth Callback
// @route   GET /api/auth/callback/google
// @access  Public
export const googleCallback = asyncHandler(async (req, res) => {
  const { code, state } = req.query;

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

  // Resolve a cohort for the student (carried through OAuth state)
  let requestedCohortId: string | undefined;
  if (state) {
    try {
      requestedCohortId = JSON.parse(Buffer.from(state as string, 'base64').toString()).cohortId;
    } catch {
      requestedCohortId = undefined;
    }
  }
  let assignedCohort = user?.cohort || null;
  if (!assignedCohort && requestedCohortId) {
    const cohort = await ThesisCycle.findById(requestedCohortId);
    if (cohort && !cohort.archived && isRegistrationOpen(cohort)) {
      assignedCohort = cohort._id;
    }
  }
  if (!assignedCohort) {
    const openCohorts = (await ThesisCycle.find({ archived: false })).filter((c) => isRegistrationOpen(c));
    if (openCohorts.length === 1) assignedCohort = openCohorts[0]._id;
  }

  if (!user) {
    user = await User.create({
      name: googleUser.name,
      email: googleUser.email,
      password: Math.random().toString(36).slice(-16), // Dummy password for Google users
      role: 'student', // Default role for Google login
      profilePicture: googleUser.picture,
      cohort: assignedCohort,
    });
  } else if (!user.cohort && assignedCohort) {
    user.cohort = assignedCohort;
    await user.save();
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
    cohort: user.cohort,
    token
  };

  const encodedUser = Buffer.from(JSON.stringify(userData)).toString('base64');

  // Redirect to frontend with token and user data
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  res.redirect(`${frontendUrl}/google-success?data=${encodedUser}`);
});
