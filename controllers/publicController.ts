import User from '../models/User.js';
import Department from '../models/Department.js';
import ResearchCell from '../models/ResearchCell.js';
import asyncHandler from 'express-async-handler';

// @desc    Get all departments
// @route   GET /api/public/departments
// @access  Public
export const getPublicDepartments = asyncHandler(async (req, res) => {
    const departments = await Department.find({}).sort({ name: 1 });
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
