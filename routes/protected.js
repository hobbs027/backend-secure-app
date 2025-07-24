const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifytoken');
const authorizeRole = require('../middleware/authorizerole');
const fs = require('fs');
const path = require('path');
const auditFile = path.join(__dirname, '..', 'audit.log');
const { addToLedger } = require('../ledger');
const ledgerPath = path.join(__dirname, '..', 'ledger.json');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const uploadsDir = path.join(__dirname, '..', 'uploads');
const archiver = require('archiver');
const { Parser } = require('json2csv');

router.get('/secure-info', verifyToken, (req, res) => {
  res.json({
    message: `Welcome, user ${req.user.id}!`,
    role: req.user.role
  });
});

router.get('/admin-dashboard', verifyToken, authorizeRole(['admin']), (req, res) => {
  res.json({
    message: 'Hello, Admin! You can view audit logs and manage users.',
    user: req.user
  });
});
const uploadFile = require('../middleware/uploadFile');
const { log } = require('console');

router.post('/upload', verifyToken, authorizeRole(['admin']), uploadFile, (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded or invalid file type' });
  }

  const logEntry = {
    userId: req.user.id,
    filename: req.file.filename,
    timestamp: new Date().toISOString(),
    ip: req.ip
  };

  const logPath = path.join(__dirname, '..', 'audit.log');
  fs.appendFile(logPath, JSON.stringify(logEntry) + '\n', err => {
    if (err) {
      console.error("Failed to write audit log:", err.message);
    } else {
      console.log("Audit log written:", logEntry);
    }
  });

  const { addToLedger } = require('../ledger');
  addToLedger({
    userId: req.user.id,
    filename: req.file.filename,
    action: 'upload'
  });

  res.json({
    message: 'File uploaded successfully',
    filename: req.file.filename,
    logged: true
  });
});

router.get('/audit', verifyToken, authorizeRole(['admin']), (req, res) => {
  const logPath = path.join(__dirname, '..', 'audit.log');
  fs.readFile(logPath, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).json({ message: 'Failed to read audit log' });
    }

    const entries = data
      .split('\n')
      .filter(line => line.trim() !== '')
      .map(line => {
        try {
          return JSON.parse(line);
        } catch (parseErr) {
          return { error: 'Malformed log entry' };
        }
      });

    res.json({ auditLog: entries });
  });
});

router.get('/download/:filename', verifyToken, authorizeRole(['admin']), (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(__dirname, '..', 'uploads', filename);

  fs.access(filePath, fs.constants.F_OK, err => {
    if (err) {
      return res.status(404).json({ message: 'File not found' });
    }

  
    const logEntry = {
      userId: req.user.id,
      action: 'download',
      filename,
      timestamp: new Date().toISOString(),
      ip: req.ip
    };

    const logPath = path.join(__dirname, '..', 'audit.log');
    fs.appendFile(logPath, JSON.stringify(logEntry) + '\n', err => {
      if (err) console.error("Failed to log download:", err.message);
    });

    addToLedger({
      userId: req.user.id,
      filename,
      action: 'download'
    });

    res.download(filePath);
  });
});

router.get('/files', verifyToken, authorizeRole(['admin']), (req, res) => {
  console.log("File listing requested by user:", req.user);

  try {
    const uploadPath = path.join(__dirname, '..', 'uploads');

    fs.readdir(uploadPath, (err, files) => {
      if (err) {
        console.error("Failed to read uploads directory:", err.message);
        return res.status(500).json({ message: 'Failed to read uploads directory' });
      }

      if (!files || files.length === 0) {
        console.log("No files found in uploads directory.");
        return res.json({ files: [] });
      }

      const fileList = [];

      for (const file of files) {
        const parts = file.split('_');
        if (parts.length < 2) {
          console.warn("Skipping malformed filename:", file);
          continue;
        }

        const [userId, timestampWithExt] = parts;
        const timestamp = timestampWithExt?.split('.')[0];

        if (!timestamp || isNaN(Number(timestamp))) {
          console.warn("Invalid timestamp in filename:", file);
          continue;
        }

        fileList.push({
          filename: file,
          uploadedBy: userId,
          uploadedAt: new Date(Number(timestamp)).toISOString()
        });
      }

      res.json({ files: fileList });
    });

  } catch (err) {
    console.error("Unexpected error in /files route:", err.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/delete/:filename', verifyToken, authorizeRole(['admin']), (req, res) => {
  const fileToDelete = req.params.filename;
  const filePath = path.join(__dirname, '..', 'uploads', fileToDelete);

  fs.access(filePath, fs.constants.F_OK, err => {
    if (err) {
      return res.status(404).json({ message: 'File not found' });
    }

    fs.unlink(filePath, unlinkErr => {
      if (unlinkErr) {
        console.error("Error deleting file:", unlinkErr.message);
        return res.status(500).json({ message: 'Failed to delete file' });
      }

      
      const logEntry = {
        userId: req.user.id,
        filename: fileToDelete,
        action: 'delete',
        timestamp: new Date().toISOString(),
        ip: req.ip
      };
      fs.appendFile(auditFile, JSON.stringify(logEntry) + '\n', () => {});

      addToLedger({
        userId: req.user.id,
        filename: fileToDelete,
        action: 'delete'
      });

      res.json({ message: 'File deleted successfully', logged: true });
    });
  });
});

router.get('/summary', verifyToken, authorizeRole(['admin']), (req, res) => {
  const uploadPath = path.join(__dirname, '..', 'uploads');
  const auditPath = path.join(__dirname, '..', 'audit.log');

  try {
    const fileCounts = {};
    const files = fs.readdirSync(uploadPath);

    for (const file of files) {
      const userId = file.split('_')[0];
      fileCounts[userId] = (fileCounts[userId] || 0) + 1;
    }

    
    const auditEntries = fs.readFileSync(auditPath, 'utf8')
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      }).filter(entry => entry !== null);

    const actionSummary = { upload: 0, download: 0, delete: 0 };
    auditEntries.forEach(entry => {
      if (entry.action && actionSummary.hasOwnProperty(entry.action)) {
        actionSummary[entry.action]++;
      }
    });

    res.json({
      totalFiles: files.length,
      fileCountsByUser: fileCounts,
      auditSummary: actionSummary
    });

  } catch (err) {
    console.error("Error in summary route:", err.message);
    res.status(500).json({ message: 'Failed to generate summary' });
  }
});

router.get('/download/:filename', verifyToken, authorizeRole(['admin']), (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, '..', 'uploads', filename);

  fs.access(filePath, fs.constants.F_OK, err => {
    if (err) {
      return res.status(404).json({ message: 'File not found' });
    }

    
    const logEntry = {
      userId: req.user.id,
      filename,
      action: 'download',
      timestamp: new Date().toISOString(),
      ip: req.ip
    };
    fs.appendFile(path.join(__dirname, '..', 'audit.log'), JSON.stringify(logEntry) + '\n', () => {});

    
    res.download(filePath, filename, downloadErr => {
      if (downloadErr) {
        console.error("Download failed:", downloadErr.message);
        res.status(500).json({ message: 'Download failed' });
      }
    });
  });
});

router.get('/audit/search', verifyToken, authorizeRole(['admin']), (req, res) => {
  const { userId, action } = req.query;
  const auditPath = path.join(__dirname, '..', 'audit.log');

  try {
    const entries = fs.readFileSync(auditPath, 'utf8')
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      }).filter(entry => entry !== null);

    const filtered = entries.filter(entry => {
      if (userId && entry.userId != userId) return false;
      if (action && entry.action !== action) return false;
      return true;
    });

    res.json({ results: filtered });

  } catch (err) {
    console.error("Error filtering audit log:", err.message);
    res.status(500).json({ message: 'Failed to filter audit log' });
  }
});

router.get('/file-types', verifyToken, authorizeRole(['admin']), (req, res) => {
  const uploadPath = path.join(__dirname, '..', 'uploads');

  fs.readdir(uploadPath, (err, files) => {
    if (err) {
      console.error("Failed to read uploads directory:", err.message);
      return res.status(500).json({ message: 'Could not read uploads directory' });
    }

    const extensions = new Set();

    files.forEach(file => {
      const ext = file.split('.').pop().toLowerCase();
      if (ext) extensions.add(ext);
    });

    res.json({ fileTypes: Array.from(extensions) });
  });
});

router.get('/audit/file/:filename', verifyToken, authorizeRole(['admin']), (req, res) => {
  const filename = req.params.filename;
  const auditPath = path.join(__dirname, '..', 'audit.log');

  try {
    const entries = fs.readFileSync(auditPath, 'utf8')
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      }).filter(entry => entry !== null);

    const history = entries.filter(entry => entry.filename === filename);

    res.json({
      filename,
      accessCount: history.length,
      actions: history
    });

  } catch (err) {
    console.error("Error reading file history:", err.message);
    res.status(500).json({ message: 'Failed to read file history' });
  }
});

router.get('/activity/user/:id', verifyToken, authorizeRole(['admin']), (req, res) => {
  const userId = req.params.id;
  const auditPath = path.join(__dirname, '..', 'audit.log');

  try {
    const entries = fs.readFileSync(auditPath, 'utf8')
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      }).filter(entry => entry !== null);

    const userActions = entries.filter(entry => entry.userId == userId);

    const counts = userActions.reduce((acc, entry) => {
      acc[entry.action] = (acc[entry.action] || 0) + 1;
      return acc;
    }, {});

    res.json({
      userId,
      totalActions: userActions.length,
      breakdown: counts
    });

  } catch (err) {
    console.error("Error in activity summary route:", err.message);
    res.status(500).json({ message: 'Failed to generate user activity summary' });
  }
});


router.get('/ledger/view', verifyToken, authorizeRole(['admin']), (req, res) => {
  try {
    if (!fs.existsSync(ledgerPath)) {
      return res.status(404).json({ message: 'Ledger not found' });
    }

    const chain = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    res.json({ chain });
  } catch (err) {
    console.error("Error reading ledger:", err.message);
    res.status(500).json({ message: 'Failed to load ledger' });
  }
});


router.get('/ledger/verify', verifyToken, authorizeRole(['admin']), (req, res) => {
  try {
    const ledgerPath = path.join(__dirname, '..', 'ledger.json');
    if (!fs.existsSync(ledgerPath)) {
      return res.status(404).json({ message: 'Ledger not found' });
    }

    const chain = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    const issues = [];

    for (let i = 0; i < chain.length; i++) {
      const block = chain[i];
      const expectedHash = crypto.createHash('sha256')
        .update(`${block.index}|${block.timestamp}|${block.userId}|${block.filename}|${block.action}|${block.previousHash}`)
        .digest('hex');

      if (block.hash !== expectedHash) {
        issues.push({ index: block.index, error: 'Hash mismatch' });
      }

      if (i > 0 && block.previousHash !== chain[i - 1].hash) {
        issues.push({ index: block.index, error: 'Broken chain link' });
      }
    }

    if (issues.length === 0) {
      res.json({ message: 'Ledger integrity verified. All blocks are valid.' });
    } else {
      res.json({ message: 'Ledger integrity issues found.', issues });
    }

  } catch (err) {
    console.error("Ledger verification error:", err.message);
    res.status(500).json({ message: 'Failed to verify ledger' });
  }
});

router.get('/me', verifyToken, (req, res) => {
  const {email, role} = req.user;
  res.json({ email, role });
});

router.get('/uploads/recent', verifyToken, async (req, res) => {
  const userId = req.user.email;
  // Read from your audit log or database
  const uploads = await getRecentUploadsByUser(userId); // implement this logic
  res.json({ uploads });
});

router.get('/uploads/stats/role', verifyToken, async (req, res) => {
  try {
    // Example: load ledger or audit log file
    const logs = JSON.parse(fs.readFileSync('ledger.json', 'utf8'));

    const roleCounts = {};
    logs.forEach(entry => {
      const role = entry.role || 'unknown'; // Ensure role is included in audit entries
      roleCounts[role] = (roleCounts[role] || 0) + 1;
    });

    res.json({ stats: roleCounts });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load upload stats.' });
  }
  const aliasMap = {
  "bank_statement.pdf": "Financial Report",
  "logo_v3.png": "Company Logo",
  "confidential_notes.pdf": "Confidential Upload",
  "design_mockup.jpg": "Design Preview",
  };
});

router.get('/files/list', verifyToken, (req, res) => {
  try {
    const logs = JSON.parse(fs.readFileSync('ledger.json', 'utf8'));
    const { email, role, status} = req.query;
    let filtered = logs;
    if (email) {
      filtered = filtered.filter(entry => entry.email === email);
    }
    if (role) {
      filtered = filtered.filter(entry => entry.role === role);
    }
    if (status) {
      filtered = filtered.filter(entry => entry.status)
    }

    if (req.query.email) {
      filtered = filtered.filter(log => log.email === req.query.email);
    }
    if (req.query.role) {
      filtered = filtered.filter(log => log.role === req.query.role);
    }
    if (filterStatus) params.append('status', filterStatus);

    const files = logs.map(entry => ({
      filename: entry.filename,
      alias: aliasMap[entry.filename] || null,
      timestamp: entry.timestamp,
      uploadedBy: entry.email,     
      role: entry.role,
      status: PerformanceNodeTiming,
    }));

    res.json({ files });
  } catch (err) {
    res.status(500).json({ message: 'Failed to list files.' });
  }
});


router.get('/uploads/stats/daily', verifyToken, async (req, res) => {
  const logs = JSON.parse(fs.readFileSync('ledger.json', 'utf8'));
  const {role,alias} = req.query;

  let filtered = logs;
  if (role) {
    filtered = filtered.filter(log => log.role === role);
  }
  if (alias) {
    filtered = filtered.filter(log => log.alias === alias);
  }
  const dailyCounts = {};
  filtered.forEach(entry => {
      const day = entry.timestamp.split('T')[0];
      dailyStats[day] = (dailyStats[day] || 0) + 1;
    });

    res.json({ stats: dailyCounts });
  
});

router.get('/files/meta', verifyToken, async (req, res) => {
  try {
    const logs = JSON.parse(fs.readFileSync('ledger.json', 'utf8'));

    const emails = [...new Set(logs.map(log => log.email))];
    const roles = [...new Set(logs.map(log => log.role))];

    res.json({ emails, roles });
  } catch {
    res.status(500).json({ message: 'Meta fetch failed' });
  }
});

router.get('/files/summary', verifyToken, async (req, res) => {
  try {
    const logs = JSON.parse(fs.readFileSync('ledger.json', 'utf8'));

    const total = logs.length;
    const uniqueUploaders = [...new Set(logs.map(log => log.email))];
    const roles = [...new Set(logs.map(log => log.role))];

    const uploadsPerRole = {};
    const aliasCount = {};

    logs.forEach(log => {
      uploadsPerRole[log.role] = (uploadsPerRole[log.role] || 0) + 1;
      if (log.alias) {
        aliasCount[log.alias] = (aliasCount[log.alias] || 0) + 1;
      }
    });

    const mostCommonAlias = Object.entries(aliasCount).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    res.json({
      totalFiles: total,
      uploaderCount: uniqueUploaders.length,
      uploadsPerRole,
      mostCommonAlias
    });
  } catch {
    res.status(500).json({ message: 'Failed to fetch summary' });
  }
});

router.put('/files/status/:filename', verifyToken, (req, res) => {
  const { status } = req.body;
  const filename = req.params.filename;

  const logs = JSON.parse(fs.readFileSync('ledger.json', 'utf8'));
  const index = logs.findIndex(entry => entry.filename === filename);

  if (index === -1) return res.status(404).json({ message: 'File not found' });

  logs[index].status = status;
  fs.writeFileSync('ledger.json', JSON.stringify(logs, null, 2));

  res.json({ message: 'Status updated', file: logs[index] });
});

router.put('/files/status/batch', verifyToken, (req, res) => {
  const { updates } = req.body; // Array of { filename, status }

  if (!Array.isArray(updates)) return res.status(400).json({ message: 'Invalid payload' });

  const logs = JSON.parse(fs.readFileSync('ledger.json', 'utf8'));
  const filenamesToUpdate = updates.map(u => u.filename);

  const updatedLogs = logs.map(log => {
    const match = updates.find(u => u.filename === log.filename);
    return match ? { ...log, status: match.status } : log;
  });

  const auditTrail = updates.map(u => ({
    action: 'status-update',
    filename: u.filename,
    newStatus: u.status,
    performedBy: req.user.email,
    role: req.user.role,
    timestamp: new Date().toISOString()
  }));

  fs.writeFileSync('ledger.json', JSON.stringify(updatedLogs, null, 2));
  res.json({ message: 'Batch update complete' });
});

router.post('/files/download/batch', verifyToken, (req, res) => {
  const { filenames } = req.body;
  if (!Array.isArray(filenames) || !filenames.length) {
    return res.status(400).json({ message: 'Invalid payload' });
  }

  const archive = archiver('zip');
  res.attachment('bulk_files.zip');
  archive.pipe(res);

  filenames.forEach((filename) => {
    const filePath = path.join(__dirname, '..', 'uploads', filename);
    archive.file(filePath, { name: filename });
  });

  archive.finalize();
});

router.get('/audit/logs', verifyToken, (req, res) => {
  const { email, role, action, filename, startDate, endDate } = req.query;
  let logs = JSON.parse(fs.readFileSync('ledger.json', 'utf8'));

  logs = logs.filter(entry => entry.action); // only audit entries

  if (email) logs = logs.filter(log => log.performedBy === email);
  if (role) logs = logs.filter(log => log.role === role);
  if (action) logs = logs.filter(log => log.action === action);
  if (filename) logs = logs.filter(log => log.filename === filename);
  if (startDate) logs = logs.filter(log => new Date(log.timestamp) >= new Date(startDate));
  if (endDate) logs = logs.filter(log => new Date(log.timestamp) <= new Date(endDate));

  res.json({ logs });
});

router.get('/audit/logs/export', verifyToken, (req, res) => {
  const logs = JSON.parse(fs.readFileSync('ledger.json', 'utf8'))
                .filter(entry => entry.action); // Only audit logs

  const parser = new Parser();
  const csv = parser.parse(logs);

  res.header('Content-Type', 'text/csv');
  res.attachment('audit_logs.csv');
  res.send(csv);
});

router.get('/audit/alerts', verifyToken, (req, res) => {
  const logs = JSON.parse(fs.readFileSync('ledger.json', 'utf8'));

  const alerts = [];

  // Rule 1: 3+ rejections by same email in 1 hour
  const rejections = logs.filter(l => l.action === 'status-update' && l.newStatus === 'rejected');
  const rejectionGroups = {};
  rejections.forEach(r => {
    const hour = new Date(r.timestamp).toISOString().slice(0, 13);
    const key = `${r.performedBy}_${hour}`;
    rejectionGroups[key] = (rejectionGroups[key] || 0) + 1;
    if (rejectionGroups[key] >= 3) {
      alerts.push({
        type: 'Repeated Rejections',
        by: r.performedBy,
        timeBlock: hour,
        count: rejectionGroups[key]
      });
    }
  });

  // Rule 2: Flagged file downloaded 3+ times
  const flagged = logs.filter(l => l.status === 'flagged');
  const downloads = logs.filter(l => l.action === 'bulk-download');
  const flaggedCounts = {};
  downloads.forEach(d => {
    if (flagged.find(f => f.filename === d.filename)) {
      flaggedCounts[d.filename] = (flaggedCounts[d.filename] || 0) + 1;
      if (flaggedCounts[d.filename] >= 3) {
        alerts.push({
          type: 'Sensitive File Reaccessed',
          file: d.filename,
          count: flaggedCounts[d.filename]
        });
      }
    }
  });

  res.json({ alerts });
});

router.post('/audit/alerts/resolve', verifyToken, (req, res) => {
  const { alertId } = req.body;
  const alerts = JSON.parse(fs.readFileSync('alerts.json', 'utf8'));

  const index = alerts.findIndex(a => a.id === alertId);
  if (index === -1) return res.status(404).json({ message: 'Alert not found' });

  alerts[index].resolved = true;
  fs.writeFileSync('alerts.json', JSON.stringify(alerts, null, 2));

  res.json({ message: 'Alert marked resolved' });
});

router.get('/audit/alerts/export', verifyToken, (req, res) => {
  const alerts = JSON.parse(fs.readFileSync('alerts.json', 'utf8'))
    .filter(a => !a.resolved); // Only unresolved

  const parser = new Parser();
  const csv = parser.parse(alerts);

  res.header('Content-Type', 'text/csv');
  res.attachment('unresolved_alerts.csv');
  res.send(csv);
});


module.exports = router;
