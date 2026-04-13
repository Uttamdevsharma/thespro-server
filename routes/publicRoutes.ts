import express from 'express';
import { 
    getPublicDepartments, 
    getFacultyByDepartment, 
    getPublicFacultyProfile,
    getPublicResearchCells
} from '../controllers/publicController.js';

const router = express.Router();

router.get('/departments', getPublicDepartments);
router.get('/research-cells', getPublicResearchCells);
router.get('/faculty/:departmentId', getFacultyByDepartment);
router.get('/faculty/profile/:id', getPublicFacultyProfile);

export default router;
