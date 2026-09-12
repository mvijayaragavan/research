const DocumentChunk = require('../models/DocumentChunk');
const { sanitizeText, minimizeForQuery } = require('./privacyEngine');
const axios = require('axios');

/**
 * Split text into chunks with paragraph and sentence preservation
 */
const splitTextIntoChunks = (text, maxChunkSize = 500) => {
  if (!text) return [];

  // Split by double line breaks (paragraphs) or full stops
  const paragraphs = text.split(/\n\s*\n/);
  const chunks = [];

  for (const para of paragraphs) {
    if (para.trim().length === 0) continue;

    if (para.length <= maxChunkSize) {
      chunks.push(para.trim());
    } else {
      // Split long paragraph by sentences
      const sentences = para.match(/[^.!?]+[.!?]+/g) || [para];
      let currentChunk = '';

      for (const sentence of sentences) {
        if ((currentChunk + sentence).length <= maxChunkSize) {
          currentChunk += ' ' + sentence.trim();
        } else {
          if (currentChunk.trim()) chunks.push(currentChunk.trim());
          currentChunk = sentence.trim();
        }
      }
      if (currentChunk.trim()) chunks.push(currentChunk.trim());
    }
  }

  return chunks.length > 0 ? chunks : [text.trim()];
};

/**
 * Process document into chunks, calculate privacy metadata, store in DB & index in Python AI microservice
 * Preserves exact real PDF page numbers
 */
const processDocumentChunks = async (documentId, ownerId, rawText, classification = 'CONFIDENTIAL', pages = [], fileName = '') => {
  const chunkDocs = [];
  let chunkIndexCounter = 1;

  if (pages && pages.length > 0) {
    // Process page-by-page to preserve exact page numbers
    for (const pageObj of pages) {
      const pNum = pageObj.pageNumber || 1;
      const pText = pageObj.text || '';
      if (!pText.trim()) continue;

      const pageChunks = splitTextIntoChunks(pText);
      for (const rawChunkText of pageChunks) {
        if (!rawChunkText.trim()) continue;

        const { sanitizedText, entities } = sanitizeText(rawChunkText, 'PLACEHOLDER');

        const chunkDoc = await DocumentChunk.create({
          documentId,
          ownerId,
          chunkIndex: chunkIndexCounter++,
          pageNumber: pNum,
          rawChunkText,
          minimizedChunkText: sanitizedText,
          classification,
          sensitiveFieldsCount: entities.length
        });

        chunkDocs.push(chunkDoc);
      }
    }
  }

  // Fallback if pages array was empty
  if (chunkDocs.length === 0) {
    const rawChunks = splitTextIntoChunks(rawText);
    for (let i = 0; i < rawChunks.length; i++) {
      const rawChunkText = rawChunks[i];
      const { sanitizedText, entities } = sanitizeText(rawChunkText, 'PLACEHOLDER');

      const chunkDoc = await DocumentChunk.create({
        documentId,
        ownerId,
        chunkIndex: i + 1,
        pageNumber: 1,
        rawChunkText,
        minimizedChunkText: sanitizedText,
        classification,
        sensitiveFieldsCount: entities.length
      });

      chunkDocs.push(chunkDoc);
    }
  }

  // Send chunks to Python AI service for vector indexing
  try {
    const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';
    await axios.post(`${pythonServiceUrl}/index`, {
      documentId: documentId.toString(),
      fileName: fileName,
      chunks: chunkDocs.map(c => ({
        chunkId: c._id.toString(),
        documentId: c.documentId.toString(),
        fileName: fileName,
        chunkIndex: c.chunkIndex,
        pageNumber: c.pageNumber,
        minimizedChunkText: c.minimizedChunkText,
        rawChunkText: c.rawChunkText,
        sensitiveFieldsCount: c.sensitiveFieldsCount
      }))
    });
  } catch (err) {
    console.warn('[Chunker Warning] Could not index chunks into Python AI service:', err.message);
  }

  return chunkDocs;
};

module.exports = {
  splitTextIntoChunks,
  processDocumentChunks
};
