const axios = require('axios');
const Document = require('../models/Document');
const DocumentChunk = require('../models/DocumentChunk');
const Activity = require('../models/Activity');
const { minimizeForQuery } = require('../utils/privacyEngine');
const { verifyAnswerAgainstSources } = require('../utils/verificationEngine');

/**
 * @desc    Ask AI Grounded Query via Privacy Gateway & Verification Pipeline
 * @route   POST /api/ai/ask
 * @access  Private (JWT Protected)
 */
exports.askAI = async (req, res, next) => {
  try {
    const { documentId, query, enforceMinimization } = req.body;

    if (!query) {
      return res.status(400).json({ success: false, error: 'Query prompt is required' });
    }

    let targetDoc = null;
    let dbChunks = [];

    if (documentId && documentId !== 'global') {
      targetDoc = await Document.findById(documentId);
      if (!targetDoc) {
        return res.status(404).json({ success: false, error: 'Document not found' });
      }

      if (targetDoc.owner.toString() !== req.user.id && req.user.role !== 'ADMIN') {
        return res.status(403).json({ success: false, error: 'Access denied: You do not own this document' });
      }

      // Retrieve associated chunks from MongoDB
      dbChunks = await DocumentChunk.find({ documentId: targetDoc._id }).sort({ chunkIndex: 1 });
    } else {
      // Global Retrieval: Retrieve all user chunks
      const userDocs = await Document.find({ owner: req.user.id }).select('_id');
      const docIds = userDocs.map(d => d._id);
      dbChunks = await DocumentChunk.find({ documentId: { $in: docIds } }).sort({ createdAt: -1 });
    }

    const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';
    let aiResponseData;

    // Ensure chunks are synced/indexed in Python vector store before query execution
    if (dbChunks && dbChunks.length > 0) {
      try {
        const uniqueDocIds = [...new Set(dbChunks.map(c => c.documentId ? c.documentId.toString() : null).filter(Boolean))];
        const docs = await Document.find({ _id: { $in: uniqueDocIds } }).select('_id fileName title');
        const docMap = {};
        docs.forEach(d => { docMap[d._id.toString()] = d; });

        await axios.post(`${pythonServiceUrl}/index`, {
          documentId: targetDoc ? targetDoc._id.toString() : 'global',
          fileName: targetDoc ? targetDoc.fileName : 'Global Vault Index',
          chunks: dbChunks.map(c => {
            const dObj = docMap[c.documentId.toString()] || targetDoc;
            return {
              chunkId: c._id.toString(),
              documentId: c.documentId.toString(),
              fileName: dObj ? dObj.fileName : 'PDF Document',
              chunkIndex: c.chunkIndex,
              pageNumber: c.pageNumber || 1,
              minimizedChunkText: c.minimizedChunkText,
              rawChunkText: c.rawChunkText,
              sensitiveFieldsCount: c.sensitiveFieldsCount || 0
            };
          })
        });
      } catch (idxErr) {
        console.warn('[AI Gateway Warning] Syncing chunks to Python service failed:', idxErr.message);
      }
    }

    // Call Python AI microservice query endpoint
    try {
      const response = await axios.post(`${pythonServiceUrl}/query`, {
        documentId: targetDoc ? targetDoc._id.toString() : null,
        query,
        minimizedContextOnly: enforceMinimization !== false
      });
      aiResponseData = response.data;
    } catch (err) {
      console.warn('[AI Gateway Warning] Python AI service query call failed:', err.message);

      if (targetDoc && dbChunks.length > 0) {
        const rawText = targetDoc.rawText || '';
        const isScannedPlaceholder = rawText.toLowerCase().includes('scanned or image-only') || rawText.toLowerCase().includes('text content not extractable');

        if (isScannedPlaceholder) {
          aiResponseData = {
            success: true,
            answer: "Text could not be extracted from this PDF (it may be scanned or image-only). Grounded AI RAG cannot reliably answer questions about its contents.",
            sanitizedContextUsed: "",
            sourceChunks: []
          };
        } else {
          const minimizationResult = minimizeForQuery(rawText, query);

          aiResponseData = {
            success: true,
            answer: `Based on PrivacyGuard Gateway analysis of '${targetDoc.title}':\n` +
                    `- Relevant passage: "${rawText.substring(0, 180)}..."`,
            sanitizedContextUsed: minimizationResult.minimizedText,
            sourceChunks: dbChunks.slice(0, 3).map(c => ({
              chunkId: c._id.toString(),
              documentId: c.documentId.toString(),
              fileName: targetDoc.fileName,
              chunkIndex: c.chunkIndex,
              pageNumber: c.pageNumber || 1,
              minimizedChunkText: c.minimizedChunkText,
              rawChunkText: c.rawChunkText,
              text: c.rawChunkText
            }))
          };
        }
      } else {
        aiResponseData = {
          success: true,
          answer: "I could not find this information in the selected PDF.",
          sanitizedContextUsed: "",
          sourceChunks: []
        };
      }
    }

    let aiAnswerText = aiResponseData.answer || 'I could not find this information in the selected PDF.';
    let chunksUsed = aiResponseData.sourceChunks || [];

    // Enforce Strict Document Isolation: Filter out any citations from other documents if a specific doc was selected
    if (targetDoc) {
      const targetDocIdStr = targetDoc._id.toString();
      chunksUsed = chunksUsed.filter(c => c.documentId && c.documentId.toString() === targetDocIdStr);
    }

    // Validate and format every citation object with complete stable metadata
    const validatedSources = chunksUsed.map(c => {
      const docId = c.documentId ? c.documentId.toString() : (targetDoc ? targetDoc._id.toString() : null);
      const rawText = c.rawChunkText || c.text || c.minimizedChunkText || '';
      const pNum = Math.max(1, parseInt(c.pageNumber, 10) || 1);
      const isResolvable = Boolean(docId && rawText && pNum);

      const formatted = {
        chunkId: c.chunkId || `chunk_${c.chunkIndex || 1}`,
        documentId: docId,
        fileName: c.fileName || (targetDoc ? targetDoc.fileName : 'PDF Document'),
        chunkIndex: typeof c.chunkIndex === 'number' ? c.chunkIndex : 1,
        pageNumber: pNum,
        minimizedChunkText: c.minimizedChunkText || rawText,
        rawChunkText: rawText,
        text: rawText,
        isResolvable
      };

      console.log('[RAG SOURCE DEV LOG]', {
        question: query,
        retrievedChunkId: formatted.chunkId,
        documentId: formatted.documentId,
        fileName: formatted.fileName,
        pageNumber: formatted.pageNumber,
        sourceTextSnippet: formatted.rawChunkText.substring(0, 80)
      });

      return formatted;
    });

    // Filter out unresolvable or placeholder citations
    let finalSources = validatedSources.filter(s => {
      if (!s.isResolvable) return false;
      const lower = s.rawChunkText.toLowerCase();
      if (lower.includes('scanned or image-only pdf') || lower.includes('text content not extractable')) return false;
      return true;
    });

    // If answer is a refusal or scanned PDF notice, do not return citations
    if (aiAnswerText.toLowerCase().includes('could not find this information') ||
        aiAnswerText.toLowerCase().includes('insufficient evidence') ||
        aiAnswerText.toLowerCase().includes('text could not be extracted')) {
      finalSources = [];
    }

    // Run Answer Verification Engine & Trust Score Calculation
    const verificationReport = verifyAnswerAgainstSources(aiAnswerText, finalSources, query);

    console.log(`[AI GATEWAY DEBUG] Query: "${query}" | DocID: "${documentId || 'GLOBAL'}" | Citations Count: ${finalSources.length} | Trust Score: ${verificationReport.trustScore}%`);

    // Record Question Activity
    try {
      await Activity.create({
        owner: req.user.id,
        type: 'QUESTION_ASKED',
        title: query,
        details: aiAnswerText.substring(0, 140) + '...',
        documentId: targetDoc ? targetDoc._id : null,
        documentName: targetDoc ? targetDoc.title : 'Global Index',
        pageNumber: finalSources && finalSources.length > 0 ? (finalSources[0].pageNumber || 1) : 1
      });
    } catch (actErr) {
      console.warn('Failed to log question activity:', actErr.message);
    }

    res.status(200).json({
      success: true,
      query,
      document: targetDoc ? { id: targetDoc._id, title: targetDoc.title, fileName: targetDoc.fileName } : null,
      answer: aiAnswerText,
      verification: verificationReport,
      sources: finalSources,
      sanitizedContextUsed: aiResponseData.sanitizedContextUsed
    });
  } catch (error) {
    next(error);
  }
};
