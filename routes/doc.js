const express = require('express');
const router = express.Router();

// Middleware
const authMiddleware = require('../middleware/authMiddleware');
const checkRole = require('../middleware/checkRole');

//  POST: Uploader submits a document
router.post(
  '/submit',
  authMiddleware,
  checkRole(['uploader']),
  (req, res) => {
    const { title, content } = req.body;

    // TODO: Save document to DB here
    console.log(`New submission by ${req.user.role}:`, { title, content });

    res.status(201).json({ message: 'Document submitted successfully.' });
  }
);

//  GET: Reviewer views submitted documents
router.get(
  '/review-submissions',
  authMiddleware,
  checkRole(['admin', 'reviewer']),
  (req, res) => {
    // TODO: Fetch documents from DB
    const mockDocuments = [
      { id: 1, title: 'Proposal 101', submittedBy: 'uploaderA' },
      { id: 2, title: 'Research Draft', submittedBy: 'uploaderB' },
    ];

    res.json({
      message: 'Reviewer access granted.',
      documents: mockDocuments,
    });
  }
);

// Admin route: see all submission metadata
router.get(
  '/admin-overview',
  authMiddleware,
  checkRole(['admin']),
  (req, res) => {
    // TODO: Pull audit logs or metadata
    res.json({ message: 'Admin access granted.', overview: { total: 42 } });
  }
);

module.exports = router;
