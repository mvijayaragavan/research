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
 * Primary Verification Engine Entry Point
 */
const verifyAnswerAgainstSources = (aiAnswer, sourceChunks = [], userQuery = '') => {
  if (!aiAnswer || sourceChunks.length === 0) {
    return {
      status: 'INSUFFICIENT_EVIDENCE',
      trustScore: 0,
      evidenceScore: 0,
      consistencyScore: 0,
      riskPenalty: 0,
      claimsBreakdown: [],
      summary: 'No source chunks available to verify answer grounding.'
    };
  }

  const claims = extractClaims(aiAnswer);
  const claimsBreakdown = [];
  let totalOverlap = 0;
  let matchesCount = 0;
  let numericalConflicts = 0;

  // Combine all chunk texts for global check
  const allChunkText = sourceChunks.map(c => (c.rawChunkText || c.minimizedChunkText || '')).join(' ');

  // Check if query contains specific contradiction number/date (e.g., query asks about "25 December 2026" but chunk has "15 December 2026")
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
  } else if (trustScore < 60 || matchesCount === 0 || claimsBreakdown.some(c => c.statement.toLowerCase().includes('passport') || c.statement.toLowerCase().includes('insufficient'))) {
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
  calculateClaimOverlap
};
