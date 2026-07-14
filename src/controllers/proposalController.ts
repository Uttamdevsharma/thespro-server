import Proposal from '../models/Proposal.js';
import User from '../models/User.js';
import ResearchCell from '../models/ResearchCell.js';
import stringSimilarity from 'string-similarity';
import asyncHandler from 'express-async-handler';
import DefenseBoard from '../models/DefenseBoard.js';
import ThesisCycle from '../models/ThesisCycle.js';
import calculateGradeAndPoint from '../utils/gradeCalculator.js';
import Evaluation from '../models/Evaluation.js';
import PublishedResult from '../models/PublishedResult.js';

// @desc    Create a new proposal
// @route   POST /api/proposals
// @access  Private (Student)
const createProposal = asyncHandler(async (req, res) => {
  const { title, abstract, type, researchCellId, supervisorId, members, thesisCycleId, cohortId } = req.body;

  const createdBy = req.user._id;
  const department = req.user.department;

  // A student is always bound to their own cohort. Fall back to an explicitly
  // provided id (e.g. admin/committee created) or the active cohort.
  let resolvedCohortId: any = req.user.cohort || cohortId || thesisCycleId;
  if (!resolvedCohortId) {
    const activeCohort = await ThesisCycle.findOne({ status: 'Active', archived: false });
    if (activeCohort) resolvedCohortId = activeCohort._id;
  }

  if (!resolvedCohortId) {
    res.status(400);
    throw new Error('No cohort is available for this proposal. Please contact the committee.');
  }

  const cohort = await ThesisCycle.findById(resolvedCohortId);
  if (!cohort) {
    res.status(400);
    throw new Error('Selected cohort not found.');
  }

  // Enforce the cohort proposal-submission window
  if (!cohort.proposalSubmissionOpen) {
    res.status(403);
    throw new Error('Proposal submission for this cohort is closed. Please wait for the next submission period.');
  }
  if (cohort.proposalSubmissionDeadline && new Date() > new Date(cohort.proposalSubmissionDeadline)) {
    res.status(403);
    throw new Error('Proposal submission for this cohort has ended. Please wait for the next submission period.');
  }

  const supervisor = await User.findById(supervisorId);
  if (!supervisor) {
    res.status(404);
    throw new Error('Supervisor not found.');
  }

  const courseSupervisors = await User.find({ mainSupervisor: supervisor._id, isCourseSupervisor: true });
  const maxGroupCapacity = 5 + (courseSupervisors.length * 10);

  if (supervisor.currentGroupCount >= maxGroupCapacity) {
    res.status(400);
    throw new Error('Supervisor has reached their maximum group capacity.');
  }

  supervisor.currentGroupCount += 1;
  await supervisor.save();

  const existingProposals = await Proposal.find({ supervisorId });
  const newTitle = title.toLowerCase().replace(/[\s\p{P}]+/gu, "");

  for (const existingProposal of existingProposals) {
    const existingTitle = existingProposal.title.toLowerCase().replace(/[\s\p{P}]+/gu, "");
    const similarity = stringSimilarity.compareTwoStrings(newTitle, existingTitle);

    if (similarity > 0.8) {
      res.status(400);
      throw new Error('A similar project title already exists under this supervisor. Please modify your title and try again.');
    }
  }

  const researchCell = await ResearchCell.findById(researchCellId);
  if (!researchCell) {
    res.status(400);
    throw new Error('Research cell not found.');
  }

  // Cohort isolation: every invited member must belong to the same cohort
  const memberIds = (members || []).map((m: any) => (m && m._id ? m._id : m));
  if (memberIds.length > 0) {
    const memberUsers = await User.find({ _id: { $in: memberIds } });
    const foreign = memberUsers.find(
      (m) => m.cohort && m.cohort.toString() !== resolvedCohortId.toString()
    );
    if (foreign) {
      res.status(400);
      throw new Error('You can only invite students from your own cohort.');
    }
  }

  const proposal = await Proposal.create({
    title,
    abstract,
    type,
    researchCellId,
    supervisorId,
    members: [createdBy, ...memberIds],
    numberOfMembers: [createdBy, ...memberIds].length,
    createdBy,
    department,
    cohort: resolvedCohortId,
    status: 'Pending Committee',
  });

  res.status(201).json(proposal);
});

// @desc    Get proposals for the current supervisor
// @route   GET /api/proposals/supervisor-proposals
// @access  Private (Supervisor)
const getSupervisorProposals = asyncHandler(async (req, res) => {
  const { filter, cohortId } = req.query;
  const supervisorId = req.user._id;
  let query = {};

  if (filter === 'my_supervision') {
    query = { supervisorId: supervisorId, courseSupervisorId: null, status: 'Approved' };
  } else if (filter === 'my_supervision_with_course_supervision') {
    query = { supervisorId: supervisorId, courseSupervisorId: { $ne: null }, status: 'Approved' };
  } else if (filter === 'my_course_supervision') {
    query = { courseSupervisorId: supervisorId, status: 'Approved' };
  } else {
    query = {
      $or: [
        { supervisorId: supervisorId },
        { courseSupervisorId: supervisorId }
      ],
      status: { $nin: ['Pending Committee', 'Pending Supervisor', 'Not Approved'] }
    };
  }

  if (cohortId) query.cohort = cohortId;

  const proposals = await Proposal.find(query)
    .populate('createdBy', 'name email studentId currentCGPA')
    .populate('supervisorId', 'name email')
    .populate('researchCellId', 'title')
    .populate('cohort', 'name')
    .populate('members', 'name email studentId currentCGPA');

  res.json(proposals);
});

// @desc    Get pending proposals for the current supervisor
// @route   GET /api/proposals/supervisor-pending-proposals
// @access  Private (Supervisor)
const getSupervisorPendingProposals = asyncHandler(async (req, res) => {
  const { cohortId } = req.query;
  const pendingQuery: any = {
    supervisorId: req.user._id,
    status: { $in: ['Pending Committee', 'Pending Supervisor'] }
  };
  if (cohortId) pendingQuery.cohort = cohortId;
  const proposals = await Proposal.find(pendingQuery);
  await Proposal.populate(proposals, [
    { path: 'createdBy', select: 'name email studentId currentCGPA' },
    { path: 'supervisorId', select: 'name email' },
    { path: 'researchCellId', select: 'title' },
    { path: 'cohort', select: 'name' },
    { path: 'members', select: 'name email studentId currentCGPA' },
  ]);
  res.json(proposals);
});

// @desc    Get proposals for the current student (creator or member)
// @route   GET /api/proposals/student-proposals
// @access  Private (Student)
const getStudentProposals = asyncHandler(async (req, res) => {
  const { cohortId } = req.query;
  const studentId = req.user._id;
  const proposals = await Proposal.find({
    $or: [
      { createdBy: studentId },
      { members: studentId }
    ]
  })
    .populate('createdBy', 'name email studentId currentCGPA')
    .populate('supervisorId', 'name email')
    .populate('researchCellId', 'title')
    .populate('cohort', 'name')
    .populate('members', 'name email studentId currentCGPA')
  res.json(proposals);
});

// @desc    Get proposals for the current committee member's department
// @route   GET /api/proposals/committee-proposals
// @access  Private (Committee)
const getCommitteeProposals = asyncHandler(async (req, res) => {
  const { cohortId } = req.query;
  const committeeQuery: any = { department: req.user.department };
  if (cohortId) committeeQuery.cohort = cohortId;
  const proposals = await Proposal.find(committeeQuery)
    .populate('createdBy', 'name email studentId')
    .populate('supervisorId', 'name email')
    .populate('researchCellId', 'title')
    .populate('cohort', 'name');

  res.json(proposals);
});

// @desc    Update proposal status
// @route   PUT /api/proposals/:id/status
// @access  Private (Supervisor)
const updateProposalStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, feedback, acceptanceOption } = req.body;

  const proposal = await Proposal.findById(id);

  if (!proposal) {
    res.status(404);
    throw new Error('Proposal not found');
  }

  if (proposal.supervisorId.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized to update this proposal');
  }

  if (proposal.status !== 'Pending Supervisor') {
    res.status(400);
    throw new Error('Proposal is not in Pending Supervisor status.');
  }

  const supervisor = await User.findById(proposal.supervisorId);
  if (!supervisor) {
    res.status(404);
    throw new Error('Main supervisor not found.');
  }

  if (status === 'Approved') {
    if (acceptanceOption === 'supervisor_only') {
      proposal.courseSupervisorId = null;
    } else if (acceptanceOption === 'supervisor_and_course_supervisor') {
      const potentialCourseSupervisors = await User.find({
        role: 'supervisor',
        isCourseSupervisor: true,
        mainSupervisor: proposal.supervisorId,
      });

      let availableCourseSupervisor = null;
      if (potentialCourseSupervisors.length > 0) {
        availableCourseSupervisor = potentialCourseSupervisors[0];
      }

      if (!availableCourseSupervisor) {
        res.status(400);
        throw new Error('No course supervisor assigned to you yet. Please contact the committee.');
      }
      proposal.courseSupervisorId = availableCourseSupervisor._id;
    }
    proposal.status = 'Approved';
  } else if (status === 'Not Approved') {
    supervisor.currentGroupCount -= 1;
    await supervisor.save();
    proposal.status = 'Not Approved';
  }

  proposal.feedback = feedback;
  proposal.reviewedAt = new Date();

  const updatedProposal = await proposal.save();

  res.json(updatedProposal);
});

// @desc    Forward proposal to supervisor
// @route   PUT /api/proposals/:id/forward
// @access  Private (Committee)
const forwardProposalToSupervisor = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const proposal = await Proposal.findById(id);

  if (!proposal) {
    res.status(404);
    throw new Error('Proposal not found');
  }

  if (proposal.status !== 'Pending Committee') {
    res.status(400);
    throw new Error('Proposal is not in Pending Committee status.');
  }

  proposal.status = 'Pending Supervisor';
  proposal.reviewedAt = new Date();

  const updatedProposal = await proposal.save();
  res.json(updatedProposal);
});

// @desc    Reject proposal
// @route   PUT /api/proposals/:id/reject
// @access  Private (Committee)
const rejectProposal = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { feedback } = req.body;

  const proposal = await Proposal.findById(id);

  if (!proposal) {
    res.status(404);
    throw new Error('Proposal not found');
  }

  if (proposal.status !== 'Pending Committee') {
    res.status(400);
    throw new Error('Proposal is not in Pending Committee status.');
  }

  const supervisor = await User.findById(proposal.supervisorId);
  if (supervisor) {
    supervisor.currentGroupCount -= 1;
    await supervisor.save();
  }

  proposal.status = 'Not Approved';
  proposal.feedback = feedback;
  proposal.reviewedAt = new Date();

  const updatedProposal = await proposal.save();
  res.json(updatedProposal);
});

// @desc    Get pending proposals grouped by research cell
// @route   GET /api/proposals/pending-by-cell
// @access  Private (Committee)
const getPendingProposalsByCell = asyncHandler(async (req, res) => {
  const { cohortId } = req.query;
  const matchStage: any = { status: 'Pending Committee' };
  if (cohortId) matchStage.cohort = new mongoose.Types.ObjectId(cohortId);
  const proposals = await Proposal.aggregate([
    { $match: matchStage },
    {
      $lookup: {
        from: 'users',
        localField: 'createdBy',
        foreignField: '_id',
        as: 'createdBy',
      },
    },
    { $unwind: '$createdBy' },
    {
      $lookup: {
        from: 'users',
        localField: 'members',
        foreignField: '_id',
        as: 'members',
      },
    },
    {
      $group: {
        _id: '$researchCellId',
        proposals: { $push: '$$ROOT' },
        count: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: 'researchcells',
        localField: '_id',
        foreignField: '_id',
        as: 'researchCell',
      },
    },
    { $unwind: '$researchCell' },
    {
      $project: {
        _id: 0,
        researchCell: '$researchCell',
        proposals: {
          $map: {
            input: '$proposals',
            as: 'proposal',
            in: {
              _id: '$$proposal._id',
              title: '$$proposal.title',
              abstract: '$$proposal.abstract',
              type: '$$proposal.type',
              researchCellId: '$$proposal.researchCellId',
              supervisorId: '$$proposal.supervisorId',
              cohort: '$$proposal.cohort',
              status: '$$proposal.status',
          feedback: '$$proposal.feedback',
          reviewedAt: '$$proposal.reviewedAt',
          department: '$$proposal.department',
          createdAt: '$$proposal.createdAt',
          updatedAt: '$$proposal.updatedAt',
          createdBy: {
            _id: '$$proposal.createdBy._id',
            name: '$$proposal.createdBy.name',
            studentId: '$$proposal.createdBy.studentId',
            currentCGPA: '$$proposal.createdBy.currentCGPA',
          },
          cohort: '$$proposal.cohort',
          members: {
            $map: {
              input: '$$proposal.members',
              as: 'member',
              in: {
                _id: '$$member._id',
                name: '$$member.name',
                studentId: '$$member.studentId',
                currentCGPA: '$$member.currentCGPA',
              },
            },
          },
            },
          },
        },
        count: '$count',
      },
    },
  ]);

  res.json(proposals);
});

// @desc    Get all approved proposals with detailed information
// @route   GET /api/proposals/approved-proposals
// @access  Private (Committee)
const getApprovedProposals = asyncHandler(async (req, res) => {
  const { cohortId } = req.query;
  const approvedQuery: any = { status: 'Approved' };
  if (cohortId) approvedQuery.cohort = cohortId;
  const proposals = await Proposal.find(approvedQuery)
    .populate('createdBy', 'name studentId currentCGPA')
    .populate('supervisorId', 'name')
    .populate('researchCellId', 'title')
    .populate('cohort', 'name')
    .populate('members', 'name studentId currentCGPA');

  res.json(proposals);
});

// @desc    Get all approved proposals that are available for a new defense board of a specific type
// @route   GET /api/proposals/available-proposals
// @access  Private (Committee)
const getAvailableProposals = asyncHandler(async (req, res) => {
  const { defenseType, cohortId } = req.query; // 'Pre-Defense' or 'Final Defense'

  let assignedProposalsInDefenseBoards = [];

  if (defenseType === 'Final Defense') {
    const finalDefenseBoards = await DefenseBoard.find({ defenseType: 'Final Defense' }, 'groups');
    assignedProposalsInDefenseBoards = finalDefenseBoards.flatMap(board => board.groups);
  } else {
    const allDefenseBoards = await DefenseBoard.find({}, 'groups');
    assignedProposalsInDefenseBoards = allDefenseBoards.flatMap(board => board.groups);
  }

  const availableQuery: any = {
    status: 'Approved',
    _id: { $nin: assignedProposalsInDefenseBoards }
  };
  if (cohortId) availableQuery.cohort = cohortId;

  const proposals = await Proposal.find(availableQuery)
    .populate('createdBy', 'name studentId currentCGPA')
    .populate('supervisorId', 'name')
    .populate('courseSupervisorId', 'name')
    .populate('researchCellId', 'title')
    .populate('members', 'name studentId currentCGPA');

  res.json(proposals);
});

// @desc    Get all groups for the current supervisor (main or course supervisor)
// @route   GET /api/proposals/supervisor-all-groups
// @access  Private (Supervisor)
const getSupervisorAllGroups = asyncHandler(async (req, res) => {
  const supervisorId = req.user._id;
  const { cohortId } = req.query;

  const groupsQuery: any = {
    $or: [
      { supervisorId: supervisorId },
      { courseSupervisorId: supervisorId }
    ],
    status: 'Approved'
  };
  if (cohortId) groupsQuery.cohort = cohortId;

  const proposals = await Proposal.find(groupsQuery)
    .populate('createdBy', 'name studentId currentCGPA')
    .populate('supervisorId', 'name')
    .populate('courseSupervisorId', 'name')
    .populate('researchCellId', 'title')
    .populate('members', 'name studentId currentCGPA');

  const underMySupervisionOnly = [];
  const underMySupervisionAndCourseSupervision = [];
  const underMyCourseSupervision = [];

  proposals.forEach(proposal => {
    if (proposal.supervisorId._id.toString() === supervisorId.toString() && !proposal.courseSupervisorId) {
      underMySupervisionOnly.push(proposal);
    } else if (proposal.supervisorId._id.toString() === supervisorId.toString() && proposal.courseSupervisorId) {
      underMySupervisionAndCourseSupervision.push(proposal);
    } else if (proposal.courseSupervisorId && proposal.courseSupervisorId._id.toString() === supervisorId.toString()) {
      underMyCourseSupervision.push(proposal);
    }
  });

  res.json({
    underMySupervisionOnly,
    underMySupervisionAndCourseSupervision,
    underMyCourseSupervision
  });
});

const getMySupervisions = asyncHandler(async (req, res) => {
  const supervisorId = req.user._id;
  const { thesisCycleId } = req.query;

  const supervisionsQuery: any = {
    $or: [
      { supervisorId: supervisorId },
      { coSupervisors: supervisorId }
    ],
    status: 'Approved'
  };
  if (thesisCycleId) supervisionsQuery.cohort = thesisCycleId;

  const proposals = await Proposal.find(supervisionsQuery)
  .populate('members', 'name email');

  res.json(proposals);
});

// @desc    Get single proposal by ID
// @route   GET /api/proposals/:id
// @access  Private/Committee, Supervisor, Student
const getProposalById = asyncHandler(async (req, res) => {
  const proposal = await Proposal.findById(req.params.id)
    .populate('members', 'name email studentId')
    .populate('supervisorId', 'name email')
    .populate('coSupervisors', 'name email')
    .populate('cohort', 'name');

  if (proposal) {
    console.log(`[getProposalById] Fetched proposal ID: ${proposal._id}`);
    console.log(`[getProposalById] Proposal supervisorId: ${proposal.supervisorId?._id}`);
    console.log(`[getProposalById] Proposal coSupervisors: ${proposal.coSupervisors?.map(s => s._id)}`);
    res.json(proposal);
  } else {
    console.log(`[getProposalById] Proposal not found for ID: ${req.params.id}`);
    res.status(404);
    throw new Error('Proposal not found');
  }
});

// @desc    Publish result for a proposal
// @route   PUT /api/proposals/:id/publish
// @access  Private (Committee)
const publishResult = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const proposal = await Proposal.findById(id).populate('members');

  if (!proposal) {
    res.status(404);
    throw new Error('Proposal not found');
  }

  if (proposal.published) {
    res.status(400);
    throw new Error('Result already published');
  }

  const { members } = proposal;
  const studentResults = [];

  for (const member of members) {
    const evaluations = await Evaluation.find({
      proposal: id,
      student: member._id,
    });

    const preDefenseSupervisor = evaluations.find(e => e.defenseType === 'pre-defense' && e.evaluationType === 'supervisor');
    const preDefenseCommittee = evaluations.filter(e => e.defenseType === 'pre-defense' && e.evaluationType === 'committee');
    const finalDefenseSupervisor = evaluations.find(e => e.defenseType === 'final-defense' && e.evaluationType === 'supervisor');
    const finalDefenseCommittee = evaluations.filter(e => e.defenseType === 'final-defense' && e.evaluationType === 'committee');

    if (!preDefenseSupervisor || preDefenseCommittee.length === 0 || !finalDefenseSupervisor || finalDefenseCommittee.length === 0) {
      res.status(400);
      throw new Error(`Marks for all defense types are not submitted for student ${member.name}`);
    }

    const preDefenseCommitteeAvg = preDefenseCommittee.reduce((acc, e) => acc + e.marks, 0) / preDefenseCommittee.length;
    const finalDefenseCommitteeAvg = finalDefenseCommittee.reduce((acc, e) => acc + e.marks, 0) / finalDefenseCommittee.length;

    const totalMarks =
      preDefenseSupervisor.marks +
      preDefenseCommitteeAvg +
      finalDefenseSupervisor.marks +
      finalDefenseCommitteeAvg;

    const { grade, point } = calculateGradeAndPoint(totalMarks);

    studentResults.push({
      studentId: member._id,
      totalMarks,
      grade,
      point,
    });
  }

  if (studentResults.length > 0) {
    proposal.published = true;
    proposal.grade = studentResults[0].grade;
    proposal.point = studentResults[0].point;
    await proposal.save();

    for (const result of studentResults) {
      await PublishedResult.findOneAndUpdate(
        { student: result.studentId },
        {
          student: result.studentId,
          proposal: id,
          cohort: proposal.cohort || null,
          grade: result.grade,
          point: result.point,
          courseCode: '',
          courseTitle: '',
        },
        { upsert: true }
      );
    }
  }

  res.status(200).json(proposal);
});

export { createProposal, getSupervisorProposals, getSupervisorPendingProposals, getStudentProposals, getCommitteeProposals, updateProposalStatus, getPendingProposalsByCell, forwardProposalToSupervisor, rejectProposal, getApprovedProposals, getAvailableProposals, getSupervisorAllGroups, getMySupervisions, publishResult, getProposalById };