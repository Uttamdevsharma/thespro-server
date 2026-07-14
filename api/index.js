// src/app.ts
import "dotenv/config";
import express18 from "express";
import mongoose15 from "mongoose";
import cors from "cors";

// src/routes/authRoutes.ts
import express from "express";

// src/models/User.ts
import mongoose2 from "mongoose";
import bcrypt from "bcryptjs";
var UserSchema = new mongoose2.Schema({
  name: {
    type: String,
    required: function() {
      return this.role !== "student";
    }
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ["student", "supervisor", "committee", "admin"],
    default: "student"
  },
  department: {
    type: mongoose2.Schema.Types.ObjectId,
    ref: "Department"
  },
  cohort: {
    type: mongoose2.Schema.Types.ObjectId,
    ref: "Cohort",
    default: null
  },
  studentId: {
    type: String,
    sparse: true
    // Allow multiple docs with null/undefined studentId (set later at profile completion)
  },
  profilePicture: {
    type: String,
    default: ""
  },
  researchCells: [{
    type: mongoose2.Schema.Types.ObjectId,
    ref: "ResearchCell",
    default: []
  }],
  currentCGPA: {
    type: Number
  },
  maxGroupCapacity: {
    type: Number,
    default: 5,
    required: function() {
      return this.role === "supervisor";
    }
  },
  currentGroupCount: {
    type: Number,
    default: 0,
    required: function() {
      return this.role === "supervisor";
    }
  },
  isCourseSupervisor: {
    type: Boolean,
    default: false
  },
  mainSupervisor: {
    type: mongoose2.Schema.Types.ObjectId,
    ref: "User",
    required: function() {
      return this.isCourseSupervisor;
    }
  },
  // Supervisor Profile Fields
  designation: {
    type: String,
    required: function() {
      return this.role === "supervisor" || this.role === "committee";
    }
  },
  education: {
    type: String,
    default: ""
  },
  experience: {
    type: String,
    default: ""
  },
  research: {
    type: String,
    default: ""
  }
}, { timestamps: true });
UserSchema.pre("save", async function(next) {
  if (!this.isModified("password")) {
    next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});
UserSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};
UserSchema.index(
  { studentId: 1 },
  {
    unique: true,
    name: "studentId_1",
    partialFilterExpression: { role: "student", studentId: { $exists: true, $ne: null } }
  }
);
var User_default = mongoose2.model("User", UserSchema);

// src/models/ThesisCycle.ts
import mongoose3 from "mongoose";
var CohortSchema = new mongoose3.Schema({
  name: {
    type: String,
    required: [true, "Cohort name is required"],
    unique: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  academicYear: {
    type: String,
    trim: true
  },
  semester: {
    type: String,
    trim: true
  },
  startSemester: {
    type: String,
    trim: true
  },
  endSemester: {
    type: String,
    trim: true
  },
  registrationStartDate: {
    type: Date,
    required: [true, "Registration start date is required"]
  },
  registrationEndDate: {
    type: Date,
    required: [true, "Registration end date is required"]
  },
  status: {
    type: String,
    enum: {
      values: ["Upcoming", "Active", "Closed", "Archived"],
      message: "{VALUE} is not a valid cohort status"
    },
    default: "Upcoming"
  },
  proposalSubmissionOpen: {
    type: Boolean,
    default: false
  },
  proposalSubmissionDeadline: {
    type: Date
  },
  defensePhase: {
    type: String,
    enum: {
      values: ["Pre-Defense", "Final Defense", null],
      message: "{VALUE} is not a valid defense phase"
    },
    default: null
  },
  archived: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: mongoose3.Schema.Types.ObjectId,
    ref: "User",
    required: true
  }
}, { timestamps: true });
var ThesisCycle_default = mongoose3.model("Cohort", CohortSchema);

// src/utils/generateToken.ts
import jwt from "jsonwebtoken";
var generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "1h"
  });
};
var generateToken_default = generateToken;

// src/controllers/authController.ts
import asyncHandler from "express-async-handler";
import { OAuth2Client } from "google-auth-library";
var isRegistrationOpen = (cycle) => {
  if (!cycle || cycle.archived) return false;
  if (cycle.status === "Closed") return false;
  if (cycle.proposalSubmissionOpen === true) return true;
  const now = /* @__PURE__ */ new Date();
  const start = cycle.registrationStartDate ? new Date(cycle.registrationStartDate) : null;
  const end = cycle.registrationEndDate ? new Date(cycle.registrationEndDate) : null;
  if (start || end) {
    if (start && now < start) return false;
    if (end && now > end) return false;
    return true;
  }
  return cycle.status === "Active";
};
var resolveRegistrationCohort = async (cohortId) => {
  if (cohortId) {
    const cohort = await ThesisCycle_default.findById(cohortId);
    if (!cohort || cohort.archived || !isRegistrationOpen(cohort)) {
      const err2 = new Error("The selected cohort is not open for registration.");
      err2.status = 400;
      throw err2;
    }
    return cohort._id;
  }
  const openCohorts = (await ThesisCycle_default.find({ archived: false })).filter((c) => isRegistrationOpen(c));
  if (openCohorts.length === 0) {
    const err2 = new Error("Registration for the current cohort has ended. Please wait for the next registration period.");
    err2.status = 403;
    throw err2;
  }
  if (openCohorts.length === 1) {
    return openCohorts[0]._id;
  }
  const err = new Error("Multiple cohorts are open for registration. Please select one.");
  err.status = 400;
  throw err;
};
var registerUser = asyncHandler(async (req, res) => {
  const { name, email, password, cohortId } = req.body;
  const userExists = await User_default.findOne({ email });
  if (userExists) {
    res.status(400);
    throw new Error("User already exists");
  }
  let assignedCohort;
  try {
    assignedCohort = await resolveRegistrationCohort(cohortId);
  } catch (err) {
    res.status(err.status || 400);
    throw new Error(err.message);
  }
  const user = await User_default.create({
    name,
    email,
    password,
    role: "student",
    // Default role for public registration
    cohort: assignedCohort
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
      token: generateToken_default(user._id)
    });
  } else {
    res.status(400);
    throw new Error("Invalid user data");
  }
});
var loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  console.log("Login attempt for email:", email);
  const user = await User_default.findOne({ email }).populate("department", "name");
  console.log("User found:", user);
  if (user && await user.matchPassword(password)) {
    console.log("Password matched for user:", user.email);
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
      token: generateToken_default(user._id),
      currentGroupCount: user.currentGroupCount
    });
  } else {
    console.log("Invalid email or password for email:", email);
    res.status(401);
    throw new Error("Invalid email or password");
  }
});
var client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_CALLBACK_URL
);
var googleAuth = asyncHandler(async (req, res) => {
  const cohortId = req.query.cohortId;
  const state = cohortId ? Buffer.from(JSON.stringify({ cohortId })).toString("base64") : void 0;
  const url = client.generateAuthUrl({
    access_type: "offline",
    scope: ["profile", "email"],
    prompt: "consent",
    ...state ? { state } : {}
  });
  res.redirect(url);
});
var googleCallback = asyncHandler(async (req, res) => {
  const { code, state } = req.query;
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` }
  });
  const googleUser = await userInfoRes.json();
  if (!googleUser.email) {
    res.status(400);
    throw new Error("Google account must have an email");
  }
  let user = await User_default.findOne({ email: googleUser.email });
  let requestedCohortId;
  if (state) {
    try {
      requestedCohortId = JSON.parse(Buffer.from(state, "base64").toString()).cohortId;
    } catch {
      requestedCohortId = void 0;
    }
  }
  let assignedCohort = user?.cohort || null;
  if (!assignedCohort && requestedCohortId) {
    const cohort = await ThesisCycle_default.findById(requestedCohortId);
    if (cohort && !cohort.archived && isRegistrationOpen(cohort)) {
      assignedCohort = cohort._id;
    }
  }
  if (!assignedCohort) {
    const openCohorts = (await ThesisCycle_default.find({ archived: false })).filter((c) => isRegistrationOpen(c));
    if (openCohorts.length === 1) assignedCohort = openCohorts[0]._id;
  }
  if (!user) {
    user = await User_default.create({
      name: googleUser.name,
      email: googleUser.email,
      password: Math.random().toString(36).slice(-16),
      // Dummy password for Google users
      role: "student",
      // Default role for Google login
      profilePicture: googleUser.picture,
      cohort: assignedCohort
    });
  } else if (!user.cohort && assignedCohort) {
    user.cohort = assignedCohort;
    await user.save();
  }
  const token = generateToken_default(user._id);
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
  const encodedUser = Buffer.from(JSON.stringify(userData)).toString("base64");
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  res.redirect(`${frontendUrl}/google-success?data=${encodedUser}`);
});

// src/routes/authRoutes.ts
var router = express.Router();
router.post("/register", registerUser);
router.post("/login", loginUser);
router.get("/google", googleAuth);
router.get("/callback/google", googleCallback);
var authRoutes_default = router;

// src/routes/researchCellRoutes.ts
import express2 from "express";

// src/models/ResearchCell.ts
import mongoose4 from "mongoose";
var ResearchCellSchema = new mongoose4.Schema({
  title: {
    type: String,
    required: true,
    unique: true
  },
  description: {
    type: String,
    required: true
  },
  department: {
    type: String,
    required: true
  }
}, { timestamps: true });
var ResearchCell_default = mongoose4.model("ResearchCell", ResearchCellSchema);

// src/controllers/researchCellController.ts
import asyncHandler2 from "express-async-handler";
var getResearchCells = asyncHandler2(async (req, res) => {
  const researchCells = await ResearchCell_default.find({ department: req.user.department });
  res.json(researchCells);
});
var addResearchCell = asyncHandler2(async (req, res) => {
  const { title, description } = req.body;
  const department = req.user.department;
  const cellExists = await ResearchCell_default.findOne({ title, department });
  if (cellExists) {
    res.status(400);
    throw new Error("Research cell with this title already exists in your department");
  }
  const researchCell = await ResearchCell_default.create({
    title,
    description,
    department
  });
  res.status(201).json(researchCell);
});

// src/middleware/authMiddleware.ts
import jwt2 from "jsonwebtoken";
var protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt2.verify(token, process.env.JWT_SECRET);
      req.user = await User_default.findById(decoded.id).select("-password");
      if (!req.user) {
        console.error("User not found for token id:", decoded.id);
        return res.status(401).json({ message: "Not authorized, user not found" });
      }
      console.log("User populated in protect middleware:", req.user.email);
      next();
    } catch (error) {
      console.error("JWT Verification Error:", error.message);
      if (error.name === "TokenExpiredError") {
        return res.status(401).json({ message: "Not authorized, token expired" });
      }
      res.status(401).json({ message: "Not authorized, token failed", detail: error.message });
    }
  }
  if (!token) {
    res.status(401).json({ message: "Not authorized, no token" });
  }
};
var authorizeRoles = (...roles) => {
  return (req, res, next) => {
    console.log("Authorizing roles. User role:", req.user.role, "Required roles:", roles);
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: `User role ${req.user.role} is not authorized to access this route` });
    }
    next();
  };
};
var committee = authorizeRoles("committee");

// src/routes/researchCellRoutes.ts
var router2 = express2.Router();
router2.route("/").get(protect, authorizeRoles("committee", "supervisor", "student"), getResearchCells).post(protect, authorizeRoles("committee"), addResearchCell);
var researchCellRoutes_default = router2;

// src/routes/proposalRoutes.ts
import express3 from "express";

// src/models/Proposal.ts
import mongoose5 from "mongoose";
var ProposalSchema = new mongoose5.Schema({
  title: {
    type: String,
    required: true
  },
  abstract: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ["Thesis", "Project"],
    default: "Thesis"
  },
  researchCellId: {
    type: mongoose5.Schema.Types.ObjectId,
    ref: "ResearchCell",
    required: true
  },
  supervisorId: {
    type: mongoose5.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  coSupervisors: [
    {
      type: mongoose5.Schema.Types.ObjectId,
      ref: "User"
    }
  ],
  courseSupervisorId: {
    type: mongoose5.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  members: [
    {
      type: mongoose5.Schema.Types.ObjectId,
      ref: "User"
    }
  ],
  numberOfMembers: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ["Pending Committee", "Pending Supervisor", "Approved", "Not Approved"],
    default: "Pending Committee"
  },
  feedback: {
    type: String,
    default: ""
  },
  reviewedAt: {
    type: Date
  },
  createdBy: {
    type: mongoose5.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  department: {
    type: String,
    required: true
  },
  cohort: {
    type: mongoose5.Schema.Types.ObjectId,
    ref: "Cohort",
    default: null
  },
  defenseBoardId: {
    type: mongoose5.Schema.Types.ObjectId,
    ref: "DefenseBoard",
    default: null
  },
  published: {
    type: Boolean,
    default: false
  },
  grade: {
    type: String,
    default: null
  },
  point: {
    type: Number,
    default: null
  }
}, { timestamps: true });
var Proposal_default = mongoose5.model("Proposal", ProposalSchema);

// src/controllers/proposalController.ts
import stringSimilarity from "string-similarity";
import asyncHandler3 from "express-async-handler";

// src/models/DefenseBoard.ts
import mongoose6 from "mongoose";
var DefenseBoardSchema = new mongoose6.Schema(
  {
    boardNumber: {
      type: String,
      required: true
    },
    defenseType: {
      type: String,
      required: true,
      enum: ["Pre-Defense", "Final Defense"]
    },
    room: {
      type: mongoose6.Schema.Types.ObjectId,
      ref: "Room",
      required: true
    },
    schedule: {
      type: mongoose6.Schema.Types.ObjectId,
      ref: "ScheduleSlot",
      required: true
    },
    date: {
      type: Date,
      required: true
    },
    groups: [
      {
        type: mongoose6.Schema.Types.ObjectId,
        ref: "Proposal",
        required: true
      }
    ],
    cohort: {
      type: mongoose6.Schema.Types.ObjectId,
      ref: "Cohort",
      default: null
    },
    comments: [
      {
        group: {
          type: mongoose6.Schema.Types.ObjectId,
          ref: "Proposal"
        },
        text: {
          type: String
        },
        commentedBy: {
          type: mongoose6.Schema.Types.ObjectId,
          ref: "User"
        }
      }
    ],
    boardMembers: [
      {
        type: mongoose6.Schema.Types.ObjectId,
        ref: "User",
        required: true
      }
    ],
    createdBy: {
      type: mongoose6.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    logs: [
      {
        action: {
          type: String
          // e.g., 'CREATED', 'UPDATED', 'DELETED'
        },
        user: {
          type: mongoose6.Schema.Types.ObjectId,
          ref: "User"
        },
        timestamp: {
          type: Date,
          default: Date.now
        }
      }
    ]
  },
  { timestamps: true }
);
var DefenseBoard = mongoose6.model("DefenseBoard", DefenseBoardSchema);
var DefenseBoard_default = DefenseBoard;

// src/utils/gradeCalculator.ts
var calculateGradeAndPoint = (totalMarks) => {
  if (totalMarks >= 80 && totalMarks <= 100) {
    return { grade: "A+", point: 4 };
  } else if (totalMarks >= 75 && totalMarks <= 79) {
    return { grade: "A", point: 3.75 };
  } else if (totalMarks >= 70 && totalMarks <= 74) {
    return { grade: "A-", point: 3.5 };
  } else if (totalMarks >= 65 && totalMarks <= 69) {
    return { grade: "B+", point: 3.25 };
  } else if (totalMarks >= 60 && totalMarks <= 64) {
    return { grade: "B", point: 3 };
  } else if (totalMarks >= 55 && totalMarks <= 59) {
    return { grade: "B-", point: 2.75 };
  } else if (totalMarks >= 50 && totalMarks <= 54) {
    return { grade: "C+", point: 2.5 };
  } else if (totalMarks >= 45 && totalMarks <= 49) {
    return { grade: "C", point: 2.25 };
  } else if (totalMarks >= 40 && totalMarks <= 44) {
    return { grade: "C-", point: 2 };
  } else {
    return { grade: "F", point: 0 };
  }
};
var gradeCalculator_default = calculateGradeAndPoint;

// src/models/Evaluation.ts
import mongoose7 from "mongoose";
var evaluationSchema = new mongoose7.Schema({
  student: {
    type: mongoose7.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  evaluator: {
    type: mongoose7.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  proposal: {
    type: mongoose7.Schema.Types.ObjectId,
    ref: "Proposal",
    required: true
  },
  cohort: {
    type: mongoose7.Schema.Types.ObjectId,
    ref: "Cohort",
    default: null
  },
  defenseType: {
    type: String,
    enum: ["Pre-Defense", "Final Defense"],
    required: true
  },
  evaluationType: {
    type: String,
    enum: ["supervisor", "committee"],
    required: true
  },
  marks: {
    type: Number,
    required: true,
    min: 0
  },
  comments: {
    type: String
  }
}, { timestamps: true });
evaluationSchema.path("marks").validate(function(value) {
  if (this.defenseType === "Pre-Defense") {
    if (this.evaluationType === "supervisor") {
      return value <= 20;
    }
    if (this.evaluationType === "committee") {
      return value <= 10;
    }
  }
  if (this.defenseType === "Final Defense") {
    if (this.evaluationType === "supervisor") {
      return value <= 40;
    }
    if (this.evaluationType === "committee") {
      return value <= 30;
    }
  }
  return false;
}, "Marks exceed the limit for the selected evaluation type.");
var Evaluation = mongoose7.model("Evaluation", evaluationSchema);
var Evaluation_default = Evaluation;

// src/models/PublishedResult.ts
import mongoose8 from "mongoose";
var PublishedResultSchema = new mongoose8.Schema({
  student: {
    type: mongoose8.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true
    // Each student can have only one published result
  },
  proposal: {
    type: mongoose8.Schema.Types.ObjectId,
    ref: "Proposal",
    required: true
  },
  cohort: {
    type: mongoose8.Schema.Types.ObjectId,
    ref: "Cohort",
    default: null
  },
  grade: {
    type: String,
    required: true
  },
  point: {
    type: Number,
    required: true
  },
  courseCode: {
    type: String,
    required: true
  },
  courseTitle: {
    type: String,
    required: true
  }
}, { timestamps: true });
var PublishedResult = mongoose8.model("PublishedResult", PublishedResultSchema);
var PublishedResult_default = PublishedResult;

// src/controllers/proposalController.ts
var createProposal = asyncHandler3(async (req, res) => {
  const { title, abstract, type, researchCellId, supervisorId, members, thesisCycleId, cohortId } = req.body;
  const createdBy = req.user._id;
  const department = req.user.department;
  let resolvedCohortId = req.user.cohort || cohortId || thesisCycleId;
  if (!resolvedCohortId) {
    const activeCohort = await ThesisCycle_default.findOne({ status: "Active", archived: false });
    if (activeCohort) resolvedCohortId = activeCohort._id;
  }
  if (!resolvedCohortId) {
    res.status(400);
    throw new Error("No cohort is available for this proposal. Please contact the committee.");
  }
  const cohort = await ThesisCycle_default.findById(resolvedCohortId);
  if (!cohort) {
    res.status(400);
    throw new Error("Selected cohort not found.");
  }
  if (!cohort.proposalSubmissionOpen) {
    res.status(403);
    throw new Error("Proposal submission for this cohort is closed. Please wait for the next submission period.");
  }
  if (cohort.proposalSubmissionDeadline && /* @__PURE__ */ new Date() > new Date(cohort.proposalSubmissionDeadline)) {
    res.status(403);
    throw new Error("Proposal submission for this cohort has ended. Please wait for the next submission period.");
  }
  const supervisor = await User_default.findById(supervisorId);
  if (!supervisor) {
    res.status(404);
    throw new Error("Supervisor not found.");
  }
  const courseSupervisors = await User_default.find({ mainSupervisor: supervisor._id, isCourseSupervisor: true });
  const maxGroupCapacity = 5 + courseSupervisors.length * 10;
  if (supervisor.currentGroupCount >= maxGroupCapacity) {
    res.status(400);
    throw new Error("Supervisor has reached their maximum group capacity.");
  }
  supervisor.currentGroupCount += 1;
  await supervisor.save();
  const existingProposals = await Proposal_default.find({ supervisorId });
  const newTitle = title.toLowerCase().replace(/[\s\p{P}]+/gu, "");
  for (const existingProposal of existingProposals) {
    const existingTitle = existingProposal.title.toLowerCase().replace(/[\s\p{P}]+/gu, "");
    const similarity = stringSimilarity.compareTwoStrings(newTitle, existingTitle);
    if (similarity > 0.8) {
      res.status(400);
      throw new Error("A similar project title already exists under this supervisor. Please modify your title and try again.");
    }
  }
  const researchCell = await ResearchCell_default.findById(researchCellId);
  if (!researchCell) {
    res.status(400);
    throw new Error("Research cell not found.");
  }
  const memberIds = (members || []).map((m) => m && m._id ? m._id : m);
  if (memberIds.length > 0) {
    const memberUsers = await User_default.find({ _id: { $in: memberIds } });
    const foreign = memberUsers.find(
      (m) => m.cohort && m.cohort.toString() !== resolvedCohortId.toString()
    );
    if (foreign) {
      res.status(400);
      throw new Error("You can only invite students from your own cohort.");
    }
  }
  const proposal = await Proposal_default.create({
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
    status: "Pending Committee"
  });
  res.status(201).json(proposal);
});
var getSupervisorProposals = asyncHandler3(async (req, res) => {
  const { filter, cohortId } = req.query;
  const supervisorId = req.user._id;
  let query = {};
  if (filter === "my_supervision") {
    query = { supervisorId, courseSupervisorId: null, status: "Approved" };
  } else if (filter === "my_supervision_with_course_supervision") {
    query = { supervisorId, courseSupervisorId: { $ne: null }, status: "Approved" };
  } else if (filter === "my_course_supervision") {
    query = { courseSupervisorId: supervisorId, status: "Approved" };
  } else {
    query = {
      $or: [
        { supervisorId },
        { courseSupervisorId: supervisorId }
      ],
      status: { $nin: ["Pending Committee", "Pending Supervisor", "Not Approved"] }
    };
  }
  if (cohortId) query.cohort = cohortId;
  const proposals = await Proposal_default.find(query).populate("createdBy", "name email studentId currentCGPA").populate("supervisorId", "name email").populate("researchCellId", "title").populate("cohort", "name").populate("members", "name email studentId currentCGPA");
  res.json(proposals);
});
var getSupervisorPendingProposals = asyncHandler3(async (req, res) => {
  const { cohortId } = req.query;
  const pendingQuery = {
    supervisorId: req.user._id,
    status: { $in: ["Pending Committee", "Pending Supervisor"] }
  };
  if (cohortId) pendingQuery.cohort = cohortId;
  const proposals = await Proposal_default.find(pendingQuery);
  await Proposal_default.populate(proposals, [
    { path: "createdBy", select: "name email studentId currentCGPA" },
    { path: "supervisorId", select: "name email" },
    { path: "researchCellId", select: "title" },
    { path: "cohort", select: "name" },
    { path: "members", select: "name email studentId currentCGPA" }
  ]);
  res.json(proposals);
});
var getStudentProposals = asyncHandler3(async (req, res) => {
  const { cohortId } = req.query;
  const studentId = req.user._id;
  const proposals = await Proposal_default.find({
    $or: [
      { createdBy: studentId },
      { members: studentId }
    ]
  }).populate("createdBy", "name email studentId currentCGPA").populate("supervisorId", "name email").populate("researchCellId", "title").populate("cohort", "name").populate("members", "name email studentId currentCGPA");
  res.json(proposals);
});
var getCommitteeProposals = asyncHandler3(async (req, res) => {
  const { cohortId } = req.query;
  const committeeQuery = { department: req.user.department };
  if (cohortId) committeeQuery.cohort = cohortId;
  const proposals = await Proposal_default.find(committeeQuery).populate("createdBy", "name email studentId").populate("supervisorId", "name email").populate("researchCellId", "title").populate("cohort", "name");
  res.json(proposals);
});
var updateProposalStatus = asyncHandler3(async (req, res) => {
  const { id } = req.params;
  const { status, feedback, acceptanceOption } = req.body;
  const proposal = await Proposal_default.findById(id);
  if (!proposal) {
    res.status(404);
    throw new Error("Proposal not found");
  }
  if (proposal.supervisorId.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error("Not authorized to update this proposal");
  }
  if (proposal.status !== "Pending Supervisor") {
    res.status(400);
    throw new Error("Proposal is not in Pending Supervisor status.");
  }
  const supervisor = await User_default.findById(proposal.supervisorId);
  if (!supervisor) {
    res.status(404);
    throw new Error("Main supervisor not found.");
  }
  if (status === "Approved") {
    if (acceptanceOption === "supervisor_only") {
      proposal.courseSupervisorId = null;
    } else if (acceptanceOption === "supervisor_and_course_supervisor") {
      const potentialCourseSupervisors = await User_default.find({
        role: "supervisor",
        isCourseSupervisor: true,
        mainSupervisor: proposal.supervisorId
      });
      let availableCourseSupervisor = null;
      if (potentialCourseSupervisors.length > 0) {
        availableCourseSupervisor = potentialCourseSupervisors[0];
      }
      if (!availableCourseSupervisor) {
        res.status(400);
        throw new Error("No course supervisor assigned to you yet. Please contact the committee.");
      }
      proposal.courseSupervisorId = availableCourseSupervisor._id;
    }
    proposal.status = "Approved";
  } else if (status === "Not Approved") {
    supervisor.currentGroupCount -= 1;
    await supervisor.save();
    proposal.status = "Not Approved";
  }
  proposal.feedback = feedback;
  proposal.reviewedAt = /* @__PURE__ */ new Date();
  const updatedProposal = await proposal.save();
  res.json(updatedProposal);
});
var forwardProposalToSupervisor = asyncHandler3(async (req, res) => {
  const { id } = req.params;
  const proposal = await Proposal_default.findById(id);
  if (!proposal) {
    res.status(404);
    throw new Error("Proposal not found");
  }
  if (proposal.status !== "Pending Committee") {
    res.status(400);
    throw new Error("Proposal is not in Pending Committee status.");
  }
  proposal.status = "Pending Supervisor";
  proposal.reviewedAt = /* @__PURE__ */ new Date();
  const updatedProposal = await proposal.save();
  res.json(updatedProposal);
});
var rejectProposal = asyncHandler3(async (req, res) => {
  const { id } = req.params;
  const { feedback } = req.body;
  const proposal = await Proposal_default.findById(id);
  if (!proposal) {
    res.status(404);
    throw new Error("Proposal not found");
  }
  if (proposal.status !== "Pending Committee") {
    res.status(400);
    throw new Error("Proposal is not in Pending Committee status.");
  }
  const supervisor = await User_default.findById(proposal.supervisorId);
  if (supervisor) {
    supervisor.currentGroupCount -= 1;
    await supervisor.save();
  }
  proposal.status = "Not Approved";
  proposal.feedback = feedback;
  proposal.reviewedAt = /* @__PURE__ */ new Date();
  const updatedProposal = await proposal.save();
  res.json(updatedProposal);
});
var getPendingProposalsByCell = asyncHandler3(async (req, res) => {
  const { cohortId } = req.query;
  const matchStage = { status: "Pending Committee" };
  if (cohortId) matchStage.cohort = new mongoose.Types.ObjectId(cohortId);
  const proposals = await Proposal_default.aggregate([
    { $match: matchStage },
    {
      $lookup: {
        from: "users",
        localField: "createdBy",
        foreignField: "_id",
        as: "createdBy"
      }
    },
    { $unwind: "$createdBy" },
    {
      $lookup: {
        from: "users",
        localField: "members",
        foreignField: "_id",
        as: "members"
      }
    },
    {
      $group: {
        _id: "$researchCellId",
        proposals: { $push: "$$ROOT" },
        count: { $sum: 1 }
      }
    },
    {
      $lookup: {
        from: "researchcells",
        localField: "_id",
        foreignField: "_id",
        as: "researchCell"
      }
    },
    { $unwind: "$researchCell" },
    {
      $project: {
        _id: 0,
        researchCell: "$researchCell",
        proposals: {
          $map: {
            input: "$proposals",
            as: "proposal",
            in: {
              _id: "$$proposal._id",
              title: "$$proposal.title",
              abstract: "$$proposal.abstract",
              type: "$$proposal.type",
              researchCellId: "$$proposal.researchCellId",
              supervisorId: "$$proposal.supervisorId",
              cohort: "$$proposal.cohort",
              status: "$$proposal.status",
              feedback: "$$proposal.feedback",
              reviewedAt: "$$proposal.reviewedAt",
              department: "$$proposal.department",
              createdAt: "$$proposal.createdAt",
              updatedAt: "$$proposal.updatedAt",
              createdBy: {
                _id: "$$proposal.createdBy._id",
                name: "$$proposal.createdBy.name",
                studentId: "$$proposal.createdBy.studentId",
                currentCGPA: "$$proposal.createdBy.currentCGPA"
              },
              cohort: "$$proposal.cohort",
              members: {
                $map: {
                  input: "$$proposal.members",
                  as: "member",
                  in: {
                    _id: "$$member._id",
                    name: "$$member.name",
                    studentId: "$$member.studentId",
                    currentCGPA: "$$member.currentCGPA"
                  }
                }
              }
            }
          }
        },
        count: "$count"
      }
    }
  ]);
  res.json(proposals);
});
var getApprovedProposals = asyncHandler3(async (req, res) => {
  const { cohortId } = req.query;
  const approvedQuery = { status: "Approved" };
  if (cohortId) approvedQuery.cohort = cohortId;
  const proposals = await Proposal_default.find(approvedQuery).populate("createdBy", "name studentId currentCGPA").populate("supervisorId", "name").populate("researchCellId", "title").populate("cohort", "name").populate("members", "name studentId currentCGPA");
  res.json(proposals);
});
var getAvailableProposals = asyncHandler3(async (req, res) => {
  const { defenseType, cohortId } = req.query;
  let assignedProposalsInDefenseBoards = [];
  if (defenseType === "Final Defense") {
    const finalDefenseBoards = await DefenseBoard_default.find({ defenseType: "Final Defense" }, "groups");
    assignedProposalsInDefenseBoards = finalDefenseBoards.flatMap((board) => board.groups);
  } else {
    const allDefenseBoards = await DefenseBoard_default.find({}, "groups");
    assignedProposalsInDefenseBoards = allDefenseBoards.flatMap((board) => board.groups);
  }
  const availableQuery = {
    status: "Approved",
    _id: { $nin: assignedProposalsInDefenseBoards }
  };
  if (cohortId) availableQuery.cohort = cohortId;
  const proposals = await Proposal_default.find(availableQuery).populate("createdBy", "name studentId currentCGPA").populate("supervisorId", "name").populate("courseSupervisorId", "name").populate("researchCellId", "title").populate("members", "name studentId currentCGPA");
  res.json(proposals);
});
var getSupervisorAllGroups = asyncHandler3(async (req, res) => {
  const supervisorId = req.user._id;
  const { cohortId } = req.query;
  const groupsQuery = {
    $or: [
      { supervisorId },
      { courseSupervisorId: supervisorId }
    ],
    status: "Approved"
  };
  if (cohortId) groupsQuery.cohort = cohortId;
  const proposals = await Proposal_default.find(groupsQuery).populate("createdBy", "name studentId currentCGPA").populate("supervisorId", "name").populate("courseSupervisorId", "name").populate("researchCellId", "title").populate("members", "name studentId currentCGPA");
  const underMySupervisionOnly = [];
  const underMySupervisionAndCourseSupervision = [];
  const underMyCourseSupervision = [];
  proposals.forEach((proposal) => {
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
var getMySupervisions = asyncHandler3(async (req, res) => {
  const supervisorId = req.user._id;
  const { thesisCycleId } = req.query;
  const supervisionsQuery = {
    $or: [
      { supervisorId },
      { coSupervisors: supervisorId }
    ],
    status: "Approved"
  };
  if (thesisCycleId) supervisionsQuery.cohort = thesisCycleId;
  const proposals = await Proposal_default.find(supervisionsQuery).populate("members", "name email");
  res.json(proposals);
});
var getProposalById = asyncHandler3(async (req, res) => {
  const proposal = await Proposal_default.findById(req.params.id).populate("members", "name email studentId").populate("supervisorId", "name email").populate("coSupervisors", "name email").populate("cohort", "name");
  if (proposal) {
    console.log(`[getProposalById] Fetched proposal ID: ${proposal._id}`);
    console.log(`[getProposalById] Proposal supervisorId: ${proposal.supervisorId?._id}`);
    console.log(`[getProposalById] Proposal coSupervisors: ${proposal.coSupervisors?.map((s) => s._id)}`);
    res.json(proposal);
  } else {
    console.log(`[getProposalById] Proposal not found for ID: ${req.params.id}`);
    res.status(404);
    throw new Error("Proposal not found");
  }
});
var publishResult = asyncHandler3(async (req, res) => {
  const { id } = req.params;
  const proposal = await Proposal_default.findById(id).populate("members");
  if (!proposal) {
    res.status(404);
    throw new Error("Proposal not found");
  }
  if (proposal.published) {
    res.status(400);
    throw new Error("Result already published");
  }
  const { members } = proposal;
  const studentResults = [];
  for (const member of members) {
    const evaluations = await Evaluation_default.find({
      proposal: id,
      student: member._id
    });
    const preDefenseSupervisor = evaluations.find((e) => e.defenseType === "pre-defense" && e.evaluationType === "supervisor");
    const preDefenseCommittee = evaluations.filter((e) => e.defenseType === "pre-defense" && e.evaluationType === "committee");
    const finalDefenseSupervisor = evaluations.find((e) => e.defenseType === "final-defense" && e.evaluationType === "supervisor");
    const finalDefenseCommittee = evaluations.filter((e) => e.defenseType === "final-defense" && e.evaluationType === "committee");
    if (!preDefenseSupervisor || preDefenseCommittee.length === 0 || !finalDefenseSupervisor || finalDefenseCommittee.length === 0) {
      res.status(400);
      throw new Error(`Marks for all defense types are not submitted for student ${member.name}`);
    }
    const preDefenseCommitteeAvg = preDefenseCommittee.reduce((acc, e) => acc + e.marks, 0) / preDefenseCommittee.length;
    const finalDefenseCommitteeAvg = finalDefenseCommittee.reduce((acc, e) => acc + e.marks, 0) / finalDefenseCommittee.length;
    const totalMarks = preDefenseSupervisor.marks + preDefenseCommitteeAvg + finalDefenseSupervisor.marks + finalDefenseCommitteeAvg;
    const { grade, point } = gradeCalculator_default(totalMarks);
    studentResults.push({
      studentId: member._id,
      totalMarks,
      grade,
      point
    });
  }
  if (studentResults.length > 0) {
    proposal.published = true;
    proposal.grade = studentResults[0].grade;
    proposal.point = studentResults[0].point;
    await proposal.save();
    for (const result of studentResults) {
      await PublishedResult_default.findOneAndUpdate(
        { student: result.studentId },
        {
          student: result.studentId,
          proposal: id,
          cohort: proposal.cohort || null,
          grade: result.grade,
          point: result.point,
          courseCode: "",
          courseTitle: ""
        },
        { upsert: true }
      );
    }
  }
  res.status(200).json(proposal);
});

// src/routes/proposalRoutes.ts
var router3 = express3.Router();
router3.route("/").post(protect, authorizeRoles("student"), createProposal);
router3.route("/").get(protect, authorizeRoles("committee"), getCommitteeProposals);
router3.get("/supervisor-proposals", protect, authorizeRoles("supervisor"), getSupervisorProposals);
router3.get("/supervisor-pending-proposals", protect, authorizeRoles("supervisor"), getSupervisorPendingProposals);
router3.get("/student-proposals", protect, authorizeRoles("student"), getStudentProposals);
router3.get("/committee-proposals", protect, authorizeRoles("committee"), getCommitteeProposals);
router3.get("/pending-by-cell", protect, authorizeRoles("committee"), getPendingProposalsByCell);
router3.put("/:id/status", protect, authorizeRoles("supervisor"), updateProposalStatus);
router3.put("/:id/forward", protect, authorizeRoles("committee"), forwardProposalToSupervisor);
router3.put("/:id/reject", protect, authorizeRoles("committee"), rejectProposal);
router3.put("/:id/publish", protect, committee, publishResult);
router3.get("/approved-proposals", protect, authorizeRoles("committee"), getApprovedProposals);
router3.get("/available-proposals", protect, authorizeRoles("committee"), getAvailableProposals);
router3.get("/my-supervisions", protect, authorizeRoles("supervisor"), getMySupervisions);
router3.get("/:id", protect, authorizeRoles("supervisor", "committee", "student"), getProposalById);
router3.get("/supervisor-all-groups", protect, authorizeRoles("supervisor"), getSupervisorAllGroups);
var proposalRoutes_default = router3;

// src/routes/userRoutes.ts
import express4 from "express";

// src/controllers/userController.ts
import asyncHandler4 from "express-async-handler";
var getStudents = asyncHandler4(async (req, res) => {
  const query = { role: "student" };
  if (req.user.role === "student") {
    if (req.user.cohort) {
      query.cohort = req.user.cohort;
    }
  } else {
    query.department = req.user.department;
  }
  const students = await User_default.find(query).select("-password");
  res.json(students);
});
var getSupervisors = asyncHandler4(async (req, res) => {
  const { researchCellId } = req.query;
  let query = {
    role: { $in: ["supervisor", "committee"] },
    department: req.user.department
  };
  if (researchCellId) {
    query.researchCells = researchCellId;
  }
  const supervisors = await User_default.find(query).select("-password").populate("researchCells", "title description");
  res.json(supervisors);
});
var addSupervisor = asyncHandler4(async (req, res) => {
  const { name, email, password } = req.body;
  const committeeMember = await User_default.findById(req.user._id);
  const userExists = await User_default.findOne({ email });
  if (userExists) {
    res.status(400);
    throw new Error("User already exists");
  }
  const supervisor = await User_default.create({
    name,
    email,
    password,
    role: "supervisor",
    department: committeeMember.department,
    profilePicture: "",
    researchCells: []
  });
  res.status(201).json({
    _id: supervisor._id,
    name: supervisor.name,
    email: supervisor.email,
    role: supervisor.role,
    department: supervisor.department,
    profilePicture: supervisor.profilePicture,
    researchCells: supervisor.researchCells
  });
});
var assignCellToSupervisor = asyncHandler4(async (req, res) => {
  const { id } = req.params;
  const { cellIds } = req.body;
  const supervisor = await User_default.findById(id);
  if (!supervisor) {
    res.status(404);
    throw new Error("Supervisor not found");
  }
  if (supervisor.role !== "supervisor" && supervisor.role !== "committee") {
    res.status(400);
    throw new Error("User is not a teacher (supervisor or committee)");
  }
  if (!supervisor.researchCells) {
    supervisor.researchCells = [];
  }
  cellIds.forEach((cellId) => {
    if (!supervisor.researchCells.includes(cellId)) {
      supervisor.researchCells.push(cellId);
    }
  });
  await supervisor.save();
  res.json({ message: "Cells assigned successfully", supervisor });
});
var getUserProfile = asyncHandler4(async (req, res) => {
  const user = await User_default.findById(req.user._id).select("-password").populate("researchCells", "title description");
  if (user) {
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      studentId: user.studentId,
      profilePicture: user.profilePicture,
      researchCells: user.researchCells,
      department: user.department,
      currentCGPA: user.currentCGPA,
      cohort: user.cohort || null
    });
  } else {
    res.status(404);
    throw new Error("User not found");
  }
});
var updateUserProfile = asyncHandler4(async (req, res) => {
  const user = await User_default.findById(req.user._id);
  if (user) {
    user.name = req.body.name || user.name;
    user.studentId = req.body.studentId || user.studentId;
    user.currentCGPA = req.body.currentCGPA || user.currentCGPA;
    user.department = req.body.departmentId || req.body.department || user.department;
    const updatedUser = await user.save();
    const populatedUser = await User_default.findById(updatedUser._id).populate("department", "name");
    res.json({
      _id: populatedUser._id,
      name: populatedUser.name,
      email: populatedUser.email,
      role: populatedUser.role,
      studentId: populatedUser.studentId,
      profilePicture: populatedUser.profilePicture,
      department: populatedUser.department,
      currentCGPA: populatedUser.currentCGPA,
      cohort: populatedUser.cohort || null
    });
  } else {
    res.status(404);
    throw new Error("User not found");
  }
});
var updatePassword = asyncHandler4(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User_default.findById(req.user._id);
  if (user) {
    if (await user.matchPassword(currentPassword)) {
      user.password = newPassword;
      await user.save();
      res.json({ message: "Password updated successfully" });
    } else {
      res.status(401);
      throw new Error("Current password incorrect");
    }
  } else {
    res.status(404);
    throw new Error("User not found");
  }
});
var uploadProfilePicture = asyncHandler4(async (req, res) => {
  if (req.file) {
    const user = await User_default.findById(req.user._id);
    if (user) {
      user.profilePicture = `/uploads/profile-pictures/${req.file.filename}`;
      await user.save();
      res.json({ message: "Profile picture uploaded successfully", profilePicture: user.profilePicture });
    } else {
      res.status(404);
      throw new Error("User not found");
    }
  } else {
    res.status(400);
    throw new Error("No file uploaded");
  }
});
var getAllUsers = asyncHandler4(async (req, res) => {
  const { department } = req.query;
  let filter = {};
  if (department) {
    filter.department = department;
  }
  const users = await User_default.find(filter).select("-password");
  res.json(users);
});
var getCommitteeMembers = asyncHandler4(async (req, res) => {
  const committeeMembers = await User_default.find({ role: "committee", department: req.user.department }).select("-password");
  res.json(committeeMembers);
});
var getAllSupervisors = asyncHandler4(async (req, res) => {
  const supervisors = await User_default.find({ role: { $in: ["supervisor", "committee"] } }).select("-password").populate("mainSupervisor", "name");
  res.json(supervisors);
});
var assignCourseSupervisor = asyncHandler4(async (req, res) => {
  const { id } = req.params;
  const { isCourseSupervisor, mainSupervisor: newMainSupervisorId } = req.body;
  const courseSupervisor = await User_default.findById(id);
  if (!courseSupervisor) {
    res.status(404);
    throw new Error("Supervisor not found");
  }
  courseSupervisor.isCourseSupervisor = isCourseSupervisor;
  courseSupervisor.mainSupervisor = isCourseSupervisor ? newMainSupervisorId : null;
  await courseSupervisor.save();
  res.json(courseSupervisor);
});
var getSupervisorsWithCapacity = asyncHandler4(async (req, res) => {
  const { researchCellId } = req.query;
  let query = { role: { $in: ["supervisor", "committee"] } };
  if (researchCellId) {
    query.researchCells = researchCellId;
  }
  const supervisors = await User_default.find(query).select("-password").populate("mainSupervisor", "name");
  const supervisorsWithCapacity = await Promise.all(supervisors.map(async (s) => {
    const courseSupervisors = await User_default.find({ mainSupervisor: s._id, isCourseSupervisor: true });
    const maxGroupCapacity = 5 + courseSupervisors.length * 10;
    return {
      _id: s._id,
      name: s.name,
      email: s.email,
      department: s.department,
      isCourseSupervisor: s.isCourseSupervisor,
      mainSupervisor: s.mainSupervisor,
      maxGroupCapacity,
      currentGroupCount: s.currentGroupCount,
      remainingCapacity: maxGroupCapacity - s.currentGroupCount
    };
  }));
  res.json(supervisorsWithCapacity);
});
var removeCellFromSupervisor = asyncHandler4(async (req, res) => {
  const { id } = req.params;
  const { cellId } = req.body;
  const supervisor = await User_default.findById(id);
  if (!supervisor) {
    res.status(404);
    throw new Error("Supervisor not found");
  }
  if (supervisor.role !== "supervisor" && supervisor.role !== "committee") {
    res.status(400);
    throw new Error("User is not a teacher (supervisor or committee)");
  }
  if (supervisor.researchCells) {
    supervisor.researchCells = supervisor.researchCells.filter(
      (cell) => cell.toString() !== cellId
    );
    await supervisor.save();
  }
  res.json({ message: "Cell removed successfully", supervisor });
});
var getUserById = asyncHandler4(async (req, res) => {
  const user = await User_default.findById(req.params.id).select("-password").populate("researchCells", "title");
  if (user) {
    res.json(user);
  } else {
    res.status(404);
    throw new Error("User not found");
  }
});

// src/middleware/uploadMiddleware.ts
import multer from "multer";
import path from "path";
var storage = multer.diskStorage({
  destination: process.env.VERCEL ? "/tmp" : "uploads/profile-pictures",
  filename: function(req, file, cb) {
    cb(null, file.fieldname + "-" + Date.now() + path.extname(file.originalname));
  }
});
function checkFileType(file, cb) {
  const filetypes = /jpeg|jpg|png|gif/;
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = filetypes.test(file.mimetype);
  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb("Error: Images Only!");
  }
}
var upload = multer({
  storage,
  limits: { fileSize: 1e6 },
  // 1MB
  fileFilter: function(req, file, cb) {
    checkFileType(file, cb);
  }
}).single("profilePicture");
var uploadMiddleware_default = upload;

// src/routes/userRoutes.ts
var router4 = express4.Router();
router4.get("/students", protect, authorizeRoles("committee", "supervisor", "student", "admin"), getStudents);
router4.get("/supervisors", protect, authorizeRoles("committee", "student", "supervisor", "admin"), getSupervisors);
router4.post("/add-supervisor", protect, authorizeRoles("admin"), addSupervisor);
router4.put("/:id/assign-cell", protect, authorizeRoles("admin", "committee"), assignCellToSupervisor);
router4.route("/profile").get(protect, getUserProfile).put(protect, updateUserProfile);
router4.put("/update-password", protect, updatePassword);
router4.post("/profile-picture", protect, uploadMiddleware_default, uploadProfilePicture);
router4.get("/all", protect, authorizeRoles("committee", "supervisor", "admin"), getAllUsers);
router4.get("/committee-members", protect, authorizeRoles("admin", "committee"), getCommitteeMembers);
router4.get("/supervisors/all", protect, authorizeRoles("admin", "committee"), getAllSupervisors);
router4.get("/supervisors/capacity", protect, authorizeRoles("student", "admin"), getSupervisorsWithCapacity);
router4.put("/supervisors/:id/assign-course-supervisor", protect, authorizeRoles("admin"), assignCourseSupervisor);
router4.get("/:id", protect, authorizeRoles("admin", "committee"), getUserById);
router4.put("/:id/remove-cell", protect, authorizeRoles("admin", "committee"), removeCellFromSupervisor);
var userRoutes_default = router4;

// src/routes/noticeRoutes.ts
import express5 from "express";

// src/models/Notice.ts
import mongoose9 from "mongoose";
var NoticeSchema = new mongoose9.Schema({
  sender: {
    type: mongoose9.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  file: {
    type: String,
    // URL to the uploaded file
    required: false
  },
  recipients: [
    {
      type: mongoose9.Schema.Types.ObjectId,
      ref: "User"
    }
  ],
  readBy: [
    {
      type: mongoose9.Schema.Types.ObjectId,
      ref: "User"
    }
  ]
}, { timestamps: true });
var Notice_default = mongoose9.model("Notice", NoticeSchema);

// src/controllers/noticeController.ts
import asyncHandler5 from "express-async-handler";
var createCommitteeNotice = asyncHandler5(async (req, res) => {
  const { title, description, sendTo } = req.body;
  const sender = req.user._id;
  let recipients = [];
  if (sendTo === "all") {
    const users = await User_default.find({ role: { $in: ["student", "supervisor"] }, department: req.user.department });
    recipients = users.map((user) => user._id);
  } else {
    const users = await User_default.find({ role: sendTo, department: req.user.department });
    recipients = users.map((user) => user._id);
  }
  const notice = await Notice_default.create({
    sender,
    title,
    description,
    recipients
  });
  const io = req.app.get("socketio");
  if (io) {
    recipients.forEach((recipientId) => {
      io.emit("newNotice", { recipientId, notice });
    });
  }
  res.status(201).json(notice);
});
var getCommitteeSentNotices = asyncHandler5(async (req, res) => {
  const notices = await Notice_default.find({ sender: req.user._id }).sort({ createdAt: -1 }).populate("sender", "name");
  res.status(200).json(notices);
});
var sendNoticeToGroup = asyncHandler5(async (req, res) => {
  const { title, description, groupId } = req.body;
  const sender = req.user._id;
  let recipients = [];
  if (groupId === "all") {
    const proposals = await Proposal_default.find({ supervisorId: sender });
    const members = proposals.flatMap((p) => p.members);
    recipients = [...new Set(members)];
  } else {
    const proposal = await Proposal_default.findById(groupId);
    if (!proposal) {
      res.status(404);
      throw new Error("Proposal not found");
    }
    recipients = proposal.members;
  }
  if (recipients.length === 0) {
    res.status(400);
    throw new Error("No recipients found for this notice.");
  }
  const notice = await Notice_default.create({
    sender,
    title,
    description,
    recipients
  });
  const io = req.app.get("socketio");
  if (io) {
    recipients.forEach((recipientId) => {
      io.emit("newNotice", { recipientId, notice });
    });
  }
  res.status(201).json(notice);
});
var getSupervisorSentNotices = asyncHandler5(async (req, res) => {
  const notices = await Notice_default.find({ sender: req.user._id }).sort({ createdAt: -1 }).populate("sender", "name");
  res.status(200).json(notices);
});
var getNotices = asyncHandler5(async (req, res) => {
  const userId = req.user._id;
  let notices;
  if (req.user.role === "committee") {
    notices = await Notice_default.find({}).sort({ createdAt: -1 }).populate("sender", "name role");
  } else {
    notices = await Notice_default.find({ recipients: userId }).sort({ createdAt: -1 }).populate("sender", "name role");
  }
  res.status(200).json(notices);
});
var getNoticeById = asyncHandler5(async (req, res) => {
  const notice = await Notice_default.findById(req.params.id).populate("sender", "name");
  if (!notice) {
    res.status(404);
    throw new Error("Notice not found");
  }
  if (req.user.role !== "committee" && !notice.recipients.includes(req.user._id)) {
    res.status(403);
    throw new Error("Unauthorized to view this notice");
  }
  res.status(200).json(notice);
});
var markNoticeAsRead = asyncHandler5(async (req, res) => {
  const notice = await Notice_default.findById(req.params.id);
  if (!notice) {
    res.status(404);
    throw new Error("Notice not found");
  }
  if (!notice.readBy.includes(req.user._id)) {
    notice.readBy.push(req.user._id);
    await notice.save();
  }
  res.status(200).json({ message: "Notice marked as read", notice });
});
var deleteNotice = asyncHandler5(async (req, res) => {
  const notice = await Notice_default.findById(req.params.id);
  if (!notice) {
    res.status(404);
    throw new Error("Notice not found");
  }
  if (notice.sender.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error("Not authorized to delete this notice");
  }
  await notice.deleteOne();
  res.status(200).json({ message: "Notice removed" });
});

// src/routes/noticeRoutes.ts
var router5 = express5.Router();
router5.route("/committee").post(protect, authorizeRoles("committee"), createCommitteeNotice);
router5.route("/committee/sent").get(protect, authorizeRoles("committee"), getCommitteeSentNotices);
router5.route("/supervisor").post(protect, authorizeRoles("supervisor"), sendNoticeToGroup);
router5.route("/supervisor/sent").get(protect, authorizeRoles("supervisor"), getSupervisorSentNotices);
router5.route("/").get(protect, getNotices);
router5.route("/:id").get(protect, getNoticeById).delete(protect, authorizeRoles("committee"), deleteNotice);
router5.route("/:id/read").put(protect, markNoticeAsRead);
var noticeRoutes_default = router5;

// src/routes/uploadRoutes.ts
import express6 from "express";
import multer2 from "multer";

// src/utils/cloudinary.ts
import { v2 as cloudinary } from "cloudinary";
import "dotenv/config";
var { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
  console.error("Cloudinary credentials are not set in the .env. Uploads will fail.");
}
cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET
});
var cloudinary_default = cloudinary;

// src/controllers/uploadController.ts
import asyncHandler6 from "express-async-handler";
var uploadChatFile = asyncHandler6(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error("No file uploaded.");
  }
  const uploadPromise = new Promise((resolve, reject) => {
    const uploadStream = cloudinary_default.uploader.upload_stream(
      { resource_type: "auto" },
      (error, result2) => {
        if (error) reject(error);
        else resolve(result2);
      }
    );
    uploadStream.end(req.file.buffer);
  });
  const result = await uploadPromise;
  res.status(200).json({
    message: "File uploaded successfully",
    fileUrl: result.secure_url,
    publicId: result.public_id,
    fileType: result.resource_type
  });
});

// src/routes/uploadRoutes.ts
var router6 = express6.Router();
var uploadChat = multer2({ storage: multer2.memoryStorage() });
router6.post("/chat-file", protect, uploadChat.single("file"), uploadChatFile);
var uploadRoutes_default = router6;

// src/routes/committeeRoutes.ts
import express7 from "express";

// src/models/SubmissionDate.ts
import mongoose10 from "mongoose";
var SubmissionDateSchema = new mongoose10.Schema({
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose10.Schema.Types.ObjectId,
    ref: "User",
    required: true
  }
}, { timestamps: true });
var SubmissionDate_default = mongoose10.model("SubmissionDate", SubmissionDateSchema);

// src/controllers/committeeController.ts
import asyncHandler7 from "express-async-handler";
var setSubmissionDates = asyncHandler7(async (req, res) => {
  const { startDate, endDate } = req.body;
  await SubmissionDate_default.updateMany({ isActive: true }, { $set: { isActive: false } });
  const newSubmissionDate = await SubmissionDate_default.create({
    startDate,
    endDate,
    createdBy: req.user._id,
    isActive: true
  });
  res.status(201).json(newSubmissionDate);
});
var getSubmissionDates = asyncHandler7(async (req, res) => {
  const activeSubmissionDate = await SubmissionDate_default.findOne({ isActive: true });
  if (!activeSubmissionDate) {
    res.status(404);
    throw new Error("No active submission dates found");
  }
  res.json(activeSubmissionDate);
});

// src/routes/committeeRoutes.ts
var router7 = express7.Router();
router7.route("/submission-dates").post(protect, authorizeRoles("committee"), setSubmissionDates).get(protect, getSubmissionDates);
var committeeRoutes_default = router7;

// src/routes/supervisorRoutes.ts
import express8 from "express";
import multer3 from "multer";

// src/controllers/supervisorController.ts
import asyncHandler8 from "express-async-handler";
var updateSupervisorProfile = asyncHandler8(async (req, res) => {
  const user = await User_default.findById(req.user._id);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }
  user.name = req.body.name || user.name;
  user.education = req.body.education || user.education;
  user.experience = req.body.experience || user.experience;
  user.research = req.body.research || user.research;
  if (req.file) {
    try {
      const uploadPromise = new Promise((resolve, reject) => {
        const uploadStream = cloudinary_default.uploader.upload_stream(
          {
            folder: "thespro/profiles",
            resource_type: "image"
          },
          (error, result2) => {
            if (error) reject(error);
            else resolve(result2);
          }
        );
        uploadStream.end(req.file.buffer);
      });
      const result = await uploadPromise;
      user.profilePicture = result.secure_url;
    } catch (error) {
      console.error("Cloudinary Upload Error:", error);
      res.status(500);
      throw new Error("Failed to upload profile picture to Cloudinary");
    }
  }
  const updatedUser = await user.save();
  res.status(200).json({
    _id: updatedUser._id,
    name: updatedUser.name,
    email: updatedUser.email,
    role: updatedUser.role,
    profilePicture: updatedUser.profilePicture,
    education: updatedUser.education,
    experience: updatedUser.experience,
    research: updatedUser.research,
    department: updatedUser.department
  });
});

// src/routes/supervisorRoutes.ts
var router8 = express8.Router();
var storage2 = multer3.memoryStorage();
var upload2 = multer3({ storage: storage2 });
router8.put("/profile", protect, upload2.single("profileImage"), updateSupervisorProfile);
var supervisorRoutes_default = router8;

// src/routes/defenseBoardRoutes.ts
import express9 from "express";

// src/controllers/defenseBoardController.ts
import asyncHandler9 from "express-async-handler";

// src/models/ScheduleSlot.ts
import mongoose11 from "mongoose";
var ScheduleSlotSchema = new mongoose11.Schema(
  {
    date: {
      type: Date,
      required: true
    },
    startTime: {
      type: String,
      required: true
    },
    endTime: {
      type: String,
      required: true
    }
  },
  { timestamps: true }
);
var ScheduleSlot = mongoose11.model("ScheduleSlot", ScheduleSlotSchema);
var ScheduleSlot_default = ScheduleSlot;

// src/controllers/defenseBoardController.ts
var createDefenseBoard = asyncHandler9(async (req, res) => {
  const { defenseType, room, schedule, groups, boardMembers, boardNumber } = req.body;
  if (!defenseType || !room || !schedule || !groups || !boardMembers || !boardNumber) {
    res.status(400);
    throw new Error("Please fill all required fields");
  }
  if (groups.length === 0 || groups.length > 5) {
    res.status(400);
    throw new Error("A defense board must have between 1 and 5 groups.");
  }
  if (boardMembers.length < 2 || boardMembers.length > 4) {
    res.status(400);
    throw new Error("A defense board must have between 2 and 4 board members.");
  }
  const scheduleSlot = await ScheduleSlot_default.findById(schedule);
  if (!scheduleSlot) {
    res.status(404);
    throw new Error("Schedule not found");
  }
  const existingBoard = await DefenseBoard_default.findOne({ room, schedule, date: scheduleSlot.date });
  if (existingBoard) {
    res.status(400);
    throw new Error("A defense board already exists for this room, schedule, and date.");
  }
  const firstProposal = await Proposal_default.findById(groups[0]).select("cohort");
  const cohort = firstProposal?.cohort || null;
  const defenseBoard = new DefenseBoard_default({
    boardNumber,
    defenseType,
    room,
    schedule,
    date: scheduleSlot.date,
    groups,
    cohort,
    boardMembers,
    createdBy: req.user._id,
    logs: [{ action: "CREATED", user: req.user._id }]
  });
  const createdDefenseBoard = await defenseBoard.save();
  for (const proposalId of groups) {
    await Proposal_default.findByIdAndUpdate(proposalId, { defenseBoardId: createdDefenseBoard._id });
    console.log(`[createDefenseBoard] Set defenseBoardId=${createdDefenseBoard._id} for Proposal: ${proposalId}`);
  }
  res.status(201).json(createdDefenseBoard);
});
var getAllDefenseBoards = asyncHandler9(async (req, res) => {
  const { filter, cohortId } = req.query;
  let query = {};
  if (filter === "current") {
    query.date = { $gte: (/* @__PURE__ */ new Date()).setHours(0, 0, 0, 0) };
  }
  if (cohortId && req.user.role !== "student") {
    const proposalIds = await Proposal_default.find({ cohort: cohortId }).distinct("_id");
    query.groups = { $in: proposalIds };
  }
  let defenseBoards = await DefenseBoard_default.find(query).populate("room", "name").populate("schedule", "startTime endTime").populate({
    path: "groups",
    strictPopulate: false,
    populate: [
      { path: "createdBy", select: "name studentId" },
      { path: "members", select: "name studentId" },
      { path: "supervisorId", select: "name" },
      { path: "courseSupervisorId", select: "name" }
    ]
  }).populate("boardMembers", "name email").populate("createdBy", "name email").populate({
    path: "comments.commentedBy",
    select: "name"
  });
  defenseBoards = defenseBoards.filter((board) => board.room && board.schedule);
  res.json(defenseBoards);
});
var getDefenseBoardById = asyncHandler9(async (req, res) => {
  const defenseBoard = await DefenseBoard_default.findById(req.params.id).populate("room", "name").populate("schedule", "startTime endTime").populate({
    path: "groups",
    strictPopulate: false,
    populate: [
      { path: "createdBy", select: "name studentId" },
      { path: "members", select: "name studentId" },
      { path: "supervisorId", select: "name" },
      { path: "courseSupervisorId", select: "name" }
    ]
  }).populate("boardMembers", "name email").populate("createdBy", "name email");
  if (defenseBoard) {
    console.log(`[getDefenseBoardById] Found defense board: ${defenseBoard._id}`);
    console.log(`[getDefenseBoardById] Defense Type: ${defenseBoard.defenseType}`);
    console.log(`[getDefenseBoardById] Groups count (after populate): ${defenseBoard.groups.length}`);
    defenseBoard.groups.forEach((group, index) => {
      console.log(`[getDefenseBoardById]   Group ${index + 1}: ID=${group._id}, Title=${group.title}, Members=${group.members.map((m) => m.name).join(", ")}`);
    });
    res.json(defenseBoard);
  } else {
    console.log(`[getDefenseBoardById] Defense board not found for ID: ${req.params.id}`);
    res.status(404);
    throw new Error("Defense board not found");
  }
});
var updateDefenseBoard = asyncHandler9(async (req, res) => {
  const { defenseType, room, schedule, date, groups, boardMembers } = req.body;
  const defenseBoard = await DefenseBoard_default.findById(req.params.id);
  if (defenseBoard) {
    defenseBoard.defenseType = defenseType || defenseBoard.defenseType;
    defenseBoard.room = room || defenseBoard.room;
    defenseBoard.schedule = schedule || defenseBoard.schedule;
    defenseBoard.date = date || defenseBoard.date;
    if (groups) {
      if (groups.length === 0 || groups.length > 5) {
        res.status(400);
        throw new Error("A defense board must have between 1 and 5 groups.");
      }
      const removedProposalIds = defenseBoard.groups.filter((oldId) => !groups.includes(oldId.toString()));
      for (const proposalId of removedProposalIds) {
        await Proposal_default.findByIdAndUpdate(proposalId, { defenseBoardId: null });
        console.log(`[updateDefenseBoard] Set defenseBoardId=null for removed Proposal: ${proposalId}`);
      }
      const addedProposalIds = groups.filter((newId) => !defenseBoard.groups.map((oldId) => oldId.toString()).includes(newId));
      for (const proposalId of addedProposalIds) {
        await Proposal_default.findByIdAndUpdate(proposalId, { defenseBoardId: defenseBoard._id });
        console.log(`[updateDefenseBoard] Set defenseBoardId=${defenseBoard._id} for added Proposal: ${proposalId}`);
      }
      const firstProposal = await Proposal_default.findById(groups[0]).select("cohort");
      defenseBoard.cohort = firstProposal?.cohort || null;
      defenseBoard.groups = groups;
    }
    if (boardMembers) {
      if (boardMembers.length < 2 || boardMembers.length > 4) {
        res.status(400);
        throw new Error("A defense board must have between 2 and 4 board members.");
      }
      defenseBoard.boardMembers = boardMembers;
    }
    defenseBoard.logs.push({ action: "UPDATED", user: req.user._id });
    const updatedDefenseBoard = await defenseBoard.save();
    res.json(updatedDefenseBoard);
  } else {
    res.status(404);
    throw new Error("Defense board not found");
  }
});
var deleteDefenseBoard = asyncHandler9(async (req, res) => {
  const defenseBoard = await DefenseBoard_default.findById(req.params.id);
  if (defenseBoard) {
    for (const proposalId of defenseBoard.groups) {
      await Proposal_default.findByIdAndUpdate(proposalId, { defenseBoardId: null });
    }
    await defenseBoard.deleteOne();
    res.json({ message: "Defense board removed" });
  } else {
    res.status(404);
    throw new Error("Defense board not found");
  }
});
var getSupervisorDefenseSchedule = asyncHandler9(async (req, res) => {
  const supervisorId = req.user._id;
  const { defenseType, cohortId } = req.query;
  let query = { boardMembers: supervisorId };
  if (defenseType) {
    query.defenseType = defenseType;
  }
  if (cohortId) {
    const proposalIds = await Proposal_default.find({ cohort: cohortId }).distinct("_id");
    query.groups = { $in: proposalIds };
  }
  const defenseBoards = await DefenseBoard_default.find(query).populate("room", "name").populate("schedule", "startTime endTime").populate("boardMembers", "name email").populate("createdBy", "name email").lean();
  if (!defenseBoards || defenseBoards.length === 0) {
    return res.json([]);
  }
  for (const board of defenseBoards) {
    if (board.groups && board.groups.length > 0) {
      const populatedGroups = [];
      for (const groupId of board.groups) {
        const group = await Proposal_default.findById(groupId).populate("supervisorId", "name").populate("courseSupervisorId", "name").populate("members", "name studentId").populate("createdBy", "name studentId").lean();
        if (group) {
          populatedGroups.push(group);
        }
      }
      board.groups = populatedGroups;
    }
  }
  const finalBoards = defenseBoards;
  res.json(finalBoards);
});
var getStudentDefenseSchedule = asyncHandler9(async (req, res) => {
  if (!req.user) {
    res.status(401);
    throw new Error("Not authorized");
  }
  const studentId = req.user._id;
  const { defenseType } = req.query;
  try {
    const studentProposals = await Proposal_default.find({
      $or: [{ createdBy: studentId }, { members: studentId }]
    }).select("_id");
    const proposalIds = studentProposals.map((p) => p._id);
    let query = { groups: { $in: proposalIds } };
    if (defenseType) {
      query.defenseType = defenseType;
    }
    let defenseBoards = await DefenseBoard_default.find(query).populate("room", "name").populate("schedule", "startTime endTime").populate({
      path: "groups",
      strictPopulate: false,
      populate: [
        { path: "createdBy", select: "name studentId" },
        { path: "members", select: "name studentId" },
        { path: "supervisorId", select: "name" },
        { path: "courseSupervisorId", select: "name" }
      ]
    }).populate("boardMembers", "name email").populate("createdBy", "name email").populate({
      path: "comments.commentedBy",
      select: "name"
    });
    defenseBoards = defenseBoards.filter((board) => board.room && board.schedule);
    res.json(defenseBoards);
  } catch (error) {
    console.error("Error in getStudentDefenseSchedule:", error);
    res.status(500);
    throw new Error(`Failed to fetch student defense schedule: ${error.message}`);
  }
});
var addOrUpdateComment = asyncHandler9(async (req, res) => {
  const { id: defenseBoardId } = req.params;
  const { groupId, text } = req.body;
  const defenseBoard = await DefenseBoard_default.findById(defenseBoardId);
  if (defenseBoard) {
    const commentIndex = defenseBoard.comments.findIndex(
      (comment) => comment.group.toString() === groupId
    );
    if (commentIndex > -1) {
      defenseBoard.comments[commentIndex].text = text;
      defenseBoard.comments[commentIndex].commentedBy = req.user._id;
    } else {
      defenseBoard.comments.push({ group: groupId, text, commentedBy: req.user._id });
    }
    const updatedDefenseBoard = await defenseBoard.save();
    const io = req.app.get("socketio");
    if (io) {
      io.emit("commentUpdated", { defenseBoardId: updatedDefenseBoard._id, groupId, text, commentedBy: req.user._id });
    }
    res.json(updatedDefenseBoard);
  } else {
    res.status(404);
    throw new Error("Defense board not found");
  }
});
var getSupervisorDefenseResult = asyncHandler9(async (req, res) => {
  const supervisorId = req.user._id;
  const { defenseType, filter, thesisCycleId } = req.query;
  console.log("getSupervisorDefenseResult: supervisorId=", supervisorId, "defenseType=", defenseType, "supervisionFilter=", filter);
  let boardQuery = {};
  if (defenseType) {
    boardQuery.defenseType = defenseType;
  }
  let proposalQuery = { status: "Approved" };
  if (thesisCycleId) proposalQuery.cohort = thesisCycleId;
  if (filter === "my_supervision") {
    proposalQuery.$and = [
      { supervisorId },
      { courseSupervisorId: null }
    ];
  } else if (filter === "my_course_supervision") {
    proposalQuery.courseSupervisorId = supervisorId;
  } else {
    proposalQuery.$or = [
      { supervisorId },
      { courseSupervisorId: supervisorId }
    ];
  }
  const directProposals = await Proposal_default.find(proposalQuery).select("_id");
  const directProposalIds = directProposals.map((p) => p._id);
  const courseSupervisorsUnderMe = await User_default.find({
    mainSupervisor: supervisorId,
    isCourseSupervisor: true
  }).select("_id");
  const courseSupervisorIds = courseSupervisorsUnderMe.map((cs) => cs._id);
  const indirectProposals = await Proposal_default.find({
    courseSupervisorId: { $in: courseSupervisorIds }
  }).select("_id");
  const indirectProposalIds = indirectProposals.map((p) => p._id);
  const allRelevantProposalIds = [.../* @__PURE__ */ new Set([...directProposalIds, ...indirectProposalIds])];
  if (allRelevantProposalIds.length === 0) {
    console.log("getSupervisorDefenseResult: No relevant proposals found.");
    return res.json([]);
  }
  boardQuery.groups = { $in: allRelevantProposalIds };
  console.log("getSupervisorDefenseResult: Final boardQuery=", boardQuery);
  const defenseBoards = await DefenseBoard_default.find(boardQuery).populate("room", "name").populate("schedule", "startTime endTime").populate("boardMembers", "name email").populate("createdBy", "name email").lean();
  if (!defenseBoards || defenseBoards.length === 0) {
    console.log("getSupervisorDefenseResult: No defense boards found for the query.");
    return res.json([]);
  }
  const finalResults = [];
  for (const board of defenseBoards) {
    const boardCopy = { ...board };
    const populatedGroups = [];
    for (const groupId of board.groups) {
      if (allRelevantProposalIds.includes(groupId.toString())) {
        const group = await Proposal_default.findById(groupId).populate("supervisorId", "name").populate("courseSupervisorId", "name").populate("members", "name studentId").populate("createdBy", "name studentId").lean();
        if (group) {
          populatedGroups.push(group);
        }
      }
    }
    boardCopy.groups = populatedGroups;
    if (boardCopy.groups.length > 0) {
      finalResults.push(boardCopy);
    }
  }
  const filteredResults = finalResults.filter((board) => board.room && board.schedule);
  console.log("getSupervisorDefenseResult: Sending final results count=", filteredResults.length);
  res.json(filteredResults);
});
var getMyCommitteeEvaluations = asyncHandler9(async (req, res) => {
  const supervisorId = req.user._id;
  const { defenseType, thesisCycleId } = req.query;
  console.log(`[getMyCommitteeEvaluations] Incoming supervisorId: ${supervisorId}, defenseType: ${defenseType}`);
  let query = { boardMembers: supervisorId };
  if (defenseType) {
    query.defenseType = { $regex: new RegExp(`^${defenseType}$`, "i") };
  }
  if (thesisCycleId) {
    const proposalIds = await Proposal_default.find({ cohort: thesisCycleId }).distinct("_id");
    query.groups = { $in: proposalIds };
  }
  console.log(`[getMyCommitteeEvaluations] Constructed query: ${JSON.stringify(query)}`);
  const defenseBoards = await DefenseBoard_default.find(query).populate({
    path: "groups",
    populate: {
      path: "members",
      select: "name email"
    }
  }).populate("room", "name").populate("schedule", "startTime endTime");
  console.log(`[getMyCommitteeEvaluations] Found ${defenseBoards.length} defense boards for supervisor ${supervisorId} with defenseType ${defenseType || "all"}.`);
  res.json(defenseBoards);
});

// src/routes/defenseBoardRoutes.ts
var router9 = express9.Router();
router9.route("/").post(protect, authorizeRoles("committee"), createDefenseBoard).get(protect, authorizeRoles("committee", "supervisor", "student"), getAllDefenseBoards);
router9.get("/supervisor-schedule", protect, authorizeRoles("supervisor"), getSupervisorDefenseSchedule);
router9.get("/supervisor-results", protect, authorizeRoles("supervisor"), getSupervisorDefenseResult);
router9.get("/my-committee-evaluations", protect, authorizeRoles("supervisor"), getMyCommitteeEvaluations);
router9.get("/student-schedule", protect, authorizeRoles("student"), getStudentDefenseSchedule);
router9.route("/:id").get(protect, authorizeRoles("committee", "supervisor", "student"), getDefenseBoardById).put(protect, authorizeRoles("committee"), updateDefenseBoard).delete(protect, authorizeRoles("committee"), deleteDefenseBoard);
router9.put("/:id/comments", protect, authorizeRoles("supervisor"), addOrUpdateComment);
var defenseBoardRoutes_default = router9;

// src/routes/roomRoutes.ts
import express10 from "express";

// src/controllers/roomController.ts
import asyncHandler10 from "express-async-handler";

// src/models/Room.ts
import mongoose12 from "mongoose";
var RoomSchema = new mongoose12.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true
    },
    capacity: {
      type: Number,
      required: true,
      default: 5
      // Max 5 groups per slot
    }
  },
  { timestamps: true }
);
var Room = mongoose12.model("Room", RoomSchema);
var Room_default = Room;

// src/controllers/roomController.ts
var createRoom = asyncHandler10(async (req, res) => {
  const { name, capacity } = req.body;
  if (!name || !capacity) {
    res.status(400);
    throw new Error("Please add all fields");
  }
  const roomExists = await Room_default.findOne({ name });
  if (roomExists) {
    res.status(400);
    throw new Error("Room with that name already exists");
  }
  const room = await Room_default.create({
    name,
    capacity
  });
  res.status(201).json(room);
});
var getAllRooms = asyncHandler10(async (req, res) => {
  const rooms = await Room_default.find({});
  res.json(rooms);
});
var getRoomById = asyncHandler10(async (req, res) => {
  const room = await Room_default.findById(req.params.id);
  if (room) {
    res.json(room);
  } else {
    res.status(404);
    throw new Error("Room not found");
  }
});
var updateRoom = asyncHandler10(async (req, res) => {
  const { name, capacity } = req.body;
  const room = await Room_default.findById(req.params.id);
  if (room) {
    room.name = name || room.name;
    room.capacity = capacity || room.capacity;
    const updatedRoom = await room.save();
    res.json(updatedRoom);
  } else {
    res.status(404);
    throw new Error("Room not found");
  }
});
var deleteRoom = asyncHandler10(async (req, res) => {
  const room = await Room_default.findById(req.params.id);
  if (room) {
    await room.deleteOne();
    res.json({ message: "Room removed" });
  } else {
    res.status(404);
    throw new Error("Room not found");
  }
});

// src/routes/roomRoutes.ts
var router10 = express10.Router();
router10.route("/").post(protect, authorizeRoles("committee"), createRoom).get(protect, authorizeRoles("committee"), getAllRooms);
router10.route("/:id").get(protect, authorizeRoles("committee"), getRoomById).put(protect, authorizeRoles("committee"), updateRoom).delete(protect, authorizeRoles("committee"), deleteRoom);
var roomRoutes_default = router10;

// src/routes/scheduleSlotRoutes.ts
import express11 from "express";

// src/controllers/scheduleSlotController.ts
import asyncHandler11 from "express-async-handler";
var createScheduleSlot = asyncHandler11(async (req, res) => {
  const { date, startTime, endTime } = req.body;
  if (!date || !startTime || !endTime) {
    res.status(400);
    throw new Error("Please add all fields");
  }
  const scheduleSlotExists = await ScheduleSlot_default.findOne({ date, startTime, endTime });
  if (scheduleSlotExists) {
    res.status(400);
    throw new Error("Schedule slot already exists");
  }
  const scheduleSlot = await ScheduleSlot_default.create({
    date,
    startTime,
    endTime
  });
  res.status(201).json(scheduleSlot);
});
var getAllScheduleSlots = asyncHandler11(async (req, res) => {
  const scheduleSlots = await ScheduleSlot_default.find({});
  res.json(scheduleSlots);
});
var getScheduleSlotById = asyncHandler11(async (req, res) => {
  const scheduleSlot = await ScheduleSlot_default.findById(req.params.id);
  if (scheduleSlot) {
    res.json(scheduleSlot);
  } else {
    res.status(404);
    throw new Error("Schedule slot not found");
  }
});
var updateScheduleSlot = asyncHandler11(async (req, res) => {
  const { date, startTime, endTime } = req.body;
  const scheduleSlot = await ScheduleSlot_default.findById(req.params.id);
  if (scheduleSlot) {
    scheduleSlot.date = date || scheduleSlot.date;
    scheduleSlot.startTime = startTime || scheduleSlot.startTime;
    scheduleSlot.endTime = endTime || scheduleSlot.endTime;
    const updatedScheduleSlot = await scheduleSlot.save();
    res.json(updatedScheduleSlot);
  } else {
    res.status(404);
    throw new Error("Schedule slot not found");
  }
});
var deleteScheduleSlot = asyncHandler11(async (req, res) => {
  const scheduleSlot = await ScheduleSlot_default.findById(req.params.id);
  if (scheduleSlot) {
    await scheduleSlot.deleteOne();
    res.json({ message: "Schedule slot removed" });
  } else {
    res.status(404);
    throw new Error("Schedule slot not found");
  }
});

// src/routes/scheduleSlotRoutes.ts
var router11 = express11.Router();
router11.route("/").post(protect, authorizeRoles("committee"), createScheduleSlot).get(protect, authorizeRoles("committee"), getAllScheduleSlots);
router11.route("/:id").get(protect, authorizeRoles("committee"), getScheduleSlotById).put(protect, authorizeRoles("committee"), updateScheduleSlot).delete(protect, authorizeRoles("committee"), deleteScheduleSlot);
var scheduleSlotRoutes_default = router11;

// src/routes/defenseResultRoutes.ts
import express12 from "express";

// src/controllers/defenseResultController.ts
import asyncHandler12 from "express-async-handler";
var getDefenseResultsForSupervisor = asyncHandler12(async (req, res) => {
  const supervisorId = req.user._id;
  const { filter, defenseType, thesisCycleId } = req.query;
  try {
    let proposalQuery = {
      status: "Approved",
      defenseBoardId: { $ne: null }
    };
    if (thesisCycleId) proposalQuery.cohort = thesisCycleId;
    if (filter === "my_supervision") {
      proposalQuery.$and = [
        { supervisorId },
        { courseSupervisorId: null }
      ];
    } else if (filter === "my_course_supervision") {
      proposalQuery.courseSupervisorId = supervisorId;
    } else {
      proposalQuery.$or = [
        { supervisorId },
        { courseSupervisorId: supervisorId }
      ];
    }
    const proposals = await Proposal_default.find(proposalQuery).select("_id");
    const relevantProposalIds = proposals.map((p) => p._id);
    if (relevantProposalIds.length === 0) {
      return res.json([]);
    }
    let defenseBoardQuery = { groups: { $in: relevantProposalIds } };
    if (defenseType) {
      defenseBoardQuery.defenseType = defenseType;
    }
    const defenseBoards = await DefenseBoard_default.find(defenseBoardQuery).populate("boardMembers", "name").populate("room", "name").populate("schedule", "startTime endTime").populate({
      path: "comments.commentedBy",
      select: "name"
    });
    const defenseResults = [];
    for (const board of defenseBoards) {
      for (const proposalId of board.groups) {
        if (relevantProposalIds.some((id) => id.equals(proposalId))) {
          const proposal = await Proposal_default.findById(proposalId).populate("members", "name studentId").populate("supervisorId", "name").populate("courseSupervisorId", "name");
          if (proposal) {
            const groupComments = board.comments.filter(
              (comment) => comment.group.toString() === proposal._id.toString()
            );
            defenseResults.push({
              _id: proposal._id,
              title: proposal.title,
              type: proposal.type,
              students: proposal.members.map((m) => ({
                name: m.name,
                studentId: m.studentId
              })),
              boardMembers: board.boardMembers.map((bm) => bm.name),
              comments: groupComments.map((c) => ({
                text: c.text,
                commentedBy: c.commentedBy ? c.commentedBy.name : "Unknown"
              }))
            });
          }
        }
      }
    }
    res.json(defenseResults);
  } catch (error) {
    console.error("Error in getDefenseResultsForSupervisor:", error);
    res.status(500).json({ message: error.message, stack: error.stack });
  }
});

// src/routes/defenseResultRoutes.ts
var router12 = express12.Router();
router12.route("/supervisor").get(protect, authorizeRoles("supervisor"), getDefenseResultsForSupervisor);
var defenseResultRoutes_default = router12;

// src/routes/evaluationRoutes.ts
import express13 from "express";

// src/controllers/evaluationController.ts
import asyncHandler13 from "express-async-handler";
var submitOrUpdateEvaluation = asyncHandler13(async (req, res) => {
  let { studentId, proposalId, defenseType, marks, comments, evaluationType } = req.body;
  const evaluatorId = req.user._id;
  console.log("[submitOrUpdateEvaluation] Incoming data:", { studentId, proposalId, defenseType, marks, comments, evaluationType, evaluatorId });
  console.log("[submitOrUpdateEvaluation] Evaluation Model defenseType enum values:", Evaluation_default.schema.path("defenseType").enumValues);
  let canonicalDefenseType;
  if (defenseType.toLowerCase().includes("pre")) {
    canonicalDefenseType = "Pre-Defense";
  } else if (defenseType.toLowerCase().includes("final")) {
    canonicalDefenseType = "Final Defense";
  } else {
    canonicalDefenseType = defenseType;
  }
  if (defenseType !== canonicalDefenseType) {
    console.log(`[submitOrUpdateEvaluation] Converting defenseType from '${defenseType}' to '${canonicalDefenseType}'`);
    defenseType = canonicalDefenseType;
  }
  if (!studentId || !proposalId || !defenseType || !evaluationType || marks === void 0) {
    res.status(400);
    throw new Error("Please provide all required evaluation fields.");
  }
  const student = await User_default.findById(studentId);
  const proposal = await Proposal_default.findById(proposalId).populate("supervisorId", "_id").populate("coSupervisors", "_id");
  if (!student || !proposal) {
    console.log("[submitOrUpdateEvaluation] Student or Proposal not found.");
    res.status(404);
    throw new Error("Student or Proposal not found.");
  }
  console.log("[submitOrUpdateEvaluation] Proposal fetched:", {
    proposalId: proposal._id,
    proposalSupervisorId: proposal.supervisorId?._id || proposal.supervisorId,
    evaluatorId
  });
  const proposalSupId = proposal.supervisorId?._id || proposal.supervisorId;
  const isSupervisor = proposalSupId.equals(evaluatorId) || proposal.coSupervisors && proposal.coSupervisors.some((coSup) => (coSup._id || coSup).equals(evaluatorId));
  console.log(`[submitOrUpdateEvaluation] isSupervisor check: ${isSupervisor}`);
  let isCommitteeMemberOnBoard = false;
  if (proposal.defenseBoardId) {
    const board = await DefenseBoard_default.findById(proposal.defenseBoardId);
    if (board && board.boardMembers.some((memberId) => memberId.equals(evaluatorId))) {
      isCommitteeMemberOnBoard = true;
    }
  }
  let userEvaluationType;
  if (evaluationType === "supervisor" && isSupervisor) {
    userEvaluationType = "supervisor";
  } else if (evaluationType === "committee" && (isCommitteeMemberOnBoard || req.user.role === "committee")) {
    userEvaluationType = "committee";
  } else {
    if (evaluationType === "supervisor" && !isSupervisor && isCommitteeMemberOnBoard) {
      userEvaluationType = "committee";
    } else if (evaluationType === "committee" && !isCommitteeMemberOnBoard && isSupervisor) {
      userEvaluationType = "supervisor";
    } else {
      console.log("[submitOrUpdateEvaluation] Not authorized:", { evaluatorRole: req.user.role, evaluationType, isSupervisor, isCommitteeMemberOnBoard });
      res.status(403);
      throw new Error("Not authorized to evaluate this student for the given role.");
    }
  }
  let maxAllowed = 0;
  if (userEvaluationType === "supervisor") {
    maxAllowed = defenseType === "Pre-Defense" ? 20 : 40;
  } else {
    maxAllowed = defenseType === "Pre-Defense" ? 10 : 30;
  }
  if (marks < 0 || marks > maxAllowed) {
    res.status(400);
    throw new Error(`Invalid marks. For ${userEvaluationType} (${defenseType}), marks must be between 0 and ${maxAllowed}.`);
  }
  const evaluationData = {
    student: studentId,
    evaluator: evaluatorId,
    proposal: proposalId,
    cohort: proposal.cohort || null,
    defenseType,
    evaluationType: userEvaluationType,
    marks,
    comments
  };
  console.log("[submitOrUpdateEvaluation] Processed evaluationData:", evaluationData);
  const existingEvaluation = await Evaluation_default.findOne({
    student: studentId,
    evaluator: evaluatorId,
    proposal: proposalId,
    defenseType,
    evaluationType: userEvaluationType
  });
  if (existingEvaluation) {
    console.log("[submitOrUpdateEvaluation] Updating existing evaluation:", existingEvaluation._id);
    existingEvaluation.marks = marks;
    existingEvaluation.comments = comments;
    console.log("[submitOrUpdateEvaluation] Data for update (before save):", { defenseType: existingEvaluation.defenseType, marks: existingEvaluation.marks });
    try {
      const updatedEvaluation = await existingEvaluation.save();
      console.log("[submitOrUpdateEvaluation] Updated evaluation:", updatedEvaluation);
      res.status(200).json(updatedEvaluation);
    } catch (updateError) {
      console.error("[submitOrUpdateEvaluation] Error updating existing evaluation:", updateError.message);
      if (updateError.name === "ValidationError") {
        res.status(400);
        throw new Error(`Validation Error: ${updateError.message}`);
      }
      res.status(500);
      throw new Error("Failed to update existing evaluation.");
    }
  } else {
    console.log("[submitOrUpdateEvaluation] Creating new evaluation.");
    console.log("[submitOrUpdateEvaluation] Data for creation (before create):", { defenseType: evaluationData.defenseType, marks: evaluationData.marks });
    try {
      const newEvaluation = await Evaluation_default.create(evaluationData);
      console.log("[submitOrUpdateEvaluation] Created new evaluation:", newEvaluation);
      res.status(201).json(newEvaluation);
    } catch (createError) {
      console.error("[submitOrUpdateEvaluation] Error creating new evaluation:", createError.message);
      if (createError.name === "ValidationError") {
        res.status(400);
        throw new Error(`Validation Error: ${createError.message}`);
      }
      res.status(500);
      throw new Error("Failed to create new evaluation.");
    }
  }
});
var getEvaluationsByProposal = asyncHandler13(async (req, res) => {
  const { proposalId } = req.params;
  const { defenseType } = req.query;
  const proposal = await Proposal_default.findById(proposalId).populate("members", "name email studentId");
  if (!proposal) {
    res.status(404);
    throw new Error("Proposal not found");
  }
  let query = { proposal: proposalId };
  if (defenseType) {
    query.defenseType = { $regex: new RegExp(`^${defenseType}$`, "i") };
  }
  const evaluations = await Evaluation_default.find(query).populate("evaluator", "name");
  const results = proposal.members.map((member) => {
    const studentEvals = evaluations.filter((e) => e.student.equals(member._id));
    return {
      student: member,
      evaluations: studentEvals
    };
  });
  res.status(200).json(results);
});
var getMyResults = asyncHandler13(async (req, res) => {
  const studentId = req.user._id;
  console.log(`[getMyResults] Fetching results for student: ${studentId}`);
  const publishedResult = await PublishedResult_default.findOne({ student: studentId }).populate("proposal", "title");
  console.log(`[getMyResults] PublishedResult found: ${publishedResult ? "Yes" : "No"}`);
  const evaluations = await Evaluation_default.find({ student: studentId }).populate("evaluator", "name role");
  console.log(`[getMyResults] Found ${evaluations.length} evaluations for student: ${studentId}`);
  const preDefenseComments = {
    supervisor: [],
    board: []
  };
  const finalDefenseComments = {
    supervisor: [],
    board: []
  };
  evaluations.forEach((e) => {
    if (e.comments) {
      const comment = {
        comment: e.comments,
        evaluator: e.evaluator.name
      };
      if (e.defenseType.match(/^Pre-Defense$/i)) {
        if (e.evaluationType === "supervisor") {
          preDefenseComments.supervisor.push(comment);
        } else if (e.evaluationType === "committee") {
          preDefenseComments.board.push(comment);
        }
      } else if (e.defenseType.match(/^Final Defense$/i)) {
        if (e.evaluationType === "supervisor") {
          finalDefenseComments.supervisor.push(comment);
        } else if (e.evaluationType === "committee") {
          finalDefenseComments.board.push(comment);
        }
      }
    }
  });
  if (publishedResult) {
    res.status(200).json({
      published: true,
      courseCode: publishedResult.courseCode,
      courseTitle: publishedResult.courseTitle,
      grade: publishedResult.grade,
      point: publishedResult.point,
      preDefenseComments,
      finalDefenseComments,
      message: "Result published successfully."
    });
  } else {
    res.status(200).json({
      published: false,
      preDefenseComments,
      finalDefenseComments,
      message: "Result not published yet due to incomplete evaluation."
    });
  }
});
var getBoardResults = asyncHandler13(async (req, res) => {
  const { defenseType, thesisCycleId } = req.query;
  if (!defenseType || !["Pre-Defense", "Final Defense"].includes(defenseType)) {
    res.status(400);
    throw new Error('Invalid or missing defense type. Must be "Pre-Defense" or "Final Defense".');
  }
  console.log(`[getBoardResults] Querying for defenseType: ${defenseType}`);
  let boardQuery = { defenseType: { $regex: new RegExp(`^${defenseType}$`, "i") } };
  if (thesisCycleId) {
    const proposalIds = await Proposal_default.find({ cohort: thesisCycleId }).distinct("_id");
    boardQuery.groups = { $in: proposalIds };
  }
  const boards = await DefenseBoard_default.find(boardQuery).sort({ boardNumber: 1 }).populate("boardMembers", "name email").populate({
    path: "schedule",
    select: "startTime endTime"
  }).populate("room", "name");
  console.log(`[getBoardResults] Found ${boards.length} boards for defenseType: ${defenseType}`);
  const boardResults = await Promise.all(
    boards.map(async (board) => {
      console.log(`[getBoardResults] Processing board ID: ${board._id}`);
      const proposals = await Proposal_default.find({ _id: { $in: board.groups } }).populate("members", "name email studentId").populate("supervisorId", "name email");
      console.log(`[getBoardResults] Found ${proposals.length} proposals for board ID ${board._id} (using board.groups)`);
      const proposalResults = await Promise.all(
        proposals.map(async (proposal) => {
          const studentResults = await Promise.all(
            proposal.members.map(async (member) => {
              const evaluations = await Evaluation_default.find({
                proposal: proposal._id,
                student: member._id,
                defenseType
              }).populate("evaluator", "name role");
              return {
                student: member,
                evaluations
              };
            })
          );
          return {
            proposal,
            students: studentResults
          };
        })
      );
      return {
        board,
        proposals: proposalResults
      };
    })
  );
  res.status(200).json(boardResults);
});
var publishAllResults = asyncHandler13(async (req, res) => {
  const { thesisCycleId } = req.body;
  const proposalFilter = { status: "Approved" };
  if (thesisCycleId) proposalFilter.cohort = thesisCycleId;
  const proposals = await Proposal_default.find(proposalFilter).populate("members");
  let publishedCount = 0;
  let alreadyPublishedCount = 0;
  let notPublishedCount = 0;
  for (const proposal of proposals) {
    console.log(`[publishAllResults] Processing Proposal: ${proposal.title} (ID: ${proposal._id}) with ${proposal.members.length} members.`);
    for (const student of proposal.members) {
      console.log(`[publishAllResults] Processing Student: ${student.name} (ID: ${student._id})`);
      const existingResult = await PublishedResult_default.findOne({ student: student._id });
      if (existingResult) {
        console.log(`[publishAllResults] Result for student ${student._id} already published.`);
        alreadyPublishedCount++;
        continue;
      }
      const evaluations = await Evaluation_default.find({
        proposal: proposal._id,
        student: student._id
      });
      const preDefenseSupervisor = evaluations.find((e) => e.evaluationType === "supervisor" && e.defenseType.match(/^Pre-Defense$/i));
      const preDefenseCommittee = evaluations.filter((e) => e.evaluationType === "committee" && e.defenseType.match(/^Pre-Defense$/i));
      const finalDefenseSupervisor = evaluations.find((e) => e.evaluationType === "supervisor" && e.defenseType.match(/^Final Defense$/i));
      const finalDefenseCommittee = evaluations.filter((e) => e.evaluationType === "committee" && e.defenseType.match(/^Final Defense$/i));
      console.log(`[publishAllResults] Eval counts for student ${student._id}: PreSup=${!!preDefenseSupervisor}, PreCom=${preDefenseCommittee.length}, FinalSup=${!!finalDefenseSupervisor}, FinalCom=${finalDefenseCommittee.length}`);
      if (preDefenseSupervisor && preDefenseCommittee.length > 0 && finalDefenseSupervisor && finalDefenseCommittee.length > 0) {
        const preDefenseCommitteeAvg = preDefenseCommittee.reduce((acc, e) => acc + e.marks, 0) / preDefenseCommittee.length;
        const finalDefenseCommitteeAvg = finalDefenseCommittee.reduce((acc, e) => acc + e.marks, 0) / finalDefenseCommittee.length;
        const totalMarks = preDefenseSupervisor.marks + preDefenseCommitteeAvg + finalDefenseSupervisor.marks + finalDefenseCommitteeAvg;
        const { grade, point } = gradeCalculator_default(totalMarks);
        try {
          await PublishedResult_default.create({
            student: student._id,
            proposal: proposal._id,
            grade,
            point,
            courseCode: "CSE 400A",
            courseTitle: "Capstone Project / Thesis"
          });
          console.log(`[publishAllResults] Successfully published result for student ${student._id} (Grade: ${grade}, Point: ${point}).`);
          publishedCount++;
        } catch (createError) {
          console.error(`[publishAllResults] Error creating PublishedResult for student ${student._id}: ${createError.message}`);
          if (createError.name === "ValidationError") {
            console.error(`Validation Error details: ${createError.message}`);
          }
          notPublishedCount++;
        }
      } else {
        console.log(`[publishAllResults] Not enough evaluations for student ${student._id} to publish result.`);
        notPublishedCount++;
      }
    }
  }
  console.log(`[publishAllResults] Publishing process finished. Published: ${publishedCount}, Already Published: ${alreadyPublishedCount}, Not Published: ${notPublishedCount}.`);
  res.status(200).json({
    message: "Result publishing process completed.",
    published: publishedCount,
    alreadyPublished: alreadyPublishedCount,
    notPublished: notPublishedCount
  });
});

// src/routes/evaluationRoutes.ts
var router13 = express13.Router();
router13.post("/", protect, submitOrUpdateEvaluation);
router13.get("/proposal/:proposalId", protect, getEvaluationsByProposal);
router13.get("/my-results", protect, getMyResults);
router13.get("/board-results", protect, committee, getBoardResults);
router13.post("/publish-all-results", protect, committee, publishAllResults);
var evaluationRoutes_default = router13;

// src/routes/adminRoutes.ts
import express14 from "express";

// src/models/Department.ts
import mongoose13 from "mongoose";
var DepartmentSchema = new mongoose13.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  abbreviation: {
    type: String,
    trim: true
  }
}, { timestamps: true });
var Department_default = mongoose13.model("Department", DepartmentSchema);

// src/models/CommitteeMember.ts
import mongoose14 from "mongoose";
var CommitteeMemberSchema = new mongoose14.Schema({
  userId: {
    type: mongoose14.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  departmentId: {
    type: mongoose14.Schema.Types.ObjectId,
    ref: "Department",
    required: true
  }
}, { timestamps: true });
CommitteeMemberSchema.index({ userId: 1, departmentId: 1 }, { unique: true });
var CommitteeMember_default = mongoose14.model("CommitteeMember", CommitteeMemberSchema);

// src/controllers/adminController.ts
import asyncHandler14 from "express-async-handler";
var createDepartment = asyncHandler14(async (req, res) => {
  const { name, abbreviation } = req.body;
  const departmentExists = await Department_default.findOne({ name });
  if (departmentExists) {
    res.status(400);
    throw new Error("Department already exists");
  }
  const department = await Department_default.create({ name, abbreviation });
  res.status(201).json(department);
});
var getDepartments = asyncHandler14(async (req, res) => {
  const departments = await Department_default.find({ name: { $ne: "Administration" } }).sort({ name: 1 });
  res.json(departments);
});
var updateDepartment = asyncHandler14(async (req, res) => {
  const department = await Department_default.findById(req.params.id);
  if (department) {
    department.name = req.body.name || department.name;
    if (req.body.abbreviation !== void 0) {
      department.abbreviation = req.body.abbreviation;
    }
    const updatedDepartment = await department.save();
    res.json(updatedDepartment);
  } else {
    res.status(404);
    throw new Error("Department not found");
  }
});
var deleteDepartment = asyncHandler14(async (req, res) => {
  const department = await Department_default.findById(req.params.id);
  if (department) {
    const usersInDept = await User_default.countDocuments({ department: department._id });
    if (usersInDept > 0) {
      res.status(400);
      throw new Error("Cannot delete department with assigned users");
    }
    await department.deleteOne();
    res.json({ message: "Department removed" });
  } else {
    res.status(404);
    throw new Error("Department not found");
  }
});
var createTeacher = asyncHandler14(async (req, res) => {
  const { name, email, password, departmentId, designation } = req.body;
  const userExists = await User_default.findOne({ email });
  if (userExists) {
    res.status(400);
    throw new Error("User already exists");
  }
  const teacher = await User_default.create({
    name,
    email,
    password,
    role: "supervisor",
    department: departmentId,
    designation
  });
  res.status(201).json(teacher);
});
var getTeachers = asyncHandler14(async (req, res) => {
  const { departmentId } = req.query;
  let query = { role: { $in: ["supervisor", "committee"] } };
  if (departmentId) {
    query.department = departmentId;
  }
  const teachers = await User_default.find(query).populate("department", "name").select("-password");
  res.json(teachers);
});
var updateTeacher = asyncHandler14(async (req, res) => {
  const teacher = await User_default.findById(req.params.id);
  if (teacher && teacher.role === "supervisor") {
    teacher.name = req.body.name || teacher.name;
    teacher.email = req.body.email || teacher.email;
    if (req.body.departmentId) {
      teacher.department = req.body.departmentId;
    }
    if (req.body.designation) {
      teacher.designation = req.body.designation;
    }
    if (req.body.password) {
      teacher.password = req.body.password;
    }
    const updatedTeacher = await teacher.save();
    res.json(updatedTeacher);
  } else {
    res.status(404);
    throw new Error("Teacher not found");
  }
});
var deleteTeacher = asyncHandler14(async (req, res) => {
  const teacher = await User_default.findById(req.params.id);
  if (teacher && teacher.role === "supervisor") {
    await teacher.deleteOne();
    res.json({ message: "Teacher removed" });
  } else {
    res.status(404);
    throw new Error("Teacher not found");
  }
});
var getStudents2 = asyncHandler14(async (req, res) => {
  const { departmentId } = req.query;
  let query = { role: "student" };
  if (departmentId) {
    query.department = departmentId;
  }
  const students = await User_default.find(query).populate("department", "name").select("-password");
  res.json(students);
});
var assignCommitteeMember = asyncHandler14(async (req, res) => {
  const { userId, departmentId } = req.body;
  const user = await User_default.findById(userId);
  if (!user || user.role !== "supervisor" && user.role !== "committee") {
    res.status(400);
    throw new Error("User must be a teacher (supervisor or committee) to be assigned to a committee");
  }
  const existing = await CommitteeMember_default.findOne({ userId, departmentId });
  if (existing) {
    res.status(400);
    throw new Error("User is already in the committee for this department");
  }
  const assignment = await CommitteeMember_default.create({ userId, departmentId });
  if (user.role === "supervisor") {
    user.role = "committee";
    await user.save();
  }
  res.status(201).json(assignment);
});
var getCommitteeAssignments = asyncHandler14(async (req, res) => {
  const { departmentId } = req.query;
  let query = {};
  if (departmentId) {
    query.departmentId = departmentId;
  }
  const assignments = await CommitteeMember_default.find(query).populate("userId", "name email").populate("departmentId", "name");
  res.json(assignments);
});
var removeCommitteeAssignment = asyncHandler14(async (req, res) => {
  const assignment = await CommitteeMember_default.findById(req.params.id);
  if (assignment) {
    const userId = assignment.userId;
    await assignment.deleteOne();
    const remaining = await CommitteeMember_default.countDocuments({ userId });
    if (remaining === 0) {
      const user = await User_default.findById(userId);
      if (user && user.role === "committee") {
        user.role = "supervisor";
        await user.save();
      }
    }
    res.json({ message: "Committee assignment removed" });
  } else {
    res.status(404);
    throw new Error("Assignment not found");
  }
});
var getAdminStats = asyncHandler14(async (req, res) => {
  const deptCount = await Department_default.countDocuments({});
  const teacherCount = await User_default.countDocuments({ role: "supervisor" });
  const studentCount = await User_default.countDocuments({ role: "student" });
  const committeeCount = await CommitteeMember_default.countDocuments({});
  res.json({
    deptCount,
    teacherCount,
    studentCount,
    committeeCount
  });
});
var getCycleAnalytics = asyncHandler14(async (req, res) => {
  const { cycleId } = req.params;
  const cycles = cycleId ? [await ThesisCycle_default.findById(cycleId)].filter(Boolean) : await ThesisCycle_default.find({}).sort({ createdAt: -1 });
  const results = [];
  for (const cycle of cycles) {
    const cycleIdStr = cycle._id.toString();
    const totalProposals = await Proposal_default.countDocuments({ cohort: cycleIdStr });
    const approvedProposals = await Proposal_default.countDocuments({ cohort: cycleIdStr, status: "Approved" });
    const pendingProposals = await Proposal_default.countDocuments({
      cohort: cycleIdStr,
      status: { $in: ["Pending Committee", "Pending Supervisor"] }
    });
    const notApproved = await Proposal_default.countDocuments({ cohort: cycleIdStr, status: "Not Approved" });
    const defenseBoards = await DefenseBoard_default.countDocuments({ cohort: cycleIdStr });
    const evaluations = await Evaluation_default.countDocuments({ cohort: cycleIdStr });
    const publishedResults = await PublishedResult_default.countDocuments({ cohort: cycleIdStr });
    results.push({
      _id: cycle._id,
      name: cycle.name,
      startSemester: cycle.startSemester,
      endSemester: cycle.endSemester,
      status: cycle.status,
      archived: cycle.archived,
      stats: {
        totalProposals,
        approvedProposals,
        pendingProposals,
        notApproved,
        defenseBoards,
        evaluations,
        publishedResults
      }
    });
  }
  res.json(cycleId ? results[0] || null : results);
});

// src/routes/adminRoutes.ts
var router14 = express14.Router();
router14.get("/departments/public", getDepartments);
router14.use(protect);
router14.use(authorizeRoles("admin"));
router14.get("/stats", getAdminStats);
router14.route("/departments").post(createDepartment).get(getDepartments);
router14.route("/departments/:id").put(updateDepartment).delete(deleteDepartment);
router14.route("/teachers").post(createTeacher).get(getTeachers);
router14.route("/teachers/:id").put(updateTeacher).delete(deleteTeacher);
router14.get("/students", getStudents2);
router14.route("/committee").post(assignCommitteeMember).get(getCommitteeAssignments);
router14.delete("/committee/:id", removeCommitteeAssignment);
router14.get("/cycle-stats", getCycleAnalytics);
router14.get("/cycle-stats/:cycleId", getCycleAnalytics);
var adminRoutes_default = router14;

// src/routes/publicRoutes.ts
import express15 from "express";

// src/controllers/publicController.ts
import asyncHandler15 from "express-async-handler";
function generateAbbreviation(name) {
  const words = name.replace(/[&]/g, "").split(/\s+/).filter((w) => w.length > 0 && !["and", "of", "the", "in", "for"].includes(w.toLowerCase().replace(/[^a-z]/g, "")));
  if (words.length === 0) return name;
  if (words.length === 1) return words[0];
  if (words.length >= 3) {
    return words.map((w) => w[0].toUpperCase()).join("");
  }
  const second = words[1].toLowerCase();
  if (["engineering", "department", "administration"].includes(second)) {
    if (words[0].toLowerCase() === "business") return "BBA";
    return words[0];
  }
  return words.map((w) => w[0].toUpperCase()).join("");
}
var getPublicDepartments = asyncHandler15(async (req, res) => {
  const departments = await Department_default.find({ name: { $ne: "Administration" } }).sort({ name: 1 });
  const departmentsWithMeta = await Promise.all(
    departments.map(async (dept) => {
      const supervisorCount = await User_default.countDocuments({
        role: "supervisor",
        department: dept._id
      });
      return {
        _id: dept._id,
        name: dept.name,
        abbreviation: dept.abbreviation || generateAbbreviation(dept.name),
        supervisorCount
      };
    })
  );
  res.json(departmentsWithMeta);
});
var getPublicResearchCells = asyncHandler15(async (req, res) => {
  const cells = await ResearchCell_default.find({}).sort({ title: 1 });
  res.json(cells);
});
var getFacultyByDepartment = asyncHandler15(async (req, res) => {
  const { departmentId } = req.params;
  const faculty = await User_default.find({
    role: "supervisor",
    department: departmentId
  }).select("-password").populate("researchCells", "title").sort({ name: 1 });
  res.json(faculty);
});
var getPublicFacultyProfile = asyncHandler15(async (req, res) => {
  const faculty = await User_default.findById(req.params.id).select("-password").populate("department", "name abbreviation").populate("researchCells", "title");
  if (faculty && (faculty.role === "supervisor" || faculty.role === "committee")) {
    res.json(faculty);
  } else {
    res.status(404);
    throw new Error("Faculty member not found");
  }
});
var getPublicNotices = asyncHandler15(async (req, res) => {
  const { limit } = req.query;
  const notices = await Notice_default.find({}).populate("sender", "name role").sort({ createdAt: -1 });
  const committeeNotices = notices.filter((n) => n.sender && n.sender.role === "committee");
  if (limit) {
    return res.json(committeeNotices.slice(0, Number(limit)));
  }
  res.json(committeeNotices);
});
var getPublicNoticeById = asyncHandler15(async (req, res) => {
  const notice = await Notice_default.findById(req.params.id).populate("sender", "name role");
  if (!notice || !notice.sender || notice.sender.role !== "committee") {
    res.status(404);
    throw new Error("Notice not found");
  }
  res.json(notice);
});
var getPublicStats = asyncHandler15(async (req, res) => {
  const studentCount = await User_default.countDocuments({ role: "student" });
  const supervisorCount = await User_default.countDocuments({ role: "supervisor" });
  const deptCount = await Department_default.countDocuments({});
  const proposalCount = await Proposal_default.countDocuments({});
  res.json({
    studentCount,
    supervisorCount,
    deptCount,
    proposalCount
  });
});

// src/controllers/thesisCycleController.ts
import asyncHandler16 from "express-async-handler";
var isRegistrationOpen2 = (cycle) => {
  if (!cycle || cycle.archived) return false;
  if (cycle.status === "Closed") return false;
  if (cycle.proposalSubmissionOpen === true) return true;
  const now = /* @__PURE__ */ new Date();
  const start = cycle.registrationStartDate ? new Date(cycle.registrationStartDate) : null;
  const end = cycle.registrationEndDate ? new Date(cycle.registrationEndDate) : null;
  if (start || end) {
    if (start && now < start) return false;
    if (end && now > end) return false;
    return true;
  }
  return cycle.status === "Active";
};
var createThesisCycle = asyncHandler16(async (req, res) => {
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
    proposalSubmissionDeadline
  } = req.body;
  if (!name) {
    res.status(400);
    throw new Error("Cohort name is required");
  }
  const existing = await ThesisCycle_default.findOne({ name });
  if (existing) {
    res.status(400);
    throw new Error("A cohort with this name already exists");
  }
  const cycle = await ThesisCycle_default.create({
    name,
    academicYear: academicYear || semester || "",
    semester: semester || "",
    startSemester,
    endSemester,
    registrationStartDate: registrationStartDate ? new Date(registrationStartDate) : void 0,
    registrationEndDate: registrationEndDate ? new Date(registrationEndDate) : void 0,
    status: status || "Upcoming",
    proposalSubmissionOpen: !!proposalSubmissionOpen,
    proposalSubmissionDeadline: proposalSubmissionDeadline ? new Date(proposalSubmissionDeadline) : void 0,
    createdBy: req.user._id
  });
  res.status(201).json(cycle);
});
var getThesisCycles = asyncHandler16(async (req, res) => {
  const cycles = await ThesisCycle_default.find({}).sort({ createdAt: -1 });
  res.json(cycles);
});
var getThesisCycleById = asyncHandler16(async (req, res) => {
  const cycle = await ThesisCycle_default.findById(req.params.id);
  if (!cycle) {
    res.status(404);
    throw new Error("Cohort not found");
  }
  res.json(cycle);
});
var updateThesisCycle = asyncHandler16(async (req, res) => {
  const cycle = await ThesisCycle_default.findById(req.params.id);
  if (!cycle) {
    res.status(404);
    throw new Error("Cohort not found");
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
    archived
  } = req.body;
  if (name !== void 0) {
    const duplicate = await ThesisCycle_default.findOne({ name, _id: { $ne: cycle._id } });
    if (duplicate) {
      res.status(400);
      throw new Error("A cohort with this name already exists");
    }
    cycle.name = name;
  }
  if (academicYear !== void 0) cycle.academicYear = academicYear;
  if (semester !== void 0) cycle.semester = semester;
  if (startSemester !== void 0) cycle.startSemester = startSemester;
  if (endSemester !== void 0) cycle.endSemester = endSemester;
  if (registrationStartDate !== void 0) cycle.registrationStartDate = registrationStartDate ? new Date(registrationStartDate) : void 0;
  if (registrationEndDate !== void 0) cycle.registrationEndDate = registrationEndDate ? new Date(registrationEndDate) : void 0;
  if (status !== void 0) cycle.status = status;
  if (proposalSubmissionOpen !== void 0) cycle.proposalSubmissionOpen = !!proposalSubmissionOpen;
  if (proposalSubmissionDeadline !== void 0) cycle.proposalSubmissionDeadline = proposalSubmissionDeadline ? new Date(proposalSubmissionDeadline) : void 0;
  if (archived !== void 0) cycle.archived = !!archived;
  const updated = await cycle.save();
  res.json(updated);
});
var getOpenForRegistration = asyncHandler16(async (req, res) => {
  const cycles = await ThesisCycle_default.find({ archived: false }).sort({ registrationStartDate: 1 });
  const open = cycles.filter((c) => isRegistrationOpen2(c)).map((c) => ({
    _id: c._id,
    name: c.name,
    academicYear: c.academicYear,
    semester: c.semester,
    registrationStartDate: c.registrationStartDate,
    registrationEndDate: c.registrationEndDate,
    status: c.status
  }));
  res.json(open);
});
var getMyCohort = asyncHandler16(async (req, res) => {
  if (!req.user.cohort) {
    return res.json(null);
  }
  const cycle = await ThesisCycle_default.findById(req.user.cohort);
  if (!cycle) {
    return res.json(null);
  }
  res.json(cycle);
});
var archiveThesisCycle = asyncHandler16(async (req, res) => {
  const cycle = await ThesisCycle_default.findById(req.params.id);
  if (!cycle) {
    res.status(404);
    throw new Error("Cohort not found");
  }
  cycle.archived = !cycle.archived;
  const updated = await cycle.save();
  res.json(updated);
});
var setActiveCohort = asyncHandler16(async (req, res) => {
  const cycle = await ThesisCycle_default.findById(req.params.id);
  if (!cycle) {
    res.status(404);
    throw new Error("Cohort not found");
  }
  await ThesisCycle_default.updateMany(
    { _id: { $ne: cycle._id }, status: "Active" },
    { status: "Upcoming" }
  );
  cycle.status = "Active";
  cycle.archived = false;
  const updated = await cycle.save();
  res.json(updated);
});
var setProposalSubmission = asyncHandler16(async (req, res) => {
  const cycle = await ThesisCycle_default.findById(req.params.id);
  if (!cycle) {
    res.status(404);
    throw new Error("Cohort not found");
  }
  const { open, proposalSubmissionDeadline } = req.body;
  if (open !== void 0) cycle.proposalSubmissionOpen = !!open;
  if (proposalSubmissionDeadline !== void 0) {
    cycle.proposalSubmissionDeadline = proposalSubmissionDeadline ? new Date(proposalSubmissionDeadline) : void 0;
  }
  const updated = await cycle.save();
  res.json(updated);
});
var setRegistrationWindow = asyncHandler16(async (req, res) => {
  const cycle = await ThesisCycle_default.findById(req.params.id);
  if (!cycle) {
    res.status(404);
    throw new Error("Cohort not found");
  }
  const { registrationStartDate, registrationEndDate } = req.body;
  if (registrationStartDate !== void 0) {
    cycle.registrationStartDate = registrationStartDate ? new Date(registrationStartDate) : void 0;
  }
  if (registrationEndDate !== void 0) {
    cycle.registrationEndDate = registrationEndDate ? new Date(registrationEndDate) : void 0;
  }
  const updated = await cycle.save();
  res.json(updated);
});
var getActiveCohort = asyncHandler16(async (req, res) => {
  const active = await ThesisCycle_default.findOne({ status: "Active", archived: false });
  if (!active) {
    return res.json(null);
  }
  res.json(active);
});
var getPublicThesisCycles = asyncHandler16(async (req, res) => {
  const cycles = await ThesisCycle_default.find({
    archived: false,
    proposalSubmissionOpen: true
  }).sort({ createdAt: -1 });
  res.json(cycles);
});

// src/routes/publicRoutes.ts
var router15 = express15.Router();
router15.get("/thesis-cycles", getPublicThesisCycles);
router15.get("/departments", getPublicDepartments);
router15.get("/research-cells", getPublicResearchCells);
router15.get("/notices", getPublicNotices);
router15.get("/notices/:id", getPublicNoticeById);
router15.get("/stats", getPublicStats);
router15.get("/faculty/:departmentId", getFacultyByDepartment);
router15.get("/faculty/profile/:id", getPublicFacultyProfile);
var publicRoutes_default = router15;

// src/routes/aiRoutes.ts
import express16 from "express";

// src/controllers/aiController.ts
import asyncHandler17 from "express-async-handler";
import axios from "axios";
var AI_TIMEOUT = 2e4;
var CLIENT_URL = process.env.FRONTEND_URL || process.env.CLIENT_URL || "http://localhost:3000";
var CHAT_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "meta-llama/llama-4-maverick:free"
];
var callOpenRouter = async (apiKey, model, messages) => {
  return axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    { model, messages },
    {
      timeout: AI_TIMEOUT,
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": CLIENT_URL,
        "X-Title": "ThesPro AI Assistant"
      }
    }
  );
};
var chatWithAI = asyncHandler17(async (req, res) => {
  const { message, chatHistory } = req.body;
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("OPENROUTER_API_KEY is not defined");
    res.status(500);
    throw new Error("AI service is not configured. Please contact the administrator.");
  }
  if (!message || !message.trim()) {
    res.status(400);
    throw new Error("Message is required.");
  }
  const messages = [
    {
      role: "system",
      content: "You are a helpful academic assistant for ThesPro, a thesis management system. Assist students with thesis topics, proposal writing, and general academic guidance."
    },
    ...chatHistory || [],
    { role: "user", content: message }
  ];
  let lastError = null;
  for (const model of CHAT_MODELS) {
    try {
      const response = await callOpenRouter(apiKey, model, messages);
      const aiResponse = response.data.choices[0].message.content;
      console.log(`[AI] Request handled by model: ${model}`);
      res.json({ response: aiResponse });
      return;
    } catch (error) {
      const status = error.response?.status;
      const errMsg = error.response?.data?.error?.message || "";
      if (error.code === "ECONNABORTED") {
        console.warn(`Model ${model} timed out after ${AI_TIMEOUT / 1e3}s, trying next...`);
        lastError = error;
        continue;
      }
      if (status === 404 || status === 400 && (errMsg.includes("endpoint") || errMsg.includes("model"))) {
        console.warn(`Model ${model} unavailable, trying next...`);
        lastError = error;
        continue;
      }
      if (status === 429) {
        console.warn(`Rate limited on model ${model}, trying next...`);
        lastError = error;
        continue;
      }
      console.error(`OpenRouter Error [${model}]:`, error.response?.data || error.message);
      res.status(status || 503);
      throw new Error(errMsg || "AI service error. Please try again later.");
    }
  }
  const fallbackMsg = lastError?.code === "ECONNABORTED" ? "The AI service is taking too long to respond. Please try again later." : "AI assistant is temporarily unavailable. Please try again later.";
  console.error("All AI models exhausted:", lastError?.response?.data || lastError?.message);
  res.status(503);
  throw new Error(fallbackMsg);
});
var generateProposalDescription = asyncHandler17(async (req, res) => {
  const { title } = req.body;
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    res.status(500);
    throw new Error("AI service is not configured. Please contact the administrator.");
  }
  if (!title || !title.trim()) {
    res.status(400);
    throw new Error("Title is required.");
  }
  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "google/gemini-2.0-flash-001",
        messages: [
          {
            role: "system",
            content: "You are an academic writing expert. Given a thesis or project title, generate a professional, concise, and engaging abstract/description (approximately 100-150 words). Focus on the core objectives and potential impact."
          },
          { role: "user", content: `Generate a proposal description for the title: "${title}"` }
        ]
      },
      {
        timeout: AI_TIMEOUT,
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": CLIENT_URL,
          "X-Title": "ThesPro AI Assistant"
        }
      }
    );
    const description = response.data.choices[0].message.content;
    res.json({ description });
  } catch (error) {
    const status = error.response?.status;
    const errMsg = error.response?.data?.error?.message || "";
    if (error.code === "ECONNABORTED") {
      res.status(504);
      throw new Error("AI service request timed out. Please try again.");
    }
    console.error("OpenRouter Error:", error.response?.data || error.message);
    res.status(status || 503);
    throw new Error(errMsg || "Failed to generate description with AI. Please try again.");
  }
});

// src/routes/aiRoutes.ts
var router16 = express16.Router();
router16.post("/chat", chatWithAI);
router16.post("/generate-description", protect, generateProposalDescription);
var aiRoutes_default = router16;

// src/routes/thesisCycleRoutes.ts
import express17 from "express";
var router17 = express17.Router();
router17.get("/open-for-registration", getOpenForRegistration);
router17.get("/active", protect, getActiveCohort);
router17.get("/me", protect, getMyCohort);
router17.use(protect);
router17.route("/").post(authorizeRoles("admin"), createThesisCycle).get(authorizeRoles("admin"), getThesisCycles);
router17.get("/:id", getThesisCycleById);
router17.put("/:id/proposal-submission", authorizeRoles("committee"), setProposalSubmission);
router17.put("/:id/registration", authorizeRoles("admin"), setRegistrationWindow);
router17.put("/:id/activate", authorizeRoles("admin"), setActiveCohort);
router17.patch("/:id/archive", authorizeRoles("admin"), archiveThesisCycle);
router17.put("/:id", authorizeRoles("admin"), updateThesisCycle);
var thesisCycleRoutes_default = router17;

// src/app.ts
var checkEnv = () => {
  const requiredEnv = ["MONGO_URI", "JWT_SECRET", "FRONTEND_URL"];
  const missing = requiredEnv.filter((env) => !process.env[env]);
  if (missing.length > 0) {
    console.error(`WARNING: Missing critical environment variables: ${missing.join(", ")}`);
  }
};
checkEnv();
var app = express18();
var allowedOrigins = process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : ["http://localhost:3000"];
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express18.json());
var cached = global.mongooseCache;
if (!cached) {
  cached = global.mongooseCache = { conn: null, promise: null };
}
app.use(async (req, res, next) => {
  if (cached.conn) {
    return next();
  }
  if (!process.env.MONGO_URI) {
    console.error("FATAL: MONGO_URI is missing in environment variables");
    return res.status(500).json({ message: "Internal Server Error: DB configuration missing" });
  }
  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 5e3
    };
    cached.promise = mongoose15.connect(process.env.MONGO_URI, opts).then(async (mongoose16) => {
      console.log("MongoDB connected for serverless environment (cached)");
      try {
        const usersCol = mongoose16.connection.collection("users");
        await usersCol.dropIndex("studentId_1").catch(() => {
        });
        await usersCol.createIndex(
          { studentId: 1 },
          {
            unique: true,
            name: "studentId_1",
            partialFilterExpression: { role: "student", studentId: { $exists: true, $ne: null } }
          }
        ).catch(() => {
        });
      } catch (idxErr) {
        console.error("Index reconciliation warning (non-fatal):", idxErr);
      }
      return mongoose16;
    }).catch((err) => {
      cached.promise = null;
      console.error("MongoDB connection error:", err);
      throw err;
    });
  }
  try {
    cached.conn = await cached.promise;
    next();
  } catch (err) {
    next(err);
  }
});
app.use("/api/auth", authRoutes_default);
app.use("/api/researchcells", researchCellRoutes_default);
app.use("/api/proposals", proposalRoutes_default);
app.use("/api/users", userRoutes_default);
app.use("/api/notices", noticeRoutes_default);
app.use("/api/upload", uploadRoutes_default);
app.use("/api/committee", committeeRoutes_default);
app.use("/api/supervisor", supervisorRoutes_default);
app.use("/api/defenseboards", defenseBoardRoutes_default);
app.use("/api/rooms", roomRoutes_default);
app.use("/api/schedule-slots", scheduleSlotRoutes_default);
app.use("/api/defense-results", defenseResultRoutes_default);
app.use("/api/evaluations", evaluationRoutes_default);
app.use("/api/admin", adminRoutes_default);
app.use("/api/public", publicRoutes_default);
app.use("/api/thesis-cycles", thesisCycleRoutes_default);
app.use("/api/ai", aiRoutes_default);
app.get("/", (req, res) => {
  res.send("API is running...");
});
app.use((err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode);
  res.json({
    message: err.message,
    stack: process.env.NODE_ENV === "production" ? null : err.stack
  });
});
var app_default = app;

// src/index.ts
var index_default = app_default;
export {
  index_default as default
};
