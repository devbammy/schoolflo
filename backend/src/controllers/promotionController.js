const promotionService = require('../services/promotionService');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const audit = require('../services/auditService');

// Create promotion batch
exports.createPromotionBatch = async (req, res) => {
  const promotion = await promotionService.createPromotionBatch(
    req.body,
    req.user._id,
  );

  sendSuccess(res, 201, 'Promotion batch created successfully', promotion);
};

// Auto-process promotions
exports.autoProcessPromotion = async (req, res) => {
  const promotion = await promotionService.autoProcessPromotion(
    req.params.id,
    req.user._id,
  );
  sendSuccess(res, 201, 'Promotions processed successfully', promotion);
};

// Update student status manually
exports.updateStudentStatus = async (req, res) => {
  const { studentId } = req.params;
  const promotion = await promotionService.updateStudentStatus(
    req.params.id,
    studentId,
    req.body,
    req.user._id,
  );
  sendSuccess(res, 201, 'Student status updated successfully', promotion);
};

// Apply promotions (update student classes)
exports.applyPromotions = async (req, res) => {
  const result = await promotionService.applyPromotions(
    req.params.id,
    req.user._id,
  );

  // Applying a promotion batch moves entire cohorts between classes. If it is
  // ever run twice, or against the wrong batch, this is the record that shows
  // what happened.
  await audit.record(req, {
    action: 'promotion.apply',
    entity: 'Promotion',
    entityId: req.params.id,
    meta: {
      promoted: result?.promoted,
      repeated: result?.repeated,
      graduated: result?.graduated,
      total: result?.total,
    },
  });

  sendSuccess(res, 201, 'Promotions applied successfully', result);
};

// Get promotion by ID
exports.getPromotionById = async (req, res) => {
  const promotion = await promotionService.getPromotionById(req.params.id);

  sendSuccess(res, 201, 'Promotion retrieved successfully', promotion);
};

// Get all promotions
exports.getAllPromotions = async (req, res) => {
  const promotions = await promotionService.getAllPromotions(req.query);
  sendSuccess(res, 200, 'Promotions retrieved successfully', promotions);
};

// Delete promotion batch
exports.deletePromotion = async (req, res) => {
  const result = await promotionService.deletePromotion(req.params.id);
  sendSuccess(res, 201, 'Promotion batch deleted successfully', result);
};

// Get promotion statistics
exports.getPromotionStats = async (req, res) => {
  const stats = await promotionService.getPromotionStats(req.params.id);
  sendSuccess(res, 201, 'Statistics retrieved successfully', stats);
};
