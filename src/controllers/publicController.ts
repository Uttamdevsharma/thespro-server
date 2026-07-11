import User from '../models/User.js';
import Department from '../models/Department.js';
import ResearchCell from '../models/ResearchCell.js';
import Notice from '../models/Notice.js';
import Proposal from '../models/Proposal.js';
import asyncHandler from 'express-async-handler';

function generateAbbreviation(name) {
    const words = name
        .replace(/[&]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 0 && !['and', 'of', 'the', 'in', 'for'].includes(w.toLowerCase().replace(/[^a-z]/g, '')));
    if (words.length === 0) return name;
    if (words.length === 1) return words[0];
    if (words.length >= 3) {
        return words.map((w) => w[0].toUpperCase()).join('');
    }
    const second = words[1].toLowerCase();
    if (['engineering', 'department', 'administration'].includes(second)) {
        if (words[0].toLowerCase() === 'business') return 'BBA';
        return words[0];
    }
    return words.map((w) => w[0].toUpperCase()).join('');
}

// @desc    Get all departments
// @route   GET /api/public/departments
// @access  Public
export const getPublicDepartments = asyncHandler(async (req, res) => {
    const departments = await Department.find({ name: { $ne: 'Administration' } }).sort({ name: 1 });
    const departmentsWithMeta = await Promise.all(
        departments.map(async (dept) => {
            const supervisorCount = await User.countDocuments({
                role: 'supervisor',
                department: dept._id,
            });
            return {
                _id: dept._id,
                name: dept.name,
                abbreviation: dept.abbreviation || generateAbbreviation(dept.name),
                supervisorCount,
            };
        })
    );
    res.json(departmentsWithMeta);
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
        role: 'supervisor', 
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
        .populate('department', 'name abbreviation')
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
    const { limit } = req.query;
    const notices = await Notice.find({})
        .populate('sender', 'name role')
        .sort({ createdAt: -1 });

    const committeeNotices = notices.filter((n: any) => n.sender && n.sender.role === 'committee');
    
    if (limit) {
        return res.json(committeeNotices.slice(0, Number(limit)));
    }
    res.json(committeeNotices);
});

// @desc    Get public notice by ID (Committee notices only)
// @route   GET /api/public/notices/:id
// @access  Public
export const getPublicNoticeById = asyncHandler(async (req, res) => {
    const notice = await Notice.findById(req.params.id)
        .populate('sender', 'name role');

    if (!notice || !notice.sender || notice.sender.role !== 'committee') {
        res.status(404);
        throw new Error('Notice not found');
    }

    res.json(notice);
});

// @desc    Get public system statistics
// @route   GET /api/public/stats
// @access  Public
export const getPublicStats = asyncHandler(async (req, res) => {
    const studentCount = await User.countDocuments({ role: 'student' });
    const supervisorCount = await User.countDocuments({ role: 'supervisor' });
    const deptCount = await Department.countDocuments({});
    const proposalCount = await Proposal.countDocuments({});

    res.json({
        studentCount,
        supervisorCount,
        deptCount,
        proposalCount
    });
});
