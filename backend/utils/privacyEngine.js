/**
 * ReadDocX — Privacy Engine & Purpose-Aware Data Minimizer
 * Deterministic Detection, Classification, Sanitization & Minimization
 */

// Regex patterns for sensitive entities
const ENTITY_PATTERNS = {
  EMAIL: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  PHONE: /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  SSN_GOVT_ID: /\b(?:\d{3}-\d{2}-\d{4}|\d{4}[-\s]?\d{4}[-\s]?\d{4}|[A-Z]{5}\d{4}[A-Z]{1})\b/g,
  CREDIT_CARD: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
  BANK_ACCOUNT: /\b(?:ACC|ACCOUNT|IBAN|NO|NUM)[:\s#]*[A-Z0-9]{9,18}\b/gi,
  PO_NUMBER: /\b(?:PO|INV|POL|CTR)[-_\s]?\d{4,10}\b/gi,
  DATE: /\b(?:\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4})\b/gi,
  MONEY: /\b(?:\$|₹|€|£|EUR|USD|INR)\s?\d+(?:,\d{3})*(?:\.\d{2})?\b/gi,
  PERSON_NAME: /\b(?:Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.)\s+[A-Z][a-z]+\s+[A-Z][a-z]+\b/g
};

/**
 * Detect sensitive entities in text with position offsets
 */
const detectSensitiveEntities = (text) => {
  if (!text) return [];

  const entities = [];
  let idCounter = 1;

  for (const [type, pattern] of Object.entries(ENTITY_PATTERNS)) {
    // Reset regex index
    pattern.lastIndex = 0;
    let match;

    while ((match = pattern.exec(text)) !== null) {
      // Avoid duplicate overlapping captures
      const exists = entities.some(e => e.startIndex === match.index && e.endIndex === match.index + match[0].length);
      if (!exists) {
        entities.push({
          id: `ENTITY_${type}_${idCounter++}`,
          entityType: type,
          originalValue: match[0],
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          placeholder: `[${type}_${idCounter - 1}]`,
          confidence: 0.95
        });
      }
    }
  }

  // Sort by start index
  return entities.sort((a, b) => a.startIndex - b.startIndex);
};

/**
 * Determine data classification rating based on detected entities
 */
const classifyData = (entities, text = '') => {
  const types = new Set(entities.map(e => e.entityType));

  if (types.has('SSN_GOVT_ID') || types.has('CREDIT_CARD') || types.has('BANK_ACCOUNT')) {
    return 'HIGHLY_SENSITIVE';
  }
  if (types.has('EMAIL') || types.has('PHONE') || types.has('PERSON_NAME') || types.has('PO_NUMBER')) {
    return 'CONFIDENTIAL';
  }
  if (entities.length > 0 || text.toLowerCase().includes('internal') || text.toLowerCase().includes('proprietary')) {
    return 'INTERNAL';
  }
  return 'PUBLIC';
};

/**
 * Sanitize text using chosen strategy: REDACT, MASK, TOKENIZE, PLACEHOLDER
 */
const sanitizeText = (text, strategy = 'PLACEHOLDER') => {
  if (!text) return { sanitizedText: '', entities: [] };

  const entities = detectSensitiveEntities(text);
  let sanitizedText = text;

  // Process in reverse index order so replacements do not offset earlier indices
  const reversedEntities = [...entities].sort((a, b) => b.startIndex - a.startIndex);

  for (const entity of reversedEntities) {
    let replacement = entity.placeholder;

    if (strategy === 'REDACT') {
      replacement = '[REDACTED]';
    } else if (strategy === 'MASK') {
      const val = entity.originalValue;
      if (val.length > 4) {
        replacement = '*'.repeat(val.length - 4) + val.slice(-4);
      } else {
        replacement = '****';
      }
    } else if (strategy === 'TOKENIZE') {
      replacement = `[TOKEN_${entity.id}]`;
    }

    sanitizedText = sanitizedText.slice(0, entity.startIndex) + replacement + sanitizedText.slice(entity.endIndex);
  }

  return {
    originalText: text,
    sanitizedText,
    entities,
    classification: classifyData(entities, text)
  };
};

/**
 * Purpose-Aware Data Minimization Engine
 * Filters out unneeded sensitive fields depending on query intent
 * e.g., If asking about "expiry date" or "PO status", PII like phone, credit card, and name are stripped out.
 */
const minimizeForQuery = (text, userQuery = '') => {
  const { sanitizedText, entities, classification } = sanitizeText(text, 'PLACEHOLDER');
  const queryLower = userQuery.toLowerCase();

  // Identify requested query target intent
  const intendsExpiry = queryLower.includes('expiry') || queryLower.includes('expire') || queryLower.includes('date') || queryLower.includes('renewal');
  const intendsAmount = queryLower.includes('amount') || queryLower.includes('price') || queryLower.includes('cost') || queryLower.includes('total') || queryLower.includes('value');
  const intendsStatus = queryLower.includes('status') || queryLower.includes('state') || queryLower.includes('delivery') || queryLower.includes('po');
  const intendsVendor = queryLower.includes('vendor') || queryLower.includes('supplier') || queryLower.includes('company');

  let minimizedText = sanitizedText;
  let removedFieldsCount = 0;

  // If query is focused on specific facts, aggressively minimize unneeded placeholders
  let textLines = minimizedText.split('\n');
  const filteredLines = textLines.map(line => {
    let lineText = line;

    if (intendsExpiry && !line.toLowerCase().includes('date') && !line.toLowerCase().includes('expir') && !line.toLowerCase().includes('valid')) {
      // Strip unneeded PII lines if not related to date
      if (line.includes('[PHONE_') || line.includes('[CREDIT_CARD_') || line.includes('[SSN_GOVT_ID_')) {
        removedFieldsCount++;
        return '[MINIMIZED_NON_ESSENTIAL_PII]';
      }
    }

    if (intendsAmount && !line.toLowerCase().includes('amount') && !line.toLowerCase().includes('total') && !line.toLowerCase().includes('price') && !line.toLowerCase().includes('cost')) {
      if (line.includes('[PHONE_') || line.includes('[EMAIL_') || line.includes('[BANK_ACCOUNT_')) {
        removedFieldsCount++;
        return '[MINIMIZED_NON_ESSENTIAL_PII]';
      }
    }

    return lineText;
  });

  minimizedText = filteredLines.join('\n');
  const originalLength = text.length;
  const minimizedLength = minimizedText.length;
  const reductionPercentage = Math.max(0, Math.round(((originalLength - minimizedLength) / originalLength) * 100));

  return {
    originalText: text,
    minimizedText,
    queryIntent: intendsExpiry ? 'EXPIRATION_DATE' : intendsAmount ? 'FINANCIAL_AMOUNT' : intendsStatus ? 'STATUS_CHECK' : intendsVendor ? 'VENDOR_INFO' : 'GENERAL_QUERY',
    entitiesDetected: entities.length,
    sensitiveFieldsRemoved: removedFieldsCount + entities.length,
    minimizationRatio: `${reductionPercentage}%`,
    classification
  };
};

module.exports = {
  detectSensitiveEntities,
  classifyData,
  sanitizeText,
  minimizeForQuery
};
