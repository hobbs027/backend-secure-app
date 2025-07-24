const mysql = require('mysql2/promise');

(async () => {
  try {
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: 'micira88',
      database: 'doc_secure',
      port: 3307,          
    });

    console.log("Connected to MySQL!");
    await connection.end();
  } catch (err) {
    console.error("Connection failed:", err.message);
  }
})();
