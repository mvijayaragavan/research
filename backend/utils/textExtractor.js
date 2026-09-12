const pdfModule = require('pdf-parse');

/**
 * Custom page render callback for pdf-parse to preserve page numbers
 */
function pageRenderCallback(pageData) {
  const pageNum = pageData.pageIndex + 1;
  return pageData.getTextContent({ normalizeWhitespace: true })
    .then(function(textContent) {
      let lastY, text = '';
      for (const item of textContent.items) {
        text += item.str + ' ';
      }
      return `\n--- PAGE ${pageNum} ---\n${text.trim()}`;
    });
}

/**
 * Robust PDF Buffer Text Parser returning page-by-page text structure
 */
const parsePdfBuffer = async (buffer) => {
  let text = '';
  let pageCount = 1;
  let pages = [];

  try {
    const parseFn = typeof pdfModule === 'function' ? pdfModule : (pdfModule && pdfModule.default ? pdfModule.default : null);

    if (parseFn) {
      const options = { pagerender: pageRenderCallback };
      const data = await parseFn(buffer, options);
      text = data.text ? data.text.trim() : '';
      pageCount = data.numpages || 1;
    }
  } catch (err) {
    console.warn('[Text Extractor Warning] Custom page rendering failed, trying standard pdf-parse:', err.message);
    try {
      const parseFn = typeof pdfModule === 'function' ? pdfModule : (pdfModule && pdfModule.default ? pdfModule.default : null);
      if (parseFn) {
        const data = await parseFn(buffer);
        text = data.text ? data.text.trim() : '';
        pageCount = data.numpages || 1;
      }
    } catch (e2) {
      console.warn('[Text Extractor Warning] Standard pdf-parse error:', e2.message);
    }
  }

  // Fallback: Extract printable text streams from raw buffer if text empty
  if (!text || text.length === 0) {
    const rawStr = buffer.toString('utf-8');
    text = rawStr.replace(/[\x00-\x08\x0E-\x1F\x7F-\x9F]/g, ' ').replace(/[ \t]+/g, ' ').trim();
  }

  if (!text || text.length === 0) {
    throw new Error('PDF contains no extractable text content.');
  }

  // Build page-by-page structured text
  const pageBlocks = text.split(/(?:^|\n)---\s*PAGE\s*(\d+)\s*---\s*\n?/i);
  if (pageBlocks.length > 1) {
    for (let i = 1; i < pageBlocks.length; i += 2) {
      const pNum = parseInt(pageBlocks[i], 10) || 1;
      const pText = (pageBlocks[i + 1] || '').trim();
      if (pText) {
        pages.push({ pageNumber: pNum, text: pText });
      }
    }
  }

  if (pages.length === 0) {
    pages.push({ pageNumber: 1, text });
  } else {
    pageCount = Math.max(pageCount, pages.length);
  }

  return {
    rawText: text,
    pageCount: pageCount,
    pages: pages
  };
};

/**
 * Text Extraction Engine for Document Gateway
 * Supports .pdf and all plain text / structured document formats (.txt, .md, .csv, .json, .log, etc.)
 */
const extractTextFromBuffer = async (buffer, mimeType, fileName) => {
  if (!buffer || buffer.length === 0) {
    throw new Error('Uploaded file buffer is empty.');
  }

  const cleanName = (fileName || '').toLowerCase();
  const cleanMime = (mimeType || '').toLowerCase();
  const isPdf = cleanMime === 'application/pdf' || cleanName.endsWith('.pdf');

  if (isPdf) {
    try {
      return await parsePdfBuffer(buffer);
    } catch (err) {
      console.error('[Text Extractor Error] PDF parsing failed:', err.message);
      throw new Error(`Failed to parse PDF document: ${err.message}`);
    }
  }

  // Text/Document formats (.txt, .md, .csv, .json, .log)
  try {
    const text = buffer.toString('utf-8').trim();
    if (!text || text.length === 0) {
      throw new Error('Extracted file content is empty.');
    }
    return {
      rawText: text,
      pageCount: 1,
      pages: [{ pageNumber: 1, text }]
    };
  } catch (err) {
    throw new Error(`Failed to extract text content: ${err.message}`);
  }
};

module.exports = {
  extractTextFromBuffer
};
