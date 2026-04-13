import User from '../models/User.js';
import Department from '../models/Department.js';
import ResearchCell from '../models/ResearchCell.js';
import Notice from '../models/Notice.js';
import Proposal from '../models/Proposal.js';
import asyncHandler from 'express-async-handler';

// @desc    Get all departments
// @route   GET /api/public/departments
// @access  Public
export const getPublicDepartments = asyncHandler(async (req, res) => {
    const departments = await Department.find({ name: { $ne: 'Administration' } }).sort({ name: 1 });
    res.json(departments);
});

// @desc    Get all research cells
// @route   GET /api/public/research-cells
// @access  Public
export const getPublicResearchCells = asyncHandler(async (req, res) => {
    const cells = await ResearchCell.find({}).sort({ title: 1 });
    res.json(cells);
});

// @desc    Get faculty by department
// @route   GET /api/public/faculty/:departmentId
// @access  Public
export const getFacultyByDepartment = asyncHandler(async (req, res) => {
    const { departmentId } = req.params;
    const faculty = await User.find({ 
        role: { $in: ['supervisor', 'committee'] }, 
        department: departmentId 
    })
    .select('-password')
    .populate('researchCells', 'title')
    .sort({ name: 1 });
    res.json(faculty);
});

// @desc    Get faculty profile by ID
// @route   GET /api/public/faculty/profile/:id
// @access  Public
export const getPublicFacultyProfile = asyncHandler(async (req, res) => {
    const faculty = await User.findById(req.params.id)
        .select('-password')
        .populate('department', 'name')
        .populate('researchCells', 'title');
    
    if (faculty && (faculty.role === 'supervisor' || faculty.role === 'committee')) {
        res.json(faculty);
    } else {
        res.status(404);
        throw new Error('Faculty member not found');
    }
});

// @desc    Get public notices (Committee only)
// @route   GET /api/public/notices
// @access  Public
export const getPublicNotices = asyncHandler(async (req, res) => {
    // Fetch notices and populate sender info to check role
    const notices = await Notice.find({})
        .populate('sender', 'name role')
        .sort({ createdAt: -1 });

    // Filter only committee notices
    const committeeNotices = notices.filter((n: any) => n.sender && n.sender.role === 'committee');
    
    // Return latest 10
    res.json(committeeNotices.slice(0, 10));
});

// @desc    Get public system statistics
// @route   GET /api/public/stats
// @access  Public
export const getPublicStats = asyncHandler(async (req, res) => {
    const studentCount = await User.countDocuments({ role: 'student' });
    const supervisorCount = await User.countDocuments({ role: { $in: ['supervisor', 'committee'] } });
    const deptCount = await Department.countDocuments({});
    const proposalCount = await Proposal.countDocuments({});

    res.json({
        studentCount,
        supervisorCount,
        deptCount,
        proposalCount
    });
});
