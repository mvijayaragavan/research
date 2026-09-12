const { detectSensitiveEntities, classifyData, sanitizeText, minimizeForQuery } = require('../utils/privacyEngine');

/**
 * @desc    Analyze text for sensitive entities and return classification
 * @route   POST /api/privacy/analyze
 * @access  Public / Private
 */
exports.analyzeText = async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ success: false, error: 'Text content is required for analysis' });
    }

    const entities = detectSensitiveEntities(text);
    const classification = classifyData(entities, text);

    res.status(200).json({
      success: true,
      textLength: text.length,
      entityCount: entities.length,
      classification,
      entities
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Sanitize text using chosen strategy (REDACT, MASK, TOKENIZE, PLACEHOLDER)
 * @route   POST /api/privacy/sanitize
 * @access  Public / Private
 */
exports.sanitizeTextEndpoint = async (req, res, next) => {
  try {
    const { text, strategy } = req.body;
    if (!text) {
      return res.status(400).json({ success: false, error: 'Text content is required for sanitization' });
    }

    const result = sanitizeText(text, strategy || 'PLACEHOLDER');

    res.status(200).json({
      success: true,
      result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Purpose-Aware Data Minimization Gateway Endpoint
 * @route   POST /api/privacy/minimize
 * @access  Public / Private
 */
exports.minimizeDataEndpoint = async (req, res, next) => {
  try {
    const { text, userQuery } = req.body;
    if (!text) {
      return res.status(400).json({ success: false, error: 'Text content is required for minimization' });
    }

    const result = minimizeForQuery(text, userQuery || '');

    res.status(200).json({
      success: true,
      result
    });
  } catch (error) {
    next(error);
  }
};
