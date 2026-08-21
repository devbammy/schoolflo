const AuditLog = require('../models/AuditLog');
const {
  sendSuccess,
  sendPaginated,
  getPaginationParams,
} = require('../utils/apiResponse');

const ACTOR_POPULATE = {
  path: 'actor',
  select: 'firstName lastName role email',
};
const SUBJECT_POPULATE = {
  path: 'subject',
  select: 'firstName lastName studentProfile.admissionNumber',
};

/**
 * Reading the audit log. There is deliberately no write, update or delete
 * endpoint — entries are created by the actions they describe, and nothing in
 * the API can alter them afterwards.
 *
 * Admin-only throughout: the log records who did what to whom, which is more
 * sensitive than most of the data it describes.
 */

// @desc    Search the audit log
// @route   GET /api/v1/audit
// @access  Admin
const getAuditLog = async (req, res) => {
  const { action, entity, entityId, actor, subject, outcome, from, to } =
    req.query;
  const { page, limit, skip } = getPaginationParams(req.query);

  const filter = {};

  // `action` matches by prefix so 'result' finds result.create, result.update
  // and result.publish without the caller needing to know the full list.
  if (action)
    filter.action = new RegExp(
      `^${action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
    );
  if (entity) filter.entity = entity;
  if (entityId) filter.entityId = entityId;
  if (actor) filter.actor = actor;
  if (subject) filter.subject = subject;
  if (outcome) filter.outcome = outcome;

  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }

  const [entries, total] = await Promise.all([
    AuditLog.find(filter)
      .populate(ACTOR_POPULATE)
      .populate(SUBJECT_POPULATE)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  return sendPaginated(res, entries, total, page, limit);
};

// @desc    Everything that has happened to one record
// @route   GET /api/v1/audit/entity/:entity/:entityId
// @access  Admin
const getEntityHistory = async (req, res) => {
  const { entity, entityId } = req.params;

  const entries = await AuditLog.find({ entity, entityId })
    .populate(ACTOR_POPULATE)
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  return sendSuccess(res, 200, 'Entity history fetched', {
    entity,
    entityId,
    entries,
    count: entries.length,
  });
};

// @desc    Everything concerning one student
// @route   GET /api/v1/audit/student/:studentId
// @access  Admin
//
// Answers the question a parent actually asks: "what has been done to my
// child's record, and by whom".
const getStudentHistory = async (req, res) => {
  const { studentId } = req.params;

  const entries = await AuditLog.find({ subject: studentId })
    .populate(ACTOR_POPULATE)
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  return sendSuccess(res, 200, 'Student history fetched', {
    student: studentId,
    entries,
    count: entries.length,
  });
};

// @desc    Distinct actions recorded, for building filters
// @route   GET /api/v1/audit/actions
// @access  Admin
const getActions = async (req, res) => {
  const actions = await AuditLog.distinct('action');
  return sendSuccess(res, 200, 'Actions fetched', { actions: actions.sort() });
};

// @desc    Recent activity summary
// @route   GET /api/v1/audit/summary
// @access  Admin
const getSummary = async (req, res) => {
  const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 7));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [byAction, byActor, failures, total] = await Promise.all([
    AuditLog.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: '$action', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]),
    AuditLog.aggregate([
      { $match: { createdAt: { $gte: since }, actor: { $ne: null } } },
      {
        $group: {
          _id: '$actor',
          actorName: { $first: '$actorName' },
          actorRole: { $first: '$actorRole' },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
    AuditLog.countDocuments({ createdAt: { $gte: since }, outcome: 'failure' }),
    AuditLog.countDocuments({ createdAt: { $gte: since } }),
  ]);

  return sendSuccess(res, 200, 'Audit summary fetched', {
    days,
    since,
    total,
    failures,
    byAction,
    byActor,
  });
};

module.exports = {
  getAuditLog,
  getEntityHistory,
  getStudentHistory,
  getActions,
  getSummary,
};
