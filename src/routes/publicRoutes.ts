import express from 'express';
import { 
    getPublicDepartments, 
    getFacultyByDepartment, 
    getPublicFacultyProfile,
    getPublicResearchCells,
    getPublicNotices,
    getPublicStats,
    getPublicNoticeById,
} from '../controllers/publicController.js';

const router = express.Router();

router.get('/departments', getPublicDepartments);
router.get('/research-cells', getPublicResearchCells);
router.get('/notices', getPublicNotices);
router.get('/notices/:id', getPublicNoticeById);
router.get('/stats', getPublicStats);
router.get('/faculty/:departmentId', getFacultyByDepartment);
router.get('/faculty/profile/:id', getPublicFacultyProfile);

export default router;
