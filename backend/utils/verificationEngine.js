/**
 * PrivacyGuard AI - Answer Verification & Grounding Engine
 * Cross-verifies LLM responses against extracted source document chunks
 * Emits explainable Trust Score & Status (VERIFIED, CONFLICT_DETECTED, INSUFFICIENT_EVIDENCE)
 */

/**
 * Extract distinct factual claims from AI answer
 */
const extractClaims = (answerText) => {
  if (!answerText) return [];

  // Split answer into lines or sentences
  const rawLines = answerText
    .split(/\n+/)
    .map(s => s.trim().replace(/^[-*•]\s*/, ''))
    .filter(s => s.length > 5 && !s.toLowerCase().startsWith('note:') && !s.toLowerCase().startsWith('action:') && !s.toLowerCase().startsWith('based on'));

  const claims = [];
  let id = 1;

  for (const line of rawLines) {
    // Further split sentences if long
    const sentences = line.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 5);
    for (const sent of sentences) {
      claims.push({
        claimId: id++,
        statement: sent.trim(),
        hasNumberOrDate: /\b\d+\b/.test(sent) || /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(sent)
      });
    }
  }

  return claims;
};

/**
 * Calculate lexical similarity / overlap between claim and source chunk text
 */
const calculateClaimOverlap = (claimText, chunkText) => {
  const claimWords = claimText.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2);
  const chunkWords = new Set(chunkText.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2));

  if (claimWords.length === 0) return 0;

  let matches = 0;
  for (const word of claimWords) {
    if (chunkWords.has(word)) {
      matches++;
    }
  }

  return matches / claimWords.length;
};

/**
 * Detect if text is a placeholder indicating an unextractable or scanned PDF
 */
const isPlaceholderOrUnextractableText = (text) => {
  if (!text) return true;
  const lower = text.toLowerCase();
  return lower.includes('scanned or image-only') ||
         lower.includes('text could not be extracted') ||
         lower.includes('text content not extractable') ||
         lower.includes('unable to load pdf') ||
         lower.includes('no text content extracted');
};

/**
 * Detect if answer is an explicit refusal / information-not-found statement
 */
const isRefusalAnswer = (text) => {
  if (!text) return true;
  const lower = text.toLowerCase();
  return lower.includes('could not find') ||
         lower.includes('cannot find') ||
         lower.includes('no information found') ||
         lower.includes('not mentioned in the selected') ||
         lower.includes('insufficient evidence') ||
         lower.includes('does not contain');
};

/**
 * Primary Verification Engine Entry Point
 */
const verifyAnswerAgainstSources = (aiAnswer, sourceChunks = [], userQuery = '') => {
  if (!aiAnswer) {
    return {
      status: 'INSUFFICIENT_EVIDENCE',
      trustScore: 0,
      evidenceScore: 0,
      consistencyScore: 0,
      riskPenalty: 0,
      claimsBreakdown: [],
      summary: 'No answer content was provided to verify.'
    };
  }

  // Check if answer or sources explicitly indicate unextractable PDF
  const isUnextractableRefusal = isPlaceholderOrUnextractableText(aiAnswer);
  const hasScannedPlaceholder = isUnextractableRefusal || (sourceChunks.length > 0 && sourceChunks.every(c => 
    isPlaceholderOrUnextractableText(c.rawChunkText || c.text || c.minimizedChunkText || '')
  ));

  if (hasScannedPlaceholder) {
    return {
      status: 'INSUFFICIENT_SOURCE',
      trustScore: 0,
      evidenceScore: 0,
      consistencyScore: 0,
      riskPenalty: 0,
      claimsBreakdown: [],
      summary: 'Text could not be extracted from this PDF. Grounded AI RAG cannot reliably answer questions about its contents.'
    };
  }

  if (isRefusalAnswer(aiAnswer)) {
    return {
      status: 'INSUFFICIENT_EVIDENCE',
      trustScore: 0,
      evidenceScore: 0,
      consistencyScore: 0,
      riskPenalty: 0,
      claimsBreakdown: [],
      summary: 'Information requested could not be found in the selected document.'
    };
  }

  if (sourceChunks.length === 0) {
    return {
      status: 'INSUFFICIENT_EVIDENCE',
      trustScore: 0,
      evidenceScore: 0,
      consistencyScore: 0,
      riskPenalty: 0,
      claimsBreakdown: [],
      summary: 'No relevant source passages found in the selected document matching your question.'
    };
  }

  const claims = extractClaims(aiAnswer);
  const claimsBreakdown = [];
  let totalOverlap = 0;
  let matchesCount = 0;
  let numericalConflicts = 0;

  // Combine all chunk texts for global check
  const allChunkText = sourceChunks.map(c => (c.rawChunkText || c.minimizedChunkText || '')).join(' ');

  // Check if query contains specific contradiction number/date
  if (userQuery) {
    const queryNumbers = userQuery.match(/\b\d{1,4}\b/g) || [];
    for (const num of queryNumbers) {
      if (num.length >= 2 && !allChunkText.includes(num)) {
        numericalConflicts += 2;
      }
    }
  }

  for (const claim of claims) {
    let bestOverlap = 0;
    let matchingChunk = null;

    for (const chunk of sourceChunks) {
      const chunkText = chunk.rawChunkText || chunk.minimizedChunkText || '';
      const overlap = calculateClaimOverlap(claim.statement, chunkText);

      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        matchingChunk = chunk;
      }
    }

    const isVerified = bestOverlap >= 0.35;
    if (isVerified) matchesCount++;
    totalOverlap += bestOverlap;

    // Check for numerical discrepancy between claim statement and matching chunk
    const claimNumbers = claim.statement.match(/\b\d+(?:,\d{3})*(?:\.\d+)?\b/g) || [];
    if (claimNumbers.length > 0 && matchingChunk) {
      const chunkText = matchingChunk.rawChunkText || matchingChunk.minimizedChunkText || '';
      for (const num of claimNumbers) {
        const cleanNum = num.replace(/,/g, '');
        if (cleanNum.length >= 2 && !chunkText.includes(cleanNum) && !chunkText.includes(num)) {
          numericalConflicts++;
        }
      }
    }

    claimsBreakdown.push({
      claimId: claim.claimId,
      statement: claim.statement,
      verified: isVerified,
      confidence: Math.round(bestOverlap * 100),
      citation: matchingChunk ? `Chunk #${matchingChunk.chunkIndex || 1} (Page ${matchingChunk.pageNumber || 1})` : 'Unverified'
    });
  }

  // Calculate composite scores
  const totalClaims = claims.length || 1;
  const evidenceScore = Math.min(100, Math.round((totalOverlap / totalClaims) * 100));
  const consistencyScore = Math.max(0, 100 - (numericalConflicts * 30));
  const riskPenalty = (claimsBreakdown.some(c => !c.verified) ? 15 : 0) + (numericalConflicts > 0 ? 25 : 0);

  const trustScore = Math.max(0, Math.min(100, Math.round((evidenceScore * 0.6) + (consistencyScore * 0.4) - riskPenalty)));

  let status = 'VERIFIED';
  if (numericalConflicts > 0) {
    status = 'CONFLICT_DETECTED';
  } else if (trustScore < 60 || matchesCount === 0 || claimsBreakdown.some(c => c.statement.toLowerCase().includes('insufficient')) || aiAnswer.toLowerCase().includes('relevant passage:')) {
    status = 'INSUFFICIENT_EVIDENCE';
  }

  return {
    status,
    trustScore,
    evidenceScore,
    consistencyScore,
    riskPenalty,
    totalClaims,
    verifiedClaimsCount: matchesCount,
    claimsBreakdown,
    summary: status === 'VERIFIED'
      ? `Answer fully verified against ${sourceChunks.length} source context chunk(s) with ${trustScore}% confidence.`
      : status === 'CONFLICT_DETECTED'
      ? `Warning: Discrepancy detected between statement/query numbers and ground truth text.`
      : `Insufficient direct evidence in source documents to verify AI response.`
  };
};

module.exports = {
  verifyAnswerAgainstSources,
  extractClaims,
  calculateClaimOverlap,
  isPlaceholderOrUnextractableText
};
