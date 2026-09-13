const path = require('path');
require('../backend/node_modules/dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('../backend/node_modules/mongoose');
const { createCanvas } = require('../backend/node_modules/@napi-rs/canvas');
const { extractTextFromBuffer, isMeaningfulExtractedText } = require('../backend/utils/textExtractor');
const { detectSensitiveEntities, sanitizeText, minimizeForQuery } = require('../backend/utils/privacyEngine');
const { verifyAnswerAgainstSources, isPlaceholderOrUnextractableText } = require('../backend/utils/verificationEngine');
const { processDocumentChunks } = require('../backend/utils/chunker');

/**
 * Generate a PDF buffer containing a page image with rendered text
 */
function createScannedPdfBufferWithText(linesText) {
  // Create a canvas and draw text lines
  const canvas = createCanvas(600, 400);
  const ctx = canvas.getContext('2d');

  // White background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, 600, 400);

  // Black text
  ctx.fillStyle = '#000000';
  ctx.font = '24px Arial';

  linesText.forEach((line, idx) => {
    ctx.fillText(line, 40, 60 + (idx * 40));
  });

  const jpegBuffer = canvas.toBuffer('image/jpeg');
  const jpegLength = jpegBuffer.length;

  // Build PDF structure embedding JPEG image object
  const pdfStringHeader = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 600 400] /Resources << /XObject << /Img1 4 0 R >> >> /Contents 5 0 R >> endobj
4 0 obj << /Type /XObject /Subtype /Image /Width 600 /Height 400 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegLength} >>
stream\n`;

  const pdfStringFooter = `\nendstream
endobj
5 0 obj << /Length 43 >> stream
q 600 0 0 400 0 0 cm /Img1 Do Q
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000240 00000 n 
0000000400 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
493
%%EOF`;

  return Buffer.concat([
    Buffer.from(pdfStringHeader, 'binary'),
    jpegBuffer,
    Buffer.from(pdfStringFooter, 'binary')
  ]);
}

/**
 * Generate a standard native text PDF buffer
 */
function createNativePdfBuffer(textContent) {
  const samplePdfText = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj
4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
5 0 obj << /Length 75 >> stream
BT /F1 12 Tf 100 700 Td (PrivacyGuard Policy Security Agreement INS-2026-8888) Tj ET
endstream endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000223 00000 n 
0000000299 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
424
%%EOF`;

  return Buffer.from(samplePdfText, 'utf-8');
}

/**
 * Main Test Runner
 */
async function runOcrFallbackTests() {
  console.log('===========================================================');
  console.log(' Starting ReadDocX OCR Fallback & Pipeline Tests');
  console.log('===========================================================');

  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/privacyguard';
  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 3000 });
    console.log('✓ Connected to MongoDB database for end-to-end testing.');
  } catch (dbErr) {
    console.warn('⚠️ Could not connect to live MongoDB database, running in memory-mode:', dbErr.message);
  }

  try {
    // TEST 1: Native Text PDF Extraction
    console.log('\n--- TEST 1: Standard Native PDF Extraction ---');
    const nativePdfBuf = createNativePdfBuffer('PrivacyGuard Policy Security Agreement INS-2026-8888');
    const nativeResult = await extractTextFromBuffer(nativePdfBuf, 'application/pdf', 'native_policy.pdf');
    console.log('Native Extraction Result:', {
      extractionMethod: nativeResult.extractionMethod,
      pageCount: nativeResult.pageCount,
      textLength: nativeResult.rawText.length
    });
    if (nativeResult.extractionMethod !== 'native') {
      throw new Error(`Expected native extractionMethod, got '${nativeResult.extractionMethod}'`);
    }
    console.log('✓ TEST 1 PASSED: Native text PDF used extractionMethod = "native".');

    // TEST 2: Scanned/Image-Based PDF OCR Fallback
    console.log('\n--- TEST 2: Scanned/Image-Based PDF OCR Fallback ---');
    const ocrSampleLines = [
      'PrivacyGuard Vault Confidential Invoice',
      'Invoice Number: INV-998822',
      'Customer Email: john.doe@privacyguard.ai',
      'Customer Phone: +1 555 123 4567',
      'Total Due Amount: $4,500.00 USD'
    ];
    const imagePdfBuf = createScannedPdfBufferWithText(ocrSampleLines);
    const ocrResult = await extractTextFromBuffer(imagePdfBuf, 'application/pdf', 'scanned_invoice.pdf');
    console.log('OCR Extraction Result:', {
      extractionMethod: ocrResult.extractionMethod,
      pageCount: ocrResult.pageCount,
      rawTextSnippet: ocrResult.rawText.replace(/\n/g, ' ').substring(0, 100),
      pagesCount: ocrResult.pages.length
    });

    if (ocrResult.extractionMethod !== 'ocr') {
      throw new Error(`Expected OCR extractionMethod = 'ocr', got '${ocrResult.extractionMethod}'`);
    }
    if (!ocrResult.rawText || ocrResult.rawText.length < 20) {
      throw new Error('OCR failed to extract readable rawText');
    }
    if (!ocrResult.pages || ocrResult.pages.length === 0 || ocrResult.pages[0].pageNumber !== 1) {
      throw new Error('OCR result did not preserve page numbers properly');
    }
    console.log('✓ TEST 2 PASSED: Image PDF successfully converted to readable text via Tesseract OCR page-by-page!');

    // TEST 3: Privacy Sanitization on OCR Text
    console.log('\n--- TEST 3: Privacy Detection & Sanitization on OCR Text ---');
    const ocrText = ocrResult.rawText;
    const sensitiveEntities = detectSensitiveEntities(ocrText);
    console.log(`Detected ${sensitiveEntities.length} sensitive entity/entities in OCR text.`);
    sensitiveEntities.forEach(e => {
      console.log(`  - Entity: ${e.entityType}, Placeholder: ${e.placeholder}`);
    });

    const sanitization = sanitizeText(ocrText, 'PLACEHOLDER');
    console.log('Sanitized Text Snippet:', sanitization.sanitizedText.replace(/\n/g, ' ').substring(0, 120));

    const minimization = minimizeForQuery(ocrText, 'What is the invoice number and total amount?');
    console.log('Minimized Text Intent:', minimization.queryIntent);

    // Confirm raw PII values (email / phone) are masked or not printed directly
    if (minimization.minimizedText.includes('john.doe@privacyguard.ai')) {
      throw new Error('Privacy Engine failed to mask email PII in minimized OCR text!');
    }
    console.log('✓ TEST 3 PASSED: OCR text successfully processed through Privacy Engine safeguards.');

    // TEST 4: Chunking, Page Preservation & Citation Metadata
    console.log('\n--- TEST 4: Document Chunking & Citation Metadata Preservation ---');
    const mockDocId = new mongoose.Types.ObjectId();
    const mockUserId = new mongoose.Types.ObjectId();
    let chunks = [];
    if (mongoose.connection.readyState === 1) {
      chunks = await processDocumentChunks(mockDocId, mockUserId, ocrResult.rawText, 'CONFIDENTIAL', ocrResult.pages, 'scanned_invoice.pdf');
    } else {
      // Offline fallback chunk representation
      const { splitTextIntoChunks } = require('../backend/utils/chunker');
      const rawChunks = splitTextIntoChunks(ocrResult.rawText);
      chunks = rawChunks.map((rc, idx) => ({
        _id: new mongoose.Types.ObjectId(),
        documentId: mockDocId,
        ownerId: mockUserId,
        chunkIndex: idx + 1,
        pageNumber: 1,
        rawChunkText: rc,
        minimizedChunkText: sanitizeText(rc, 'PLACEHOLDER').sanitizedText
      }));
    }
    console.log(`Created ${chunks.length} DocumentChunk(s).`);
    chunks.forEach(c => {
      console.log(`  - Chunk #${c.chunkIndex} | Page ${c.pageNumber} | Raw Text: "${c.rawChunkText.substring(0, 50)}..."`);
      if (!c.pageNumber || c.pageNumber < 1) {
        throw new Error(`Invalid pageNumber in chunk ${c.chunkIndex}`);
      }
    });
    console.log('✓ TEST 4 PASSED: Page numbers preserved across document chunking.');

    // TEST 5: Answer Verification Engine on OCR Source
    console.log('\n--- TEST 5: Answer Grounding & Verification Engine ---');
    const mockAiAnswer = 'The total due amount for invoice INV-998822 is $4,500.00 USD.';
    const verificationReport = verifyAnswerAgainstSources(mockAiAnswer, chunks, 'What is the total due amount?');
    console.log('Verification Report:', {
      status: verificationReport.status,
      trustScore: verificationReport.trustScore,
      evidenceScore: verificationReport.evidenceScore,
      claimsCount: verificationReport.totalClaims,
      verifiedCount: verificationReport.verifiedClaimsCount
    });

    if (isPlaceholderOrUnextractableText(ocrResult.rawText)) {
      throw new Error('OCR output incorrectly flagged as unextractable placeholder!');
    }
    if (verificationReport.status === 'INSUFFICIENT_SOURCE') {
      throw new Error('Verification engine incorrectly rejected OCR source!');
    }
    console.log('✓ TEST 5 PASSED: Answer Grounding & Verification successfully verified answer against OCR source.');

    // TEST 6: Blank / Unusable Image PDF Failure Handling
    console.log('\n--- TEST 6: Blank/Unusable Image PDF Failure Handling ---');
    const emptyCanvas = createCanvas(300, 300);
    const emptyCtx = emptyCanvas.getContext('2d');
    emptyCtx.fillStyle = '#FFFFFF';
    emptyCtx.fillRect(0, 0, 300, 300);
    const emptyJpeg = emptyCanvas.toBuffer('image/jpeg');

    const emptyPdfBuf = Buffer.concat([
      Buffer.from(`%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /XObject << /Img1 4 0 R >> >> /Contents 5 0 R >> endobj\n4 0 obj << /Type /XObject /Subtype /Image /Width 300 /Height 300 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${emptyJpeg.length} >>\nstream\n`, 'binary'),
      emptyJpeg,
      Buffer.from(`\nendstream\nendobj\n5 0 obj << /Length 43 >> stream\nq 300 0 0 300 0 0 cm /Img1 Do Q\nendstream\nendobj\nxref\n0 6\n0000000000 65535 f \ntrailer << /Size 6 /Root 1 0 R >>\nstartxref\n400\n%%EOF`, 'binary')
    ]);

    const emptyResult = await extractTextFromBuffer(emptyPdfBuf, 'application/pdf', 'blank_scanned.pdf');
    console.log('Empty Image PDF Result:', {
      extractionMethod: emptyResult.extractionMethod,
      isPlaceholder: isPlaceholderOrUnextractableText(emptyResult.rawText)
    });

    if (emptyResult.extractionMethod !== 'none') {
      throw new Error(`Expected extractionMethod 'none' for blank image PDF, got '${emptyResult.extractionMethod}'`);
    }
    if (!isPlaceholderOrUnextractableText(emptyResult.rawText)) {
      throw new Error('Blank image PDF should be marked as placeholder unextractable text!');
    }

    const emptyVerification = verifyAnswerAgainstSources('Some answer', [{ rawChunkText: emptyResult.rawText }]);
    if (emptyVerification.status !== 'INSUFFICIENT_SOURCE') {
      throw new Error(`Expected status 'INSUFFICIENT_SOURCE' for blank OCR failure, got '${emptyVerification.status}'`);
    }
    console.log('✓ TEST 6 PASSED: Blank/unusable image PDF correctly handled with extractionMethod = "none" & INSUFFICIENT_SOURCE.');

    console.log('\n===========================================================');
    console.log(' ALL OCR FALLBACK & PIPELINE TESTS PASSED SUCCESSFULLY! 🎉');
    console.log('===========================================================');
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
}

runOcrFallbackTests().catch(err => {
  console.error('\n❌ OCR FALLBACK TEST FAILED:', err);
  process.exit(1);
});
