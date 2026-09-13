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

      // Check if targetDoc contains scanned PDF placeholder and attempt dynamic OCR fallback
      const { isPlaceholderOrUnextractableText } = require('../utils/verificationEngine');
      if (isPlaceholderOrUnextractableText(targetDoc.rawText)) {
        const fullDoc = await Document.findById(targetDoc._id).select('+pdfBuffer');
        if (fullDoc && fullDoc.pdfBuffer && fullDoc.pdfBuffer.length > 0) {
          console.log(`[RAG OCR] Running OCR fallback on document '${targetDoc.title}'...`);
          try {
            const { extractTextFromBuffer } = require('../utils/textExtractor');
            const { detectSensitiveEntities, classifyData } = require('../utils/privacyEngine');
            const { processDocumentChunks } = require('../utils/chunker');

            const extractionResult = await extractTextFromBuffer(fullDoc.pdfBuffer, fullDoc.mimeType, fullDoc.fileName);
            if (extractionResult && !isPlaceholderOrUnextractableText(extractionResult.rawText)) {
              const rawText = extractionResult.rawText;
              const entities = detectSensitiveEntities(rawText);
              const userClassification = targetDoc.classification || classifyData(entities, rawText);
              const minimizationResult = minimizeForQuery(rawText, query || 'GENERAL_QUERY');

              targetDoc.rawText = rawText;
              targetDoc.minimizedText = minimizationResult.minimizedText;
              targetDoc.extractionMethod = extractionResult.extractionMethod || 'ocr';
              await targetDoc.save();

              await DocumentChunk.deleteMany({ documentId: targetDoc._id });
              await processDocumentChunks(targetDoc._id, req.user.id, rawText, userClassification, extractionResult.pages || [], targetDoc.fileName);

              console.log(`[RAG OCR SUCCESS] Document '${targetDoc.title}' successfully re-extracted via ${targetDoc.extractionMethod}.`);
            }
          } catch (ocrErr) {
            console.warn('[RAG OCR Warning] OCR fallback failed for target doc:', ocrErr.message);
          }
        }
      }

      // Retrieve associated chunks from MongoDB
      dbChunks = await DocumentChunk.find({ documentId: targetDoc._id }).sort({ chunkIndex: 1 });

      // Check if dbChunks is empty or contains placeholder while targetDoc has valid text
      const hasOnlyPlaceholders = dbChunks.length === 0 || dbChunks.every(c => isPlaceholderOrUnextractableText(c.rawChunkText));
      if (hasOnlyPlaceholders && !isPlaceholderOrUnextractableText(targetDoc.rawText)) {
        console.log(`[RAG RE-CHUNK] Re-chunking valid document '${targetDoc.title}'...`);
        const { processDocumentChunks } = require('../utils/chunker');
        await DocumentChunk.deleteMany({ documentId: targetDoc._id });
        dbChunks = await processDocumentChunks(targetDoc._id, req.user.id, targetDoc.rawText, targetDoc.classification, [], targetDoc.fileName);
      }
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
        const uniqueDocIds = [...new Set(dbChunks.map(c => c.documentId ? c.documentId.toString().trim() : null).filter(Boolean))];
        const docs = await Document.find({ _id: { $in: uniqueDocIds } }).select('_id fileName title');
        const docMap = {};
        docs.forEach(d => { docMap[d._id.toString().trim()] = d; });

        await axios.post(`${pythonServiceUrl}/index`, {
          documentId: targetDoc ? targetDoc._id.toString().trim() : 'global',
          fileName: targetDoc ? targetDoc.fileName : 'Global Vault Index',
          chunks: dbChunks.map(c => {
            const dObj = docMap[c.documentId.toString().trim()] || targetDoc;
            return {
              chunkId: c._id.toString(),
              documentId: c.documentId.toString().trim(),
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
        documentId: targetDoc ? targetDoc._id.toString().trim() : null,
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
          const stopwords = new Set(["what", "when", "who", "where", "how", "this", "that", "the", "does", "which", "give", "show", "tell", "list", "are", "is"]);
          const qTerms = query.split(/\s+/).map(w => w.toLowerCase().replace(/[^\w]/g, '')).filter(w => w.length > 2 && !stopwords.has(w));
          
          let matchedChunk = null;
          let matchedFactLine = null;

          for (const c of dbChunks) {
            const lines = (c.rawChunkText || '').split(/\n+/);
            for (const l of lines) {
              const lLower = l.toLowerCase();
              if (qTerms.length > 0 && qTerms.some(t => lLower.includes(t))) {
                matchedChunk = c;
                matchedFactLine = l.trim();
                break;
              }
            }
            if (matchedFactLine) break;
          }

          if (matchedFactLine && !matchedFactLine.toLowerCase().includes('relevant passage:')) {
            aiResponseData = {
              success: true,
              answer: `Based on '${targetDoc.title}': ${matchedFactLine}`,
              sanitizedContextUsed: matchedChunk ? matchedChunk.minimizedChunkText : "",
              sourceChunks: matchedChunk ? [{
                chunkId: matchedChunk._id.toString(),
                documentId: matchedChunk.documentId.toString().trim(),
                fileName: targetDoc.fileName,
                chunkIndex: matchedChunk.chunkIndex,
                pageNumber: matchedChunk.pageNumber || 1,
                minimizedChunkText: matchedChunk.minimizedChunkText,
                rawChunkText: matchedChunk.rawChunkText,
                text: matchedChunk.rawChunkText
              }] : []
            };
          } else {
            aiResponseData = {
              success: true,
              answer: "I could not find this information in the selected PDF.",
              sanitizedContextUsed: "",
              sourceChunks: []
            };
          }
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
      const targetDocIdStr = targetDoc._id.toString().trim();
      chunksUsed = chunksUsed.filter(c => c.documentId && c.documentId.toString().trim() === targetDocIdStr);
    }

    // Validate and format every citation object with complete stable metadata
    const validatedSources = chunksUsed.map(c => {
      const docId = c.documentId ? c.documentId.toString().trim() : (targetDoc ? targetDoc._id.toString().trim() : null);
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
    const validSources = validatedSources.filter(s => {
      if (!s.isResolvable) return false;
      const lower = s.rawChunkText.toLowerCase();
      if (lower.includes('scanned or image-only pdf') || lower.includes('text content not extractable')) return false;
      return true;
    });

    let finalSources = validSources;

    // If answer is a refusal or scanned PDF notice, do not return citations
    const lowerAns = aiAnswerText.toLowerCase();
    if (lowerAns.includes('could not find') ||
        lowerAns.includes('cannot find') ||
        lowerAns.includes('insufficient evidence') ||
        lowerAns.includes('text could not be extracted') ||
        lowerAns.includes('no information found')) {
      finalSources = [];
    }

    console.log('[AI CONTROLLER SOURCE CHECK]', {
      retrievedSourceCount: chunksUsed?.length || 0,
      finalSourceCount: finalSources?.length || 0
    });

    // Run Answer Verification Engine & Trust Score Calculation
    const verificationReport = verifyAnswerAgainstSources(aiAnswerText, finalSources, query);

    console.log('[RAG ANSWER CHECK]', {
      questionLength: query?.length || 0,
      retrievedSourceCount: finalSources?.length || 0,
      answerLength: aiAnswerText?.length || 0,
      verificationStatus: verificationReport ? verificationReport.status : 'UNKNOWN',
      trustScore: verificationReport ? verificationReport.trustScore : 0
    });

    console.log('[AI DEBUG]', {
      question: query,
      selectedDocumentId: documentId || 'GLOBAL',
      userId: req.user ? req.user.id : 'ANONYMOUS',
      retrievedCount: dbChunks ? dbChunks.length : 0,
      validSourceCount: validSources.length,
      finalSourcesCount: finalSources.length,
      verificationStatus: verificationReport ? verificationReport.status : 'UNKNOWN',
      trustScore: verificationReport ? verificationReport.trustScore : 0
    });

    console.log('[AI CONTROLLER DEBUG]', {
      retrievedCount: dbChunks ? dbChunks.length : 0,
      placeholderCount: validatedSources.length - validSources.length,
      validSourceCount: validSources.length,
      finalSourcesCount: finalSources.length,
      verificationStatus: verificationReport ? verificationReport.status : 'UNKNOWN',
      trustScore: verificationReport ? verificationReport.trustScore : 0
    });

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
