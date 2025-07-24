const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const ledgerPath = path.join(__dirname, 'ledger.json');

// Load existing chain
const loadLedger = () => {
  if (!fs.existsSync(ledgerPath)) return [];
  return JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
};

// Hash a block
const hashBlock = block => {
  const blockData = `${block.index}|${block.timestamp}|${block.userId}|${block.filename}|${block.action}|${block.previousHash}`;
  return crypto.createHash('sha256').update(blockData).digest('hex');
};

// Add new block
const addToLedger = ({ userId, filename, action }) => {
  const chain = loadLedger();
  const previousHash = chain.length > 0 ? chain[chain.length - 1].hash : 'GENESIS';

  const block = {
    index: chain.length + 1,
    timestamp: new Date().toISOString(),
    userId,
    filename,
    action,
    previousHash
  };

  block.hash = hashBlock(block);
  chain.push(block);

  fs.writeFileSync(ledgerPath, JSON.stringify(chain, null, 2));
  console.log(`Block added to ledger: ${block.hash}`);
};

module.exports = { addToLedger, loadLedger };