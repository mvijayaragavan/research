const axios = require('axios');
const Document = require('../models/Document');
const DocumentChunk = require('../models/DocumentChunk');
const { verifyAnswerAgainstSources } = require('../utils/verificationEngine');

/**
 * @desc    Compare Document A vs Document B for semantic differences & internal contradictions
 * @route   POST /api/comparison/compare
 * @access  Private (JWT Protected)
 */
exports.compareDocuments = async (req, res, next) => {
  try {
    const { documentAId, documentBId } = req.body;

    if (!documentAId || !documentBId) {
      return res.status(400).json({
        success: false,
        error: 'Please select both Document A and Document B for comparison.'
      });
    }

    if (documentAId === documentBId) {
      return res.status(400).json({
        success: false,
        error: 'Document A and Document B must be different documents.'
      });
    }

    // Retrieve documents
    const docA = await Document.findById(documentAId);
    const docB = await Document.findById(documentBId);

    if (!docA || !docB) {
      return res.status(404).json({
        success: false,
        error: 'One or both selected documents were not found in the Document Vault.'
      });
    }

    // Retrieve document chunks
    const chunksA = await DocumentChunk.find({ documentId: documentAId }).sort({ chunkIndex: 1 });
    const chunksB = await DocumentChunk.find({ documentId: documentBId }).sort({ chunkIndex: 1 });

    const pythonUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';
    let comparisonData;

    try {
      const response = await axios.post(`${pythonUrl}/compare`, {
        documentAName: docA.fileName || docA.title,
        documentAChunks: chunksA.map(c => ({
          chunkIndex: c.chunkIndex,
          pageNumber: c.pageNumber,
          minimizedChunkText: c.minimizedChunkText,
          rawChunkText: c.rawChunkText
        })),
        documentBName: docB.fileName || docB.title,
        documentBChunks: chunksB.map(c => ({
          chunkIndex: c.chunkIndex,
          pageNumber: c.pageNumber,
          minimizedChunkText: c.minimizedChunkText,
          rawChunkText: c.rawChunkText
        }))
      });
      comparisonData = response.data;
    } catch (err) {
      console.warn('[Comparison Controller Warning] Python AI service compare endpoint failed:', err.message);
      return res.status(503).json({
        success: false,
        error: `AI Comparison Microservice error: ${err.message}`
      });
    }

    // Cross-verify evidence using Grounding Engine
    const allChunks = [...chunksA, ...chunksB];
    const summaryText = comparisonData.summary ? comparisonData.summary.textSummary : '';
    const verificationReport = verifyAnswerAgainstSources(summaryText, allChunks);

    res.status(200).json({
      success: true,
      result: comparisonData,
      verification: verificationReport
    });
  } catch (error) {
    next(error);
  }
};
