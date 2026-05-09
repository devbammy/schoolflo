# Exam.js & ExamSchedule.js - Architecture Guide

## Overview

Your application has **two separate but complementary exam-related models**:

1. **Exam.js** - Manages individual exam sessions for specific subjects
2. **ExamSchedule.js** - Manages the overall exam timetable with multiple exam sessions

---

## 1. EXAM.JS Model

### Purpose

Represents an **individual exam session** for a specific class/subject/teacher combination.

### Fields

```javascript
{
  title: String,              // e.g., "Mathematics Final Exam"
  type: String,               // Enum: CA1, CA2, Mid-Term, Final
  term: String,               // Enum: First Term, Second Term, Third Term
  academicYear: String,       // e.g., "2024"
  class: ObjectId (Class),    // Reference to the class
  subject: ObjectId (Subject),// Reference to the subject
  teacher: ObjectId (User),   // Reference to the teacher who created it
  startDate: Date,            // When exam starts
  endDate: Date,              // When exam ends
  totalMarks: Number,         // Default: 100
  passMark: Number,           // Default: 40
  instructions: String,       // General exam instructions
  isPublished: Boolean,       // Default: false
  publishedAt: Date,
  timestamps: { created, updated }
}
```

### Relationships

- **One-to-One with Subject** (per class per term)
- **One-to-Many with Result** (each exam has multiple student results)

### Backend Routes (exams.js)

```
GET    /exams                          // List exams (filtered by class/term/year)
POST   /exams                          // Create exam (Admin/Teacher)
PUT    /exams/:id                      // Update exam (Admin/Teacher)
DELETE /exams/:id                      // Delete exam (Admin/Teacher)
```

### Frontend Integration

- **Frontend API Service**: `examService`
- **API Endpoints Used**:
  - `examService.getAll(params)`
  - `examService.create(data)`
  - `examService.update(id, data)`
  - `examService.delete(id)`

---

## 2. EXAMSCHEDULE.JS Model

### Purpose

Represents the **complete exam timetable** with multiple exam sessions scheduled across dates/times.

### Fields

```javascript
{
  title: String,                      // e.g., "2024 Final Exams"
  examType: String,                   // Enum: Mid-Term, Final Exam, Mock Exam, External Exam
  class: ObjectId (Class),            // Which class takes these exams
  term: String,                        // Enum: First Term, Second Term, Third Term
  academicYear: String,                // e.g., "2024"
  startDate: Date,                     // Exam period starts
  endDate: Date,                        // Exam period ends

  sessions: [                          // Array of individual exam sessions
    {
      subject: ObjectId (Subject),     // Subject being examined
      date: Date,                       // Specific date
      startTime: String,                // e.g., "09:00 AM"
      endTime: String,                  // e.g., "11:00 AM"
      duration: Number,                 // In minutes
      venue: String,                    // Room/location
      invigilator: ObjectId (User),    // Teacher supervising
      maxMarks: Number,                 // Default: 70 (for final exam)
      instructions: String,             // Session-specific notes
    }
  ],

  createdBy: ObjectId (User),          // Admin who created schedule
  isPublished: Boolean,                // Default: false
  publishedAt: Date,
  timestamps: { created, updated }
}
```

### Backend Routes (examSchedule.routes.js)

```
POST   /exam-schedules                           // Create schedule
GET    /exam-schedules                           // Get all schedules (with filters)
GET    /exam-schedules/:id                       // Get specific schedule
PUT    /exam-schedules/:id                       // Update schedule
POST   /exam-schedules/:id/publish               // Publish & notify (Admin only)
DELETE /exam-schedules/:id                       // Delete schedule (Admin only)
GET    /exam-schedules/teacher/invigilations     // Get teacher's duties
GET    /exam-schedules/student/my-schedules      // Get student's schedule
GET    /exam-schedules/parent/children-schedules // Get children's schedules
POST   /exam-schedules/check-conflicts           // Validate no overlaps
```

### Backend Service (examScheduleService.js)

```javascript
// Key methods:
createSchedule(data, userId); // Create schedule
getSchedules(filters); // Get with filters
getScheduleById(id); // Single schedule
updateSchedule(id, data); // Update
publishSchedule(id, userId); // Publish + send notifications
getTeacherInvigilations(teacherId); // Teacher's duties
deleteSchedule(id); // Delete
checkConflicts(classId, date, startTime, endTime); // Validate timing
```

### Frontend Integration

- **Frontend API Service**: `examScheduleService`
- **API Endpoints Used**:
  - `examScheduleService.create(data)`
  - `examScheduleService.getAll(params)`
  - `examScheduleService.getById(id)`
  - `examScheduleService.update(id, data)`
  - `examScheduleService.publish(id)`
  - `examScheduleService.delete(id)`
  - `examScheduleService.getTeacherInvigilations(params)`
  - `examScheduleService.getStudentSchedules(params)`
  - `examScheduleService.getParentSchedules(params)`
  - `examScheduleService.checkConflicts(data)`

---

## 3. Key Difference: EXAM vs EXAMSCHEDULE

| Aspect               | Exam.js                                             | ExamSchedule.js                                  |
| -------------------- | --------------------------------------------------- | ------------------------------------------------ |
| **Scope**            | Single exam per subject                             | Multiple subjects in one timetable               |
| **Type**             | Individual exam metadata                            | Overall exam period schedule                     |
| **Data Structure**   | Flat object                                         | Nested (sessions array)                          |
| **Use Case**         | Store exam details, grading                         | Display exam timetable to users                  |
| **Publishing**       | isPublished flag                                    | Notifies students & invigilators                 |
| **Frontend Pages**   | (Currently not directly used in student/teacher UI) | StudentExamSchedule.jsx, TeacherExamSchedule.jsx |
| **Data Granularity** | Class-level                                         | Session-level (date/time/venue)                  |

---

## 4. Frontend Architecture

### Admin Panel - Create Exam Schedule

**Page**: `client/src/pages/admin/ExamSchedules.jsx`

**Flow**:

1. Admin selects class → fetches subjects for that class
2. Admin adds sessions (subject, date, time, venue, invigilator)
3. Submits to backend: `POST /exam-schedules`
4. After creation, admin can publish
5. Publishing triggers notifications to students & invigilators

```jsx
const formData = {
  title: 'Mid-Term Exams',
  examType: 'Mid-Term', // Dropdown enum
  class: 'ClassID',
  term: 'First Term',
  academicYear: '2024',
  startDate: '2024-05-01',
  endDate: '2024-05-15',
  sessions: [
    // Dynamic array
    {
      subject: 'SubjectID',
      date: '2024-05-01',
      startTime: '09:00 AM',
      endTime: '11:00 AM',
      duration: 120,
      venue: 'Hall A',
      invigilator: 'TeacherID',
      maxMarks: 70,
    },
    // More sessions...
  ],
};
```

### Student View - See Exam Schedule

**Page**: `client/src/pages/student/StudentExamSchedule.jsx`

**Flow**:

1. Fetches schedules filtered by student's class, term, academic year
2. Calls: `examScheduleService.getStudentSchedules({ term, academicYear })`
3. Displays table of exams with:
   - Subject name & code
   - Date & time
   - Venue & marks

**Example Display**:

```
Exam Schedule - First Term 2024
┌─────────────┬──────────────┬──────────────┬─────────┬────────┐
│ Subject     │ Date         │ Time         │ Venue   │ Marks  │
├─────────────┼──────────────┼──────────────┼─────────┼────────┤
│ Mathematics │ Fri, May 01  │ 09:00 - 11:00│ Hall A  │ 70     │
│ English     │ Sat, May 02  │ 09:00 - 11:00│ Hall B  │ 70     │
│ Physics     │ Mon, May 04  │ 14:00 - 16:00│ Hall A  │ 70     │
└─────────────┴──────────────┴──────────────┴─────────┴────────┘
```

### Teacher View - See Invigilation Duties

**Page**: `client/src/pages/teacher/TeacherExamSchedule.jsx`

**Flow**:

1. Fetches invigilations assigned to teacher
2. Calls: `examScheduleService.getTeacherInvigilations({ term, academicYear })`
3. Groups by date and shows:
   - Subject & class
   - Time & duration
   - Venue
   - Special instructions

---

## 5. Result Model Connection

**File**: `backend/src/models/Exam.js` (also exports Result model)

```javascript
const ResultSchema = {
  student: ObjectId(User),
  class: ObjectId(Class),
  subject: ObjectId(Subject),
  exam: ObjectId(Exam), // ← Links to Exam.js
  term: String,
  academicYear: String,

  scores: {
    ca1: Number(0 - 10),
    ca2: Number(0 - 10),
    midTerm: Number(0 - 10),
    exam: Number(0 - 70),
  },

  totalScore: Number, // Auto-calculated: ca1+ca2+midTerm+exam
  grade: String(A - F), // Auto-calculated
  gradePoint: Number,
  // ... class stats, position, comments
};
```

**Grading Scale**:

- A: 70-100 (Distinction) → 5.0 grade points
- B: 60-69 (Credit) → 4.0
- C: 50-59 (Merit) → 3.0
- D: 45-49 (Pass) → 2.0
- E: 40-44 (Weak Pass) → 1.0
- F: 0-39 (Fail) → 0.0

---

## 6. Workflow Example: End-to-End

### Scenario: Create & Publish Mid-Term Exam Schedule

1. **Admin creates ExamSchedule**
   - Goes to: `/admin/exam-schedules`
   - Selects class, sets dates (May 1-15)
   - Adds sessions:
     - Math: May 1, 09:00-11:00, Hall A, Teacher1
     - English: May 2, 09:00-11:00, Hall B, Teacher2
   - Submits → `POST /exam-schedules`

2. **Backend creates schedule**
   - Validates class exists
   - Creates ExamSchedule document
   - Populates relationships (class name, subject names, invigilator details)

3. **Admin publishes schedule**
   - Clicks "Publish" → `POST /exam-schedules/{id}/publish`
   - Backend notifies:
     - All students in the class: "Your exam schedule is ready"
     - All invigilators: "You're assigned to exam duties"

4. **Students view schedule**
   - Go to: `/student/exam-schedule`
   - See table of all exams for their class
   - Prepare accordingly

5. **Teachers view duties**
   - Go to: `/teacher/invigilation-schedule`
   - See dates/times they must invigilate
   - Prepare exam halls

6. **Exam occurs**
   - Students take exams on scheduled dates/times/venues

7. **Teachers grade**
   - Use Exam.js to record individual exam scores
   - Results created with link to Exam document

8. **Students view results**
   - Scores populate from Result model
   - Grades calculated automatically

---

## 7. Current State & Potential Issues

### What's Working

✅ ExamSchedule model fully implemented (admin can create/publish/manage)  
✅ Student & teacher views of exam schedules  
✅ Notification system on publish  
✅ Conflict checking for exam timings

### What Might Need Clarification

⚠️ **Exam.js vs ExamSchedule.js relationship** - Currently they seem independent:

- Exam.js: Stores exam metadata (title, marks, pass mark)
- ExamSchedule.js: Stores timing/timetable info
- **Issue**: They're not directly linked. When you create an ExamSchedule session for Math, is it also creating an Exam record?

⚠️ **Grading Workflow**:

- Teachers enter scores into Result model
- Result links to Exam (optional field)
- But it's unclear if teachers first create Exam records, then grade

⚠️ **Frontend admin exam pages**:

- No page found in admin section specifically for managing Exam records separately
- Exams seem managed implicitly through ExamSchedule

---

## 8. Recommendations

1. **Clarify the relationship**:
   - Should creating an ExamSchedule session auto-create an Exam record?
   - Or should exams be created separately?

2. **Add exam management page for admins**:
   - Currently only ExamSchedules.jsx exists
   - Consider adding ExamsPage.jsx for Exam CRUD

3. **Link exam results to schedules**:
   - When viewing student results, show which exam schedule it belonged to

4. **Invigilator assignment validation**:
   - Prevent assigning same teacher to overlapping exam sessions

5. **Add parent-facing exam schedule**:
   - Currently only students & teachers see schedules
   - Parents should see children's exam schedules
