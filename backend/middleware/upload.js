const multer = require('multer');
const path = require('path');

// Use memory storage for direct buffer processing and text extraction
const storage = multer.memoryStorage();

// File filter to support documents (.pdf, .txt, .md, .json, .csv)
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ['application/pdf', 'text/plain', 'text/csv', 'application/json', 'text/markdown', 'application/octet-stream'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedMimeTypes.includes(file.mimetype) || ['.pdf', '.txt', '.md', '.json', '.csv', '.log'].includes(ext)) {
    cb(null, true);
  } else {
    cb(null, true); // Allow upload and let textExtractor handle parsing
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 15 * 1024 * 1024 // 15MB limit
  },
  fileFilter: fileFilter
});

module.exports = upload;
