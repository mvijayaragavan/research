const Document = require('../models/Document');
const DocumentChunk = require('../models/DocumentChunk');
const Activity = require('../models/Activity');
const { extractTextFromBuffer } = require('../utils/textExtractor');
const { detectSensitiveEntities, classifyData, minimizeForQuery } = require('../utils/privacyEngine');
const { processDocumentChunks } = require('../utils/chunker');
const { detectDateSuggestions } = require('../utils/reminderEngine');

/**
 * @desc    Upload document & extract text content + chunk + detect reminder date suggestions
 * @route   POST /api/documents/upload
 * @access  Private (JWT Protected)
 */
exports.uploadDocument = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Please attach a document file (.pdf or .txt)'
      });
    }

    const { originalname, mimetype, size, buffer } = req.file;
    const title = req.body.title || originalname;

    // Extract text from file buffer
    const extractionResult = await extractTextFromBuffer(buffer, mimetype, originalname);
    const rawText = extractionResult.rawText;

    // Detect sensitive entities and data classification
    const entities = detectSensitiveEntities(rawText);
    const calculatedClassification = classifyData(entities, rawText);
    const userClassification = req.body.classification || calculatedClassification;

    // Generate sanitized & minimized text sample
    const minimizationResult = minimizeForQuery(rawText, 'GENERAL_QUERY');

    const isPdfFile = (mimetype && mimetype.toLowerCase() === 'application/pdf') || (originalname && originalname.toLowerCase().endsWith('.pdf'));

    // Save initial document record
    const doc = await Document.create({
      title,
      fileName: originalname,
      fileSize: size,
      mimeType: mimetype || (isPdfFile ? 'application/pdf' : 'text/plain'),
      pdfBuffer: buffer,
      owner: req.user.id,
      classification: userClassification,
      extractionMethod: extractionResult.extractionMethod || 'native',
      sensitiveEntitiesDetected: entities.map(e => ({
        entityType: e.entityType,
        placeholder: e.placeholder,
        confidence: e.confidence
      })),
      totalEntitiesCount: entities.length,
      rawText,
      minimizedText: minimizationResult.minimizedText,
      lastOpenedAt: new Date()
    });

    // Split text into chunks & index in Python vector service
    const chunks = await processDocumentChunks(doc._id, req.user.id, rawText, userClassification, extractionResult.pages || [], doc.fileName);

    // Calculate total pages from chunks or text length
    let maxPage = 1;
    if (chunks && chunks.length > 0) {
      chunks.forEach(c => {
        if (c.pageNumber && c.pageNumber > maxPage) maxPage = c.pageNumber;
      });
    } else {
      maxPage = Math.max(1, Math.ceil(rawText.length / 2500));
    }

    doc.totalPages = maxPage;
    await doc.save();

    // Log Activity
    await Activity.create({
      owner: req.user.id,
      type: 'UPLOAD_PDF',
      title: `Uploaded document '${doc.title}'`,
      details: `${doc.fileName} (${maxPage} pages)`,
      documentId: doc._id,
      documentName: doc.title
    });

    // Detect date suggestions from document
    const dateSuggestions = detectDateSuggestions(rawText, doc.fileName).map(sugg => ({
      ...sugg,
      documentId: doc._id
    }));

    res.status(201).json({
      success: true,
      message: 'Document uploaded, sanitized, chunked, and vector indexed successfully',
      document: {
        id: doc._id,
        title: doc.title,
        fileName: doc.fileName,
        fileSize: doc.fileSize,
        classification: doc.classification,
        extractionMethod: doc.extractionMethod,
        totalPages: doc.totalPages,
        lastPageRead: doc.lastPageRead,
        characterCount: doc.rawText.length,
        sensitiveEntitiesCount: doc.totalEntitiesCount,
        chunksCount: chunks.length,
        dateSuggestionsCount: dateSuggestions.length,
        createdAt: doc.createdAt
      },
      dateSuggestions
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get documents for authenticated user
 * @route   GET /api/documents
 * @access  Private
 */
exports.getDocuments = async (req, res, next) => {
  try {
    const query = { owner: req.user.id };

    const documents = await Document.find(query)
      .select('-rawText -minimizedText')
      .sort({ lastOpenedAt: -1, createdAt: -1 });

    res.status(200).json({
      success: true,
      count: documents.length,
      documents
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single document details by ID
 * @route   GET /api/documents/:id
 * @access  Private (Ownership Restricted)
 */
exports.getDocumentById = async (req, res, next) => {
  try {
    const doc = await Document.findById(req.params.id);

    if (!doc) {
      return res.status(404).json({
        success: false,
        error: 'Document not found'
      });
    }

    if (doc.owner.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied: You do not have permission to view this document'
      });
    }

    // Update last opened time
    doc.lastOpenedAt = new Date();
    await doc.save();

    // Log Activity (de-duplicated within 5 mins for same doc)
    const recentOpen = await Activity.findOne({
      owner: req.user.id,
      type: 'OPEN_PDF',
      documentId: doc._id,
      createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) }
    });

    if (!recentOpen) {
      await Activity.create({
        owner: req.user.id,
        type: 'OPEN_PDF',
        title: `Opened '${doc.title}'`,
        details: `Reading page ${doc.lastPageRead || 1} of ${doc.totalPages || 1}`,
        documentId: doc._id,
        documentName: doc.title,
        pageNumber: doc.lastPageRead || 1
      });
    }

    // Retrieve associated document chunks
    const chunks = await DocumentChunk.find({ documentId: doc._id }).sort({ chunkIndex: 1 });

    res.status(200).json({
      success: true,
      document: doc,
      chunks
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete document by ID
 * @route   DELETE /api/documents/:id
 * @access  Private
 */
exports.deleteDocument = async (req, res, next) => {
  try {
    const doc = await Document.findById(req.params.id);

    if (!doc) {
      return res.status(404).json({
        success: false,
        error: 'Document not found'
      });
    }

    if (doc.owner.toString() !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Access denied: Cannot delete document owned by another user'
      });
    }

    await doc.deleteOne();
    await DocumentChunk.deleteMany({ documentId: req.params.id });
    await Activity.deleteMany({ documentId: req.params.id });

    res.status(200).json({
      success: true,
      message: 'Document deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update document reading progress
 * @route   PUT /api/documents/:id/progress
 * @access  Private
 */
exports.updateReadingProgress = async (req, res, next) => {
  try {
    const { pageNumber, totalPages } = req.body;
    const doc = await Document.findById(req.params.id);

    if (!doc) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    if (doc.owner.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    if (pageNumber && pageNumber >= 1) {
      doc.lastPageRead = pageNumber;
    }
    if (totalPages && totalPages >= 1) {
      doc.totalPages = totalPages;
    }
    doc.lastOpenedAt = new Date();
    await doc.save();

    res.status(200).json({
      success: true,
      documentId: doc._id,
      lastPageRead: doc.lastPageRead,
      totalPages: doc.totalPages,
      progressPercent: Math.min(100, Math.round((doc.lastPageRead / Math.max(1, doc.totalPages)) * 100))
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Add bookmark to document page
 * @route   POST /api/documents/:id/bookmarks
 * @access  Private
 */
exports.addBookmark = async (req, res, next) => {
  try {
    const { pageNumber, title } = req.body;
    const doc = await Document.findById(req.params.id);

    if (!doc) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }
    if (doc.owner.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const targetPage = parseInt(pageNumber, 10) || 1;
    const bookmarkTitle = title || `Page ${targetPage}`;

    // Check existing bookmark
    const exists = doc.bookmarks.find(b => b.pageNumber === targetPage);
    if (!exists) {
      doc.bookmarks.push({ pageNumber: targetPage, title: bookmarkTitle });
      await doc.save();

      await Activity.create({
        owner: req.user.id,
        type: 'BOOKMARK_ADDED',
        title: `Added Bookmark in '${doc.title}'`,
        details: `Page ${targetPage} - "${bookmarkTitle}"`,
        documentId: doc._id,
        documentName: doc.title,
        pageNumber: targetPage
      });
    }

    res.status(200).json({
      success: true,
      bookmarks: doc.bookmarks
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete bookmark from document page
 * @route   DELETE /api/documents/:id/bookmarks/:bookmarkId
 * @access  Private
 */
exports.deleteBookmark = async (req, res, next) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: 'Document not found' });
    if (doc.owner.toString() !== req.user.id) return res.status(403).json({ success: false, error: 'Access denied' });

    doc.bookmarks = doc.bookmarks.filter(b => b._id.toString() !== req.params.bookmarkId);
    await doc.save();

    res.status(200).json({ success: true, bookmarks: doc.bookmarks });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Add note to document page
 * @route   POST /api/documents/:id/notes
 * @access  Private
 */
exports.addNote = async (req, res, next) => {
  try {
    const { pageNumber, content } = req.body;
    if (!content) return res.status(400).json({ success: false, error: 'Note content is required' });

    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: 'Document not found' });
    if (doc.owner.toString() !== req.user.id) return res.status(403).json({ success: false, error: 'Access denied' });

    const targetPage = parseInt(pageNumber, 10) || 1;
    doc.notes.push({ pageNumber: targetPage, content });
    await doc.save();

    await Activity.create({
      owner: req.user.id,
      type: 'NOTE_CREATED',
      title: `Created Note in '${doc.title}'`,
      details: `Page ${targetPage}: "${content.substring(0, 80)}"`,
      documentId: doc._id,
      documentName: doc.title,
      pageNumber: targetPage
    });

    res.status(200).json({ success: true, notes: doc.notes });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete note from document
 * @route   DELETE /api/documents/:id/notes/:noteId
 * @access  Private
 */
exports.deleteNote = async (req, res, next) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: 'Document not found' });
    if (doc.owner.toString() !== req.user.id) return res.status(403).json({ success: false, error: 'Access denied' });

    doc.notes = doc.notes.filter(n => n._id.toString() !== req.params.noteId);
    await doc.save();

    res.status(200).json({ success: true, notes: doc.notes });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get complete dashboard stats & recent activities
 * @route   GET /api/documents/dashboard-stats
 * @access  Private
 */
exports.getDashboardStats = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const userDocs = await Document.find({ owner: userId }).sort({ lastOpenedAt: -1, createdAt: -1 });

    const totalDocuments = userDocs.length;
    const recentlyOpened = userDocs.filter(d => d.lastOpenedAt).length;

    let totalBookmarks = 0;
    let totalNotes = 0;

    const allBookmarks = [];
    const allNotes = [];

    userDocs.forEach(d => {
      if (d.bookmarks && d.bookmarks.length > 0) {
        totalBookmarks += d.bookmarks.length;
        d.bookmarks.forEach(b => {
          allBookmarks.push({
            id: b._id,
            documentId: d._id,
            documentTitle: d.title,
            fileName: d.fileName,
            pageNumber: b.pageNumber,
            title: b.title,
            createdAt: b.createdAt
          });
        });
      }

      if (d.notes && d.notes.length > 0) {
        totalNotes += d.notes.length;
        d.notes.forEach(n => {
          allNotes.push({
            id: n._id,
            documentId: d._id,
            documentTitle: d.title,
            fileName: d.fileName,
            pageNumber: n.pageNumber,
            content: n.content,
            createdAt: n.createdAt
          });
        });
      }
    });

    // Sort bookmarks & notes newest first
    allBookmarks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    allNotes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Get Continue Reading Target (most recently opened document)
    const continueDoc = userDocs.length > 0 ? userDocs[0] : null;
    let continueReading = null;

    if (continueDoc) {
      const totalPages = Math.max(1, continueDoc.totalPages || 1);
      const lastPage = Math.min(totalPages, Math.max(1, continueDoc.lastPageRead || 1));
      const progressPercent = Math.min(100, Math.round((lastPage / totalPages) * 100));

      continueReading = {
        id: continueDoc._id,
        title: continueDoc.title,
        fileName: continueDoc.fileName,
        fileSize: continueDoc.fileSize,
        lastPageRead: lastPage,
        totalPages: totalPages,
        progressPercent,
        lastOpenedAt: continueDoc.lastOpenedAt || continueDoc.createdAt
      };
    }

    // Recent Activities
    const recentActivity = await Activity.find({ owner: userId })
      .sort({ createdAt: -1 })
      .limit(10);

    // Recently Asked Questions
    const recentQuestions = await Activity.find({ owner: userId, type: 'QUESTION_ASKED' })
      .sort({ createdAt: -1 })
      .limit(5);

    res.status(200).json({
      success: true,
      stats: {
        totalDocuments,
        recentlyOpened,
        totalBookmarks,
        totalNotes
      },
      continueReading,
      recentActivity,
      recentQuestions,
      allBookmarks,
      allNotes
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Global Search across documents, bookmarks, and notes
 * @route   GET /api/documents/search
 * @access  Private
 */
exports.globalSearch = async (req, res, next) => {
  try {
    const q = req.query.q ? req.query.q.trim().toLowerCase() : '';
    if (!q) {
      return res.status(200).json({ success: true, results: [] });
    }

    const docs = await Document.find({ owner: req.user.id });
    const results = [];

    docs.forEach(d => {
      const titleMatch = d.title.toLowerCase().includes(q) || d.fileName.toLowerCase().includes(q);
      const contentMatch = d.rawText ? d.rawText.toLowerCase().includes(q) : false;

      const matchingBookmarks = (d.bookmarks || []).filter(b => b.title.toLowerCase().includes(q));
      const matchingNotes = (d.notes || []).filter(n => n.content.toLowerCase().includes(q));

      if (titleMatch || contentMatch || matchingBookmarks.length > 0 || matchingNotes.length > 0) {
        let snippet = '';
        if (contentMatch && d.rawText) {
          const idx = d.rawText.toLowerCase().indexOf(q);
          const start = Math.max(0, idx - 40);
          const end = Math.min(d.rawText.length, idx + 100);
          snippet = d.rawText.substring(start, end).replace(/\n/g, ' ') + '...';
        }

        results.push({
          documentId: d._id,
          title: d.title,
          fileName: d.fileName,
          lastPageRead: d.lastPageRead || 1,
          totalPages: d.totalPages || 1,
          snippet: snippet || d.title,
          bookmarksCount: matchingBookmarks.length,
          notesCount: matchingNotes.length,
          matchingBookmarks,
          matchingNotes
        });
      }
    });

    res.status(200).json({
      success: true,
      query: q,
      results
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get raw binary document file for PDF viewer or download
 * @route   GET /api/documents/:id/file
 * @access  Private (JWT Protected)
 */
exports.downloadDocumentFile = async (req, res, next) => {
  try {
    const doc = await Document.findById(req.params.id).select('+pdfBuffer');

    if (!doc) {
      return res.status(404).json({
        success: false,
        error: 'Document not found'
      });
    }

    if (doc.owner.toString() !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Access denied: You do not have permission to access this document file'
      });
    }

    if (!doc.pdfBuffer || doc.pdfBuffer.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Binary file content unavailable for this document'
      });
    }

    const isPdf = doc.mimeType === 'application/pdf' || (doc.fileName && doc.fileName.toLowerCase().endsWith('.pdf'));

    res.set({
      'Content-Type': isPdf ? 'application/pdf' : 'text/plain; charset=utf-8',
      'Content-Disposition': `inline; filename="${encodeURIComponent(doc.fileName)}"`
    });

    return res.status(200).send(doc.pdfBuffer);
  } catch (error) {
    next(error);
  }
};

exports.getDocumentFile = exports.downloadDocumentFile;
