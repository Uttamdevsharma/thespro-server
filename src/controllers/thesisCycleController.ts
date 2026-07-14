import asyncHandler from 'express-async-handler';
import ThesisCycle from '../models/ThesisCycle.js';

// Helper: a cohort's registration window is open when:
//  - it is not archived / not explicitly Closed, AND
//  - an explicit registration window is set AND the current date falls within it, OR
//  - no explicit window is set AND the cohort is Active or accepting submissions
//    (admin/committee "opened" it via activation or proposal submission).
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

// @desc    Create a thesis cycle / cohort
// @route   POST /api/thesis-cycles
// @access  Private (Admin)
export const createThesisCycle = asyncHandler(async (req, res) => {
  const {
    name,
    academicYear,
    semester,
    startSemester,
    endSemester,
    registrationStartDate,
    registrationEndDate,
    status,
    proposalSubmissionOpen,
    proposalSubmissionDeadline,
  } = req.body;

  if (!name) {
    res.status(400);
    throw new Error('Cohort name is required');
  }

  const existing = await ThesisCycle.findOne({ name });
  if (existing) {
    res.status(400);
    throw new Error('A cohort with this name already exists');
  }

  const cycle = await ThesisCycle.create({
    name,
    academicYear: academicYear || semester || '',
    semester: semester || '',
    startSemester,
    endSemester,
    registrationStartDate: registrationStartDate ? new Date(registrationStartDate) : undefined,
    registrationEndDate: registrationEndDate ? new Date(registrationEndDate) : undefined,
    status: status || 'Upcoming',
    proposalSubmissionOpen: !!proposalSubmissionOpen,
    proposalSubmissionDeadline: proposalSubmissionDeadline ? new Date(proposalSubmissionDeadline) : undefined,
    createdBy: req.user._id,
  });

  res.status(201).json(cycle);
});

// @desc    Get all thesis cycles / cohorts
// @route   GET /api/thesis-cycles
// @access  Private (Admin)
export const getThesisCycles = asyncHandler(async (req, res) => {
  const cycles = await ThesisCycle.find({}).sort({ createdAt: -1 });
  res.json(cycles);
});

// @desc    Get a single thesis cycle by ID
// @route   GET /api/thesis-cycles/:id
// @access  Private (Any authenticated user — students need their own cohort)
export const getThesisCycleById = asyncHandler(async (req, res) => {
  const cycle = await ThesisCycle.findById(req.params.id);

  if (!cycle) {
    res.status(404);
    throw new Error('Cohort not found');
  }

  res.json(cycle);
});

// @desc    Update a thesis cycle / cohort
// @route   PUT /api/thesis-cycles/:id
// @access  Private (Admin)
export const updateThesisCycle = asyncHandler(async (req, res) => {
  const cycle = await ThesisCycle.findById(req.params.id);

  if (!cycle) {
    res.status(404);
    throw new Error('Cohort not found');
  }

  const {
    name,
    academicYear,
    semester,
    startSemester,
    endSemester,
    registrationStartDate,
    registrationEndDate,
    status,
    proposalSubmissionOpen,
    proposalSubmissionDeadline,
    archived,
  } = req.body;

  if (name !== undefined) {
    const duplicate = await ThesisCycle.findOne({ name, _id: { $ne: cycle._id } });
    if (duplicate) {
      res.status(400);
      throw new Error('A cohort with this name already exists');
    }
    cycle.name = name;
  }
  if (academicYear !== undefined) cycle.academicYear = academicYear;
  if (semester !== undefined) cycle.semester = semester;
  if (startSemester !== undefined) cycle.startSemester = startSemester;
  if (endSemester !== undefined) cycle.endSemester = endSemester;
  if (registrationStartDate !== undefined) cycle.registrationStartDate = registrationStartDate ? new Date(registrationStartDate) : undefined;
  if (registrationEndDate !== undefined) cycle.registrationEndDate = registrationEndDate ? new Date(registrationEndDate) : undefined;
  if (status !== undefined) cycle.status = status;
  if (proposalSubmissionOpen !== undefined) cycle.proposalSubmissionOpen = !!proposalSubmissionOpen;
  if (proposalSubmissionDeadline !== undefined) cycle.proposalSubmissionDeadline = proposalSubmissionDeadline ? new Date(proposalSubmissionDeadline) : undefined;
  if (archived !== undefined) cycle.archived = !!archived;

  const updated = await cycle.save();
  res.json(updated);
});

// @desc    Get public cohorts whose registration window is currently open
// @route   GET /api/thesis-cycles/open-for-registration
// @access  Public
export const getOpenForRegistration = asyncHandler(async (req, res) => {
  const cycles = await ThesisCycle.find({ archived: false }).sort({ registrationStartDate: 1 });
  const open = cycles
    .filter((c) => isRegistrationOpen(c))
    .map((c) => ({
      _id: c._id,
      name: c.name,
      academicYear: c.academicYear,
      semester: c.semester,
      registrationStartDate: c.registrationStartDate,
      registrationEndDate: c.registrationEndDate,
      status: c.status,
    }));
  res.json(open);
});

// @desc    Get the currently authenticated user's assigned cohort
// @route   GET /api/thesis-cycles/me
// @access  Private
export const getMyCohort = asyncHandler(async (req, res) => {
  if (!req.user.cohort) {
    return res.json(null);
  }
  const cycle = await ThesisCycle.findById(req.user.cohort);
  if (!cycle) {
    return res.json(null);
  }
  res.json(cycle);
});

// @desc    Toggle archive status of a thesis cycle
// @route   PATCH /api/thesis-cycles/:id/archive
// @access  Private (Admin)
export const archiveThesisCycle = asyncHandler(async (req, res) => {
  const cycle = await ThesisCycle.findById(req.params.id);

  if (!cycle) {
    res.status(404);
    throw new Error('Cohort not found');
  }

  cycle.archived = !cycle.archived;
  const updated = await cycle.save();
  res.json(updated);
});

// @desc    Set a cohort as active (only one active at a time)
// @route   PUT /api/thesis-cycles/:id/activate
// @access  Private (Admin)
export const setActiveCohort = asyncHandler(async (req, res) => {
  const cycle = await ThesisCycle.findById(req.params.id);

  if (!cycle) {
    res.status(404);
    throw new Error('Cohort not found');
  }

  // Deactivate all other cycles first
  await ThesisCycle.updateMany(
    { _id: { $ne: cycle._id }, status: 'Active' },
    { status: 'Upcoming' }
  );

  // Activate the selected cycle
  cycle.status = 'Active';
  cycle.archived = false;
  const updated = await cycle.save();

  res.json(updated);
});

// @desc    Committee opens/closes proposal submission and sets the deadline for a cohort
// @route   PUT /api/thesis-cycles/:id/proposal-submission
// @access  Private (Committee)
export const setProposalSubmission = asyncHandler(async (req, res) => {
  const cycle = await ThesisCycle.findById(req.params.id);

  if (!cycle) {
    res.status(404);
    throw new Error('Cohort not found');
  }

  const { open, proposalSubmissionDeadline } = req.body;

  if (open !== undefined) cycle.proposalSubmissionOpen = !!open;
  if (proposalSubmissionDeadline !== undefined) {
    cycle.proposalSubmissionDeadline = proposalSubmissionDeadline ? new Date(proposalSubmissionDeadline) : undefined;
  }

  const updated = await cycle.save();
  res.json(updated);
});

// @desc    Admin manages the registration window for a cohort
// @route   PUT /api/thesis-cycles/:id/registration
// @access  Private (Admin)
export const setRegistrationWindow = asyncHandler(async (req, res) => {
  const cycle = await ThesisCycle.findById(req.params.id);

  if (!cycle) {
    res.status(404);
    throw new Error('Cohort not found');
  }

  const { registrationStartDate, registrationEndDate } = req.body;

  if (registrationStartDate !== undefined) {
    cycle.registrationStartDate = registrationStartDate ? new Date(registrationStartDate) : undefined;
  }
  if (registrationEndDate !== undefined) {
    cycle.registrationEndDate = registrationEndDate ? new Date(registrationEndDate) : undefined;
  }

  const updated = await cycle.save();
  res.json(updated);
});

// @desc    Get the currently active cohort
// @route   GET /api/thesis-cycles/active
// @access  Protected (any authenticated user)
export const getActiveCohort = asyncHandler(async (req, res) => {
  const active = await ThesisCycle.findOne({ status: 'Active', archived: false });
  if (!active) {
    return res.json(null);
  }
  res.json(active);
});

// @desc    Get public cohorts that are open for proposal submission
// @route   GET /api/public/thesis-cycles
// @access  Public
export const getPublicThesisCycles = asyncHandler(async (req, res) => {
  const cycles = await ThesisCycle.find({
    archived: false,
    proposalSubmissionOpen: true,
  }).sort({ createdAt: -1 });
  res.json(cycles);
});

export {
  isRegistrationOpen,
};
