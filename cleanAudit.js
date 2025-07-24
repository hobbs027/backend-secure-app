const fs = require('fs');
const path = require('path');

const auditPath = path.join(__dirname, 'audit.log');
const cleanedPath = path.join(__dirname, 'audit_cleaned.log');

try {
  const lines = fs.readFileSync(auditPath, 'utf8')
    .split('\n')
    .filter(line => line.trim());

  const validEntries = lines.map(line => {
    try {
      const entry = JSON.parse(line);
      return entry.action ? entry : null;
    } catch {
      return null;
    }
  }).filter(entry => entry !== null);

  fs.writeFileSync(cleanedPath, validEntries.map(e => JSON.stringify(e)).join('\n'));
  console.log(`Cleaned ${validEntries.length} entries. Saved to audit_cleaned.log`);
} catch (err) {
  console.error("Error cleaning audit log:", err.message);
}
