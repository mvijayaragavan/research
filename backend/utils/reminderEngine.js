/**
 * Deterministically parse expiry, renewal, payment, and milestone dates from document text
 * Returns evidence-based date suggestions without creating DB records silently.
 */

// Keyword mapping for Event Types
const EVENT_PATTERNS = [
  {
    type: 'CONTRACT_EXPIRY',
    keywords: ['contract shall remain valid until', 'valid until', 'expiry date', 'expires on', 'expiration date', 'contract end date', 'termination date'],
    titlePrefix: 'Contract Expiry',
    confidence: 0.96
  },
  {
    type: 'CONTRACT_RENEWAL',
    keywords: ['renew on', 'renewal date', 'auto-renew', 'automatic renewal'],
    titlePrefix: 'Contract Renewal',
    confidence: 0.92
  },
  {
    type: 'PAYMENT_DUE',
    keywords: ['payment due', 'due date for payment', 'invoice due', 'payable by', 'amount due on'],
    titlePrefix: 'Payment Due',
    confidence: 0.94
  },
  {
    type: 'APPLICATION_DEADLINE',
    keywords: ['application deadline', 'apply before', 'submission deadline', 'last date to apply'],
    titlePrefix: 'Application Deadline',
    confidence: 0.95
  },
  {
    type: 'SUBSCRIPTION_RENEWAL',
    keywords: ['subscription expires', 'billing cycle ends', 'subscription renewal date'],
    titlePrefix: 'Subscription Renewal',
    confidence: 0.90
  },
  {
    type: 'DOCUMENT_REVIEW',
    keywords: ['review required by', 'review date', 'audit deadline'],
    titlePrefix: 'Document Review',
    confidence: 0.88
  },
  {
    type: 'EXAM_DATE',
    keywords: ['exam date', 'examination on', 'test date'],
    titlePrefix: 'Exam Date',
    confidence: 0.90
  },
  {
    type: 'MEETING_DATE',
    keywords: ['meeting scheduled for', 'conference date', 'appointment on'],
    titlePrefix: 'Meeting Date',
    confidence: 0.88
  }
];

// Regex for extracting formatted date strings
const DATE_REGEX = /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})\b/gi;

/**
 * Filter out false positives like "Report generated on 5 January 2026" or "Created on 2026-01-01"
 */
function isFalsePositiveContext(lineLower) {
  return (
    lineLower.includes('generated on') ||
    lineLower.includes('created on') ||
    lineLower.includes('printed on') ||
    lineLower.includes('exported on') ||
    lineLower.includes('issued on') ||
    lineLower.includes('version 1') ||
    lineLower.includes('page ')
  );
}

/**
 * Extract date suggestions from full text with page identification
 */
function detectDateSuggestions(fullText, documentName = 'document.pdf') {
  if (!fullText) return [];

  const suggestions = [];
  
  // Split into pages if page markers exist (e.g. "-- Page 1 --" or Form Feed "\f")
  let pages = fullText.split(/(?:\f|--- Page \d+ ---|-- \d+ of \d+ --)/i);
  if (pages.length === 1) {
    // If no explicit page markers, simulate ~2000 chars per page
    const pageSize = 2000;
    pages = [];
    for (let i = 0; i < fullText.length; i += pageSize) {
      pages.push(fullText.slice(i, i + pageSize));
    }
  }

  pages.forEach((pageText, pageIdx) => {
    const pageNum = pageIdx + 1;
    const lines = pageText.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      const lineLower = trimmedLine.toLowerCase();

      // Skip false positives like report creation timestamps
      if (isFalsePositiveContext(lineLower)) {
        continue;
      }

      // Check against known event patterns
      for (const pattern of EVENT_PATTERNS) {
        const matchesKeyword = pattern.keywords.some((kw) => lineLower.includes(kw));

        if (matchesKeyword) {
          const dateMatches = trimmedLine.match(DATE_REGEX);
          if (dateMatches) {
            for (const dateStr of dateMatches) {
              const parsedDate = new Date(dateStr);
              if (!isNaN(parsedDate.getTime())) {
                // Ensure date is not already captured
                const isDuplicate = suggestions.some(
                  (s) => s.eventDate.getTime() === parsedDate.getTime() && s.eventType === pattern.type
                );

                if (!isDuplicate) {
                  suggestions.push({
                    documentName: documentName,
                    type: 'AUTOMATIC',
                    eventType: pattern.type,
                    title: pattern.titlePrefix,
                    eventDate: parsedDate,
                    formattedEventDate: parsedDate.toISOString().split('T')[0],
                    pageNumber: pageNum,
                    evidence: trimmedLine,
                    confidence: pattern.confidence,
                    emailEnabled: true
                  });
                }
              }
            }
          }
        }
      }
    }
  });

  return suggestions;
}

module.exports = {
  detectDateSuggestions,
  EVENT_PATTERNS
};
