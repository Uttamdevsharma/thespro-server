import mongoose from 'mongoose';

const CohortSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Cohort name is required'],
    unique: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  academicYear: {
    type: String,
    trim: true,
  },
  semester: {
    type: String,
    trim: true,
  },
  startSemester: {
    type: String,
    trim: true,
  },
  endSemester: {
    type: String,
    trim: true,
  },
  registrationStartDate: {
    type: Date,
    required: [true, 'Registration start date is required'],
  },
  registrationEndDate: {
    type: Date,
    required: [true, 'Registration end date is required'],
  },
  status: {
    type: String,
    enum: {
      values: ['Upcoming', 'Active', 'Closed', 'Archived'],
      message: '{VALUE} is not a valid cohort status',
    },
    default: 'Upcoming',
  },
  proposalSubmissionOpen: {
    type: Boolean,
    default: false,
  },
  proposalSubmissionDeadline: {
    type: Date,
  },
  defensePhase: {
    type: String,
    enum: {
      values: ['Pre-Defense', 'Final Defense', null],
      message: '{VALUE} is not a valid defense phase',
    },
    default: null,
  },
  archived: {
    type: Boolean,
    default: false,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
}, { timestamps: true });

export default mongoose.model('Cohort', CohortSchema);
