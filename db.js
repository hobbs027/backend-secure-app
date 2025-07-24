// db.js
const mysql = require('mysql2');

const db = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'micira88',
  database: 'doc_secure',
  port: 3307,
});

module.exports = db.promise();