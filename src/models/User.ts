import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: function() { return this.role !== 'student'; } 
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['student', 'supervisor', 'committee', 'admin'],
    default: 'student',
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
  },
  cohort: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cohort',
    default: null,
  },
  studentId: {
    type: String,
    sparse: true, // Allow multiple docs with null/undefined studentId (set later at profile completion)
  },
  profilePicture: {
    type: String,
    default: '',
  },
  researchCells: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ResearchCell',
    default: [],
  }],
  currentCGPA: {
    type: Number,
  },
  maxGroupCapacity: {
    type: Number,
    default: 5,
    required: function() { return this.role === 'supervisor'; },
  },
  currentGroupCount: {
    type: Number,
    default: 0,
    required: function() { return this.role === 'supervisor'; },
  },
  isCourseSupervisor: {
    type: Boolean,
    default: false,
  },
  mainSupervisor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function() { return this.isCourseSupervisor; },
  },
  // Supervisor Profile Fields
  designation: {
    type: String,
    required: function() { return this.role === 'supervisor' || this.role === 'committee'; },
  },
  education: {
    type: String,
    default: '',
  },
  experience: {
    type: String,
    default: '',
  },
  research: {
    type: String,
    default: '',
  },
}, { timestamps: true });

// Hash password before saving
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Method to compare passwords
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Enforce studentId uniqueness only for students who actually have one set.
// (Sparse + partial index so the many null/undefined values don't collide.)
UserSchema.index(
  { studentId: 1 },
  {
    unique: true,
    name: 'studentId_1',
    partialFilterExpression: { role: 'student', studentId: { $exists: true, $ne: null } },
  }
);

export default mongoose.model('User', UserSchema);