/**
 * Ensure Admin Setup Script
 * Creates admin_users table and default admin user if they don't exist
 * Works with both SQLite and PostgreSQL
 */

const { db } = require('../src/database/DatabaseManager');

async function ensureAdminSetup() {
  try {
    console.log('🔧 Initializing database and ensuring admin setup...');
    
    // Initialize database connection
    await db.initialize();
    console.log('✅ Database initialized successfully');

    // Check if admin_users table exists
    const dbType = process.env.DB_TYPE || (process.env.DATABASE_URL?.includes('sqlite') ? 'sqlite3' : 'pg');
    console.log(`📊 Database type: ${dbType}`);

    let tableExists = false;
    try {
      if (dbType === 'sqlite3') {
        // SQLite: Check sqlite_master table
        const result = await db.queryOne(`
          SELECT name FROM sqlite_master 
          WHERE type='table' AND name='admin_users'
        `);
        tableExists = !!result;
      } else {
        // PostgreSQL: Check information_schema
        const result = await db.queryOne(`
          SELECT table_name FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = 'admin_users'
        `);
        tableExists = !!result;
      }
    } catch (error) {
      console.error('Error checking admin_users table:', error);
    }

    if (!tableExists) {
      console.log('📝 Creating admin_users table...');
      
      try {
        if (dbType === 'sqlite3') {
          await db.query(`
            CREATE TABLE admin_users (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              username TEXT UNIQUE NOT NULL,
              password_hash TEXT NOT NULL,
              email TEXT,
              role TEXT DEFAULT 'admin',
              is_active BOOLEAN DEFAULT 1,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              last_login DATETIME
            )
          `);
        } else {
          await db.query(`
            CREATE TABLE admin_users (
              id SERIAL PRIMARY KEY,
              username VARCHAR(255) UNIQUE NOT NULL,
              password_hash VARCHAR(255) NOT NULL,
              email VARCHAR(255),
              role VARCHAR(50) DEFAULT 'admin',
              is_active BOOLEAN DEFAULT true,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              last_login TIMESTAMP
            )
          `);
        }
        console.log('✅ admin_users table created successfully');
      } catch (error) {
        console.error('Error creating admin_users table:', error);
        throw error;
      }
    } else {
      console.log('✅ admin_users table already exists');
    }

    // Check if admin user exists
    let adminUser = null;
    try {
      adminUser = await db.queryOne('SELECT * FROM admin_users WHERE username = $1', ['admin']);
    } catch (error) {
      console.error('Error checking admin user:', error);
    }

    if (!adminUser) {
      console.log('👤 Creating default admin user...');
      
      const bcrypt = require('bcrypt');
      const passwordHash = await bcrypt.hash('admin123', 10);
      
      try {
        if (dbType === 'sqlite3') {
          await db.query(`
            INSERT INTO admin_users (username, password_hash, email, role, is_active)
            VALUES (?, ?, ?, ?, ?)
          `, ['admin', passwordHash, 'admin@example.com', 'super_admin', 1]);
        } else {
          await db.query(`
            INSERT INTO admin_users (username, password_hash, email, role, is_active)
            VALUES ($1, $2, $3, $4, $5)
          `, ['admin', passwordHash, 'admin@example.com', 'super_admin', true]);
        }
        console.log('✅ Default admin user created successfully');
        console.log('   Username: admin');
        console.log('   Password: admin123');
        console.log('   ⚠️  Please change this password after first login!');
      } catch (error) {
        console.error('Error creating admin user:', error);
        throw error;
      }
    } else {
      console.log('✅ Admin user already exists');
    }

    // Also check and create user_sessions table
    try {
      let sessionTableExists = false;
      
      if (dbType === 'sqlite3') {
        const result = await db.queryOne(`
          SELECT name FROM sqlite_master 
          WHERE type='table' AND name='user_sessions'
        `);
        sessionTableExists = !!result;
      } else {
        const result = await db.queryOne(`
          SELECT table_name FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = 'user_sessions'
        `);
        sessionTableExists = !!result;
      }

      if (!sessionTableExists) {
        console.log('📝 Creating user_sessions table...');
        
        if (dbType === 'sqlite3') {
          await db.query(`
            CREATE TABLE user_sessions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER NOT NULL,
              session_token TEXT UNIQUE NOT NULL,
              ip_address TEXT,
              user_agent TEXT,
              expires_at DATETIME NOT NULL,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
          `);
        } else {
          await db.query(`
            CREATE TABLE user_sessions (
              id SERIAL PRIMARY KEY,
              user_id INTEGER NOT NULL,
              session_token VARCHAR(255) UNIQUE NOT NULL,
              ip_address INET,
              user_agent TEXT,
              expires_at TIMESTAMP NOT NULL,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
          `);
        }
        console.log('✅ user_sessions table created successfully');
      } else {
        console.log('✅ user_sessions table already exists');
      }
    } catch (error) {
      console.error('Error checking/creating user_sessions table:', error);
    }

    console.log('🎉 Admin setup completed successfully!');
    
    // Test admin user lookup
    try {
      const testAdmin = await db.queryOne('SELECT id, username, role, is_active FROM admin_users WHERE username = $1', ['admin']);
      if (testAdmin) {
        console.log('✅ Admin user verification successful:', {
          id: testAdmin.id,
          username: testAdmin.username,
          role: testAdmin.role,
          is_active: testAdmin.is_active
        });
      }
    } catch (error) {
      console.error('Error verifying admin user:', error);
    }

  } catch (error) {
    console.error('❌ Admin setup failed:', error.message);
    process.exit(1);
  } finally {
    // Close database connection
    try {
      await db.close();
    } catch (error) {
      console.error('Error closing database:', error);
    }
  }
}

// Run the setup
if (require.main === module) {
  ensureAdminSetup()
    .then(() => {
      console.log('✅ Admin setup completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Admin setup failed:', error);
      process.exit(1);
    });
}

module.exports = { ensureAdminSetup };
