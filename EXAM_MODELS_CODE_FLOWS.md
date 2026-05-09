# Exam Models - Code Flow Examples

## Flow 1: Admin Creates & Publishes Exam Schedule

### Frontend Code (ExamSchedules.jsx)

```jsx
// Step 1: User fills form
const formData = {
  title: '2024 Mid-Term Exams',
  examType: 'Mid-Term',
  class: '64a7f3b2c4d5e6f7g8h9i0j1', // Selected class
  term: 'First Term',
  academicYear: '2024',
  startDate: '2024-05-01',
  endDate: '2024-05-15',
  sessions: [
    {
      subject: '64a7f3b2c4d5e6f7g8h9i0j2', // Math
      date: '2024-05-01',
      startTime: '09:00 AM',
      endTime: '11:00 AM',
      duration: 120,
      venue: 'Hall A',
      invigilator: '64a7f3b2c4d5e6f7g8h9i0j3', // Teacher1
      maxMarks: 70,
      instructions: 'No calculators allowed',
    },
    {
      subject: '64a7f3b2c4d5e6f7g8h9i0j4', // English
      date: '2024-05-02',
      startTime: '09:00 AM',
      endTime: '11:00 AM',
      duration: 120,
      venue: 'Hall B',
      invigilator: '64a7f3b2c4d5e6f7g8h9i0j5', // Teacher2
      maxMarks: 70,
    },
  ],
};

// Step 2: Submit create request
const handleSubmit = async (e) => {
  e.preventDefault();
  try {
    await examScheduleService.create(formData);
    toast.success('Exam schedule created successfully');
    fetchSchedules();
  } catch (error) {
    toast.error(error.response?.data?.message);
  }
};
```

### Backend API Call (api.js)

```javascript
// Client sends POST request
const response = await api.post('/exam-schedules', formData);

// Headers include Authorization token:
// Authorization: Bearer eyJhbGc...

// Response:
{
  status: "success",
  statusCode: 201,
  message: "Exam schedule created successfully",
  data: {
    _id: "64a8f3b2c4d5e6f7g8h9i0j6",
    title: "2024 Mid-Term Exams",
    examType: "Mid-Term",
    class: {
      _id: "64a7f3b2c4d5e6f7g8h9i0j1",
      name: "JSS 1A",
      level: "Junior Secondary"
    },
    sessions: [
      {
        subject: { _id: "...", name: "Mathematics", code: "MTH101" },
        date: "2024-05-01T00:00:00.000Z",
        startTime: "09:00 AM",
        endTime: "11:00 AM",
        venue: "Hall A",
        invigilator: { _id: "...", firstName: "John", lastName: "Doe" },
        maxMarks: 70
      },
      // ...
    ],
    isPublished: false,
    createdBy: { _id: "...", firstName: "Admin", lastName: "User" },
    createdAt: "2024-05-01T10:30:00.000Z"
  }
}
```

### Backend Controller (examScheduleController.js)

```javascript
exports.createSchedule = async (req, res) => {
  try {
    // Calls service with user ID from auth middleware
    const schedule = await examScheduleService.createSchedule(
      req.body, // Form data
      req.user._id, // Admin's ID from JWT token
    );

    // Send success response
    sendSuccess(res, 201, 'Exam schedule created successfully', schedule);
  } catch (error) {
    sendError(res, error.message, 400);
  }
};
```

### Backend Service (examScheduleService.js)

```javascript
async createSchedule(data, userId) {
  // Create document in MongoDB
  const schedule = await ExamSchedule.create({
    ...data,
    createdBy: userId,
    isPublished: false,
    publishedAt: null
  });

  // Populate referenced fields for response
  await schedule.populate([
    { path: 'class', select: 'name level' },
    { path: 'sessions.subject', select: 'name code' },
    { path: 'sessions.invigilator', select: 'firstName lastName email' },
    { path: 'createdBy', select: 'firstName lastName' }
  ]);

  return schedule;
}
```

### Step 3: Admin Publishes Schedule

```jsx
// Frontend: Admin clicks publish button
const handlePublish = async (id) => {
  if (!window.confirm('Notify all students and teachers?')) return;

  try {
    await examScheduleService.publish(id);
    toast.success('Schedule published successfully');
    fetchSchedules();
  } catch (error) {
    toast.error('Failed to publish');
  }
};

// API call
examScheduleService.publish(id);
// → POST /exam-schedules/:id/publish
```

```javascript
// Backend: examScheduleController.publishSchedule()
exports.publishSchedule = async (req, res) => {
  try {
    const schedule = await examScheduleService.publishSchedule(
      req.params.id,
      req.user._id,
    );
    sendSuccess(
      res,
      201,
      'Schedule published and notifications sent',
      schedule,
    );
  } catch (error) {
    sendError(res, error.message, 400);
  }
};
```

```javascript
// Backend: examScheduleService.publishSchedule()
async publishSchedule(id, userId) {
  const schedule = await ExamSchedule.findById(id)
    .populate('class')
    .populate('sessions.subject')
    .populate('sessions.invigilator');

  if (!schedule) throw new Error('Schedule not found');
  if (schedule.isPublished) throw new Error('Already published');

  // Mark as published
  schedule.isPublished = true;
  schedule.publishedAt = new Date();
  await schedule.save();

  // Find all students in the class
  const students = await User.find({
    role: 'Student',
    'studentProfile.class': schedule.class._id,
    isActive: true
  });

  // Send email notifications to each student
  const emailPromises = students.map((student) =>
    notificationService.sendEmail({
      to: student.email,
      subject: `${schedule.examType} Schedule Published - ${schedule.title}`,
      template: 'examSchedulePublished',
      data: {
        studentName: `${student.firstName} ${student.lastName}`,
        examTitle: schedule.title,
        examType: schedule.examType,
        className: schedule.class.name,
        startDate: schedule.startDate.toLocaleDateString('en-NG'),
        endDate: schedule.endDate.toLocaleDateString('en-NG'),
        loginUrl: process.env.CLIENT_URL
      }
    })
  );

  // Notify invigilators too
  await Promise.allSettled(emailPromises);

  return schedule;
}
```

---

## Flow 2: Student Views Exam Schedule

### Frontend (StudentExamSchedule.jsx)

```jsx
const StudentExamSchedule = () => {
  const { user } = useAuthStore();
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [term, setTerm] = useState('First Term');
  const [academicYear, setAcademicYear] = useState('2024');

  // Fetch on mount or when filters change
  useEffect(() => {
    setLoading(true);

    // Call API with filters
    examScheduleService
      .getStudentSchedules({ term, academicYear })
      .then((response) => {
        setSchedules(response.data.data?.schedules || []);
      })
      .catch(() => toast.error('Failed to load schedules'))
      .finally(() => setLoading(false));
  }, [term, academicYear]);

  // Render schedule for each exam
  return (
    <div>
      {/* Filter controls */}
      <div>
        {TERMS.map((t) => (
          <button
            key={t}
            onClick={() => setTerm(t)}
            className={term === t ? 'active' : ''}
          >
            {t}
          </button>
        ))}
        <input
          value={academicYear}
          onChange={(e) => setAcademicYear(e.target.value)}
        />
      </div>

      {/* Display schedules */}
      {schedules.map((schedule) => (
        <div key={schedule._id} className="schedule-card">
          <h2>{schedule.title}</h2>
          <span className="badge">{schedule.examType}</span>

          {/* Sessions table */}
          <table>
            <thead>
              <tr>
                <th>Subject</th>
                <th>Date</th>
                <th>Time</th>
                <th>Venue</th>
                <th>Marks</th>
              </tr>
            </thead>
            <tbody>
              {schedule.sessions.map((session, idx) => (
                <tr key={idx}>
                  <td>
                    {session.subject?.name} ({session.subject?.code})
                  </td>
                  <td>{format(new Date(session.date), 'EEE, MMM dd')}</td>
                  <td>
                    {session.startTime} - {session.endTime}
                  </td>
                  <td>{session.venue}</td>
                  <td>{session.maxMarks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
};
```

### API Service Call (api.js)

```javascript
export const examScheduleService = {
  getStudentSchedules: (params) =>
    api.get('/exam-schedules/student/my-schedules', { params }),
};

// Makes request:
// GET /exam-schedules/student/my-schedules?term=First Term&academicYear=2024
// Headers: Authorization: Bearer <token>
```

### Backend Route (examSchedule.routes.js)

```javascript
router.get(
  '/student/my-schedules',
  protect, // Verify JWT token
  authorize('Student', 'Parent'), // Allow only students/parents
  examScheduleController.getSchedules, // Handler
);
```

### Backend Controller

```javascript
// Note: The actual implementation filters by student's class
// (parsed from req.user.studentProfile.class)
exports.getSchedules = async (req, res) => {
  try {
    const schedules = await examScheduleService.getSchedules(req.query);
    sendSuccess(res, 200, 'Schedules retrieved successfully', {
      schedules,
    });
  } catch (error) {
    sendError(res, error.message, 500);
  }
};
```

### Backend Service (examScheduleService.js)

```javascript
async getSchedules(filters = {}) {
  const query = {};

  if (filters.class) query.class = filters.class;
  if (filters.term) query.term = filters.term;
  if (filters.academicYear) query.academicYear = filters.academicYear;
  if (filters.examType) query.examType = filters.examType;

  // Query MongoDB
  const schedules = await ExamSchedule.find(query)
    .populate('class', 'name level')
    .populate('sessions.subject', 'name code')
    .populate('sessions.invigilator', 'firstName lastName email')
    .populate('createdBy', 'firstName lastName')
    .sort({ startDate: -1 });

  return schedules;
}
```

### Response Back to Student

```javascript
{
  status: "success",
  statusCode: 200,
  message: "Schedules retrieved successfully",
  data: {
    schedules: [
      {
        _id: "64a8f3b2c4d5e6f7g8h9i0j6",
        title: "2024 Mid-Term Exams",
        examType: "Mid-Term",
        class: {
          _id: "64a7f3b2c4d5e6f7g8h9i0j1",
          name: "JSS 1A",
          level: "Junior Secondary"
        },
        startDate: "2024-05-01T00:00:00.000Z",
        endDate: "2024-05-15T00:00:00.000Z",
        sessions: [
          {
            subject: {
              _id: "64a7f3b2c4d5e6f7g8h9i0j2",
              name: "Mathematics",
              code: "MTH101"
            },
            date: "2024-05-01T00:00:00.000Z",
            startTime: "09:00 AM",
            endTime: "11:00 AM",
            duration: 120,
            venue: "Hall A",
            invigilator: {
              _id: "64a7f3b2c4d5e6f7g8h9i0j3",
              firstName: "John",
              lastName: "Doe",
              email: "john@school.edu"
            },
            maxMarks: 70,
            instructions: "No calculators allowed"
          },
          // More sessions...
        ],
        isPublished: true,
        publishedAt: "2024-05-01T10:35:00.000Z"
      }
    ]
  }
}
```

---

## Flow 3: Teacher Views Invigilation Duties

### Frontend (TeacherExamSchedule.jsx)

```jsx
const TeacherExamSchedule = () => {
  const { user } = useAuthStore();
  const [invigilations, setInvigilations] = useState([]);
  const [term, setTerm] = useState('First Term');
  const [academicYear, setAcademicYear] = useState('2023/2024');

  useEffect(() => {
    // Fetch invigilations assigned to this teacher
    examScheduleService
      .getTeacherInvigilations({ term, academicYear })
      .then((r) => {
        setInvigilations(r.data.data?.schedules || []);
      })
      .catch(() => toast.error('Failed to load schedules'));
  }, [term, academicYear]);

  // Group by date
  const invigilationsByDate = invigilations.reduce((acc, schedule) => {
    schedule.sessions?.forEach((session) => {
      const dateKey = new Date(session.date).toDateString();
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push({
        ...session,
        className: schedule.class?.name,
      });
    });
    return acc;
  }, {});

  return (
    <div>
      {Object.keys(invigilationsByDate).map((dateStr) => (
        <div key={dateStr}>
          <h3>{format(new Date(dateStr), 'EEEE, dd MMMM yyyy')}</h3>

          {invigilationsByDate[dateStr].map((session, idx) => (
            <div key={idx} className="duty-card">
              <p>
                <strong>Subject:</strong> {session.subject?.name}
              </p>
              <p>
                <strong>Class:</strong> {session.className}
              </p>
              <p>
                <strong>Time:</strong> {session.startTime} - {session.endTime}
              </p>
              <p>
                <strong>Venue:</strong> {session.venue}
              </p>
              {session.instructions && (
                <p>
                  <strong>Instructions:</strong> {session.instructions}
                </p>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};
```

### API Call

```javascript
examScheduleService.getTeacherInvigilations({ term, academicYear });
// → GET /exam-schedules/teacher/invigilations?term=First Term&academicYear=2023/2024
// Headers: Authorization: Bearer <token> (with user ID from JWT)
```

### Backend Service Filter

```javascript
async getTeacherInvigilations(teacherId, filters = {}) {
  const query = {
    'sessions.invigilator': teacherId  // Match teacher ID
  };

  if (filters.term) query.term = filters.term;
  if (filters.academicYear) query.academicYear = filters.academicYear;

  const schedules = await ExamSchedule.find(query)
    .populate('class', 'name level')
    .populate('sessions.subject', 'name code')
    .populate('sessions.invigilator', 'firstName lastName email')
    .sort({ 'sessions.date': 1 });

  // Filter to only show this teacher's sessions
  const teacherSchedule = schedules
    .map((schedule) => {
      const relevantSessions = schedule.sessions.filter(
        (session) =>
          session.invigilator &&
          String(session.invigilator._id) === String(teacherId)
      );

      return {
        ...schedule.toObject(),
        sessions: relevantSessions
      };
    })
    .filter((schedule) => schedule.sessions.length > 0);

  return teacherSchedule;
}
```

---

## Summary of Data Flow

```
1. ADMIN CREATE SCHEDULE
   Frontend Form → examScheduleService.create()
   → POST /exam-schedules
   → Controller.createSchedule()
   → Service.createSchedule()
   → MongoDB ExamSchedule Collection
   ← Returns created schedule

2. ADMIN PUBLISH SCHEDULE
   Admin Click Publish → examScheduleService.publish()
   → POST /exam-schedules/:id/publish
   → Controller.publishSchedule()
   → Service.publishSchedule()
   → Update isPublished = true, publishedAt = now
   → Find all students & invigilators
   → Send email notifications
   ← Returns updated schedule

3. STUDENT VIEW SCHEDULE
   Student Load Page → examScheduleService.getStudentSchedules()
   → GET /exam-schedules/student/my-schedules?term=X&year=Y
   → Controller.getSchedules()
   → Service.getSchedules() with filters
   → MongoDB query with .populate()
   ← Returns array of schedules with populated details
   → Display in table format

4. TEACHER VIEW DUTIES
   Teacher Load Page → examScheduleService.getTeacherInvigilations()
   → GET /exam-schedules/teacher/invigilations?term=X&year=Y
   → Controller.getTeacherInvigilations()
   → Service.getTeacherInvigilations(teacherId)
   → Query schedules where teacher is invigilator
   → Filter to only this teacher's sessions
   ← Returns array of schedules grouped by date
   → Display organized by date
```
