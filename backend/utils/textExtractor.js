const pdfModule = require('pdf-parse');
const pdfjsLib = require('pdfjs-dist/build/pdf.js');
const { createWorker } = require('tesseract.js');

/**
 * Custom page render callback for pdf-parse to preserve page numbers
 */
function pageRenderCallback(pageData) {
  const pageNum = pageData.pageIndex + 1;
  return pageData.getTextContent({ normalizeWhitespace: true })
    .then(function(textContent) {
      let text = '';
      for (const item of textContent.items) {
        text += item.str + ' ';
      }
      return `\n--- PAGE ${pageNum} ---\n${text.trim()}`;
    });
}

/**
 * Validate extracted text quality to determine if native or OCR extraction produced usable text
 */
const isMeaningfulExtractedText = (text) => {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (trimmed.length < 15) return false;

  const lower = trimmed.toLowerCase();
  if (lower.includes('scanned or image-only pdf') ||
      lower.includes('text content not extractable') ||
      lower.includes('unable to load pdf') ||
      lower.includes('no text content extracted')) {
    return false;
  }

  // Reject PDF source binary header & object stream syntax
  if (trimmed.startsWith('%PDF-') || /^\s*%PDF/i.test(trimmed)) return false;
  if (/\b\d+\s+\d+\s+obj\b/i.test(trimmed) && /\bendobj\b/i.test(trimmed)) return false;
  if (/\bstream\b[\s\S]*?\bendstream\b/i.test(trimmed)) return false;

  // Count alphanumeric characters
  const alphaNumMatches = trimmed.match(/[a-zA-Z0-9]/g) || [];
  if (alphaNumMatches.length < 10) return false;

  // Check character density (ratio of alphanumeric chars to total length)
  const alphaRatio = alphaNumMatches.length / trimmed.length;
  if (alphaRatio < 0.20) return false;

  return true;
};

/**
 * Helper: Extract embedded JPEG buffers directly from PDF stream
 */
function extractJpegBuffersFromPdf(buffer) {
  const jpegs = [];
  let i = 0;
  while (i < buffer.length - 3) {
    if (buffer[i] === 0xFF && buffer[i + 1] === 0xD8 && buffer[i + 2] === 0xFF) {
      const start = i;
      let j = start + 3;
      while (j < buffer.length - 1) {
        if (buffer[j] === 0xFF && buffer[j + 1] === 0xD9) {
          const end = j + 2;
          const jpegBuf = buffer.slice(start, end);
          if (jpegBuf.length > 1000) {
            jpegs.push(jpegBuf);
          }
          i = end;
          break;
        }
        j++;
      }
      if (j >= buffer.length - 1) {
        i++;
      }
    } else {
      i++;
    }
  }
  return jpegs;
}

/**
 * Helper: Convert raw RGBA pixel data to uncompressed BMP Buffer for Tesseract
 */
function createBmpBuffer(width, height, rgbaData) {
  const rowSize = Math.floor((24 * width + 31) / 32) * 4;
  const pixelArraySize = rowSize * height;
  const fileSize = 54 + pixelArraySize;

  const buf = Buffer.alloc(fileSize);
  buf.write('BM', 0);
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(-height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30);
  buf.writeUInt32LE(pixelArraySize, 34);

  let srcIdx = 0;
  for (let y = 0; y < height; y++) {
    const rowOffset = 54 + y * rowSize;
    for (let x = 0; x < width; x++) {
      buf[rowOffset + x * 3] = rgbaData[srcIdx + 2] || 0;
      buf[rowOffset + x * 3 + 1] = rgbaData[srcIdx + 1] || 0;
      buf[rowOffset + x * 3 + 2] = rgbaData[srcIdx] || 0;
      srcIdx += (rgbaData.length === width * height * 4) ? 4 : 3;
    }
  }
  return buf;
}

/**
 * OCR Engine Fallback for scanned or image-only PDFs
 * Extract page image frames and perform Tesseract OCR page-by-page
 */
const ocrPdfBuffer = async (buffer) => {
  console.log('[PDF OCR] Starting OCR fallback process on PDF buffer...');

  const pageImageBuffers = [];

  // Method A: Extract embedded JPEG images directly
  const embeddedJpegs = extractJpegBuffersFromPdf(buffer);
  if (embeddedJpegs.length > 0) {
    embeddedJpegs.forEach(imgBuf => pageImageBuffers.push(imgBuf));
  }

  // Method B: PDF.js Operator List Object Extraction fallback
  if (pageImageBuffers.length === 0) {
    try {
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(buffer),
        disableFontFace: true
      });
      const pdfDoc = await loadingTask.promise;

      for (let p = 1; p <= pdfDoc.numPages; p++) {
        const page = await pdfDoc.getPage(p);
        const ops = await page.getOperatorList();

        for (let i = 0; i < ops.fnArray.length; i++) {
          const op = ops.fnArray[i];
          if (op === pdfjsLib.OPS.paintImageXObject || op === pdfjsLib.OPS.paintInlineImageXObject) {
            const imgName = ops.argsArray[i][0];
            try {
              const imgObj = await new Promise(resolve => page.objs.get(imgName, obj => resolve(obj)));
              if (imgObj && imgObj.data && imgObj.width > 50 && imgObj.height > 50) {
                const bmpBuf = createBmpBuffer(imgObj.width, imgObj.height, imgObj.data);
                pageImageBuffers.push(bmpBuf);
              }
            } catch (e) {
              // skip failed object
            }
          }
        }
      }
    } catch (pdfErr) {
      console.warn('[PDF OCR Warning] PDF.js operator list extraction error:', pdfErr.message);
    }
  }

  if (pageImageBuffers.length === 0) {
    console.warn('[PDF OCR Warning] No image frames could be extracted for OCR processing.');
    return null;
  }

  console.log(`[PDF OCR] Extracted ${pageImageBuffers.length} page image frame(s). Initializing Tesseract OCR worker...`);

  let worker = null;
  const pages = [];
  let fullText = '';

  try {
    worker = await createWorker('eng');

    for (let i = 0; i < pageImageBuffers.length; i++) {
      const pageNum = i + 1;
      const imgBuf = pageImageBuffers[i];

      const ret = await worker.recognize(imgBuf);
      const pageText = (ret && ret.data && ret.data.text) ? ret.data.text.trim() : '';

      console.log('[PDF OCR]', {
        documentId: 'IN_MEMORY',
        pageNumber: pageNum,
        ocrTextLength: pageText.length
      });

      if (pageText) {
        pages.push({
          pageNumber: pageNum,
          text: pageText
        });
        fullText += `\n--- PAGE ${pageNum} ---\n${pageText}\n`;
      }
    }
  } catch (ocrErr) {
    console.warn('[PDF OCR Warning] Tesseract OCR recognition failed:', ocrErr.message);
  } finally {
    if (worker) {
      try {
        await worker.terminate();
      } catch (tErr) {}
    }
  }

  const cleanText = fullText.trim();
  if (!isMeaningfulExtractedText(cleanText)) {
    console.warn('[PDF OCR Warning] OCR output was unreadable or insufficient.');
    return null;
  }

  return {
    rawText: cleanText,
    pageCount: pages.length,
    pages: pages,
    extractionMethod: 'ocr'
  };
};

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

  // Build page-by-page structured text
  if (text) {
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
  }

  const isNativeValid = isMeaningfulExtractedText(text);

  if (isNativeValid) {
    console.log('[PDF EXTRACTION]', {
      extractionMethod: 'native',
      textLength: text.length,
      pageCount: pageCount
    });

    if (pages.length === 0) {
      pages.push({ pageNumber: 1, text });
    }

    return {
      rawText: text,
      pageCount: Math.max(pageCount, pages.length),
      pages: pages,
      extractionMethod: 'native'
    };
  }

  // Fallback: If native extraction produced no meaningful text, trigger OCR fallback
  console.log('[PDF EXTRACTION] Native extraction produced no meaningful text. Triggering OCR fallback...');

  const ocrResult = await ocrPdfBuffer(buffer);
  if (ocrResult && ocrResult.rawText) {
    console.log('[PDF EXTRACTION RESULT]', {
      method: 'ocr',
      pagesProcessed: ocrResult.pages.length,
      totalTextLength: ocrResult.rawText.length
    });
    return ocrResult;
  }

  // Both native & OCR failed -> set clean scanned-PDF placeholder
  console.log('[PDF EXTRACTION RESULT]', {
    method: 'none',
    status: 'unextractable'
  });

  const placeholderText = '[Document: Scanned or image-only PDF - text content not extractable]';
  return {
    rawText: placeholderText,
    pageCount: 1,
    pages: [{ pageNumber: 1, text: placeholderText }],
    extractionMethod: 'none'
  };
};

/**
 * Text Extraction Engine for Document Gateway
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

  try {
    const text = buffer.toString('utf-8').trim();
    if (!text || text.length === 0) {
      throw new Error('Extracted file content is empty.');
    }
    return {
      rawText: text,
      pageCount: 1,
      pages: [{ pageNumber: 1, text }],
      extractionMethod: 'native'
    };
  } catch (err) {
    throw new Error(`Failed to extract text content: ${err.message}`);
  }
};

module.exports = {
  extractTextFromBuffer,
  isMeaningfulExtractedText
};
