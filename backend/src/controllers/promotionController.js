const promotionService = require('../services/promotionService');
const { sendSuccess, sendError } = require('../utils/apiResponse');

// Create promotion batch
exports.createPromotionBatch = async (req, res) => {
  try {
    const promotion = await promotionService.createPromotionBatch(
      req.body,
      req.user._id,
    );

    sendSuccess(res, 201, 'Promotion batch created successfully', promotion);
  } catch (error) {
    console.error('CREATE PROMOTION ERROR:', error);
    sendError(res, error.message, 400);
  }
};

// Auto-process promotions
exports.autoProcessPromotion = async (req, res) => {
  try {
    const promotion = await promotionService.autoProcessPromotion(
      req.params.id,
      req.user._id,
    );
    sendSuccess(res, 201, 'Promotions processed successfully', promotion);
  } catch (error) {
    sendError(res, error.message, 400);
  }
};

// Update student status manually
exports.updateStudentStatus = async (req, res) => {
  try {
    const { studentId } = req.params;
    const promotion = await promotionService.updateStudentStatus(
      req.params.id,
      studentId,
      req.body,
      req.user._id,
    );
    sendSuccess(res, 201, 'Student status updated successfully', promotion);
  } catch (error) {
    sendError(res, error.message, 400);
  }
};

// Apply promotions (update student classes)
exports.applyPromotions = async (req, res) => {
  try {
    const result = await promotionService.applyPromotions(
      req.params.id,
      req.user._id,
    );
    sendSuccess(res, 201, 'Promotions applied successfully', result);
  } catch (error) {
    sendError(res, error.message, 400);
  }
};

// Get promotion by ID
exports.getPromotionById = async (req, res) => {
  try {
    const promotion = await promotionService.getPromotionById(req.params.id);

    sendSuccess(res, 201, 'Promotion retrieved successfully', promotion);
  } catch (error) {
    sendError(res, error.message, 404);
  }
};

// Get all promotions
exports.getAllPromotions = async (req, res) => {
  try {
    const promotions = await promotionService.getAllPromotions(req.query);
    sendSuccess(res, 200, 'Promotions retrieved successfully', promotions);
  } catch (error) {
    sendError(res, error.message, 500);
  }
};

// Delete promotion batch
exports.deletePromotion = async (req, res) => {
  try {
    const result = await promotionService.deletePromotion(req.params.id);
    sendSuccess(res, 201, 'Promotion batch deleted successfully', result);
  } catch (error) {
    sendError(res, error.message, 400);
  }
};

// Get promotion statistics
exports.getPromotionStats = async (req, res) => {
  try {
    const stats = await promotionService.getPromotionStats(req.params.id);
    sendSuccess(res, 201, 'Statistics retrieved successfully', stats);
  } catch (error) {
    sendError(res, error.message, 500);
  }
};
