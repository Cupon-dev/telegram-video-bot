// Simple Telegram Bot - Zero Visible Links
// Deploy on Railway, Render, or Heroku for 24/7 operation

const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

const app = express();
app.use(express.json());

// Get token from environment variable (more secure)
const BOT_TOKEN = process.env.BOT_TOKEN || ''; // Get token from environment variable
const bot = new TelegramBot(BOT_TOKEN, { polling: false });

// Your video player URL
const PLAYER_URL = process.env.PLAYER_URL || 'https://bplyrrr.netlify.app';

// Webhook URL will be set automatically based on deployment platform
const WEBHOOK_URL = process.env.WEBHOOK_URL;

// Webhook endpoint
app.post('/webhook', (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

// Bot commands and message handlers
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    
    bot.sendMessage(chatId, `🎬 *Video Link Bot*

*How to use:*
1️⃣ Send me an image
2️⃣ Send your video link
3️⃣ I'll create a clean shareable post

*No visible links, just images!* 👌`, {
        parse_mode: 'Markdown'
    });
});

// Store user sessions
const userSessions = new Map();

// Handle image uploads
bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    
    try {
        // Get the highest resolution photo
        const photo = msg.photo[msg.photo.length - 1];
        const fileId = photo.file_id;
        
        // Store in session
        userSessions.set(chatId, {
            imageFileId: fileId,
            step: 'waiting_video',
            timestamp: Date.now()
        });
        
        bot.sendMessage(chatId, `📸 *Image received!*

Now send me your video link:
\`https://iframe.mediadelivery.net/play/...\`

I'll create a post with just your image and a hidden video button! 🎯`, {
            parse_mode: 'Markdown'
        });
        
    } catch (error) {
        console.error('Photo processing error:', error);
        bot.sendMessage(chatId, '❌ Error processing image. Please try again.');
    }
});

// Handle text messages (video links)
bot.on('text', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    // Skip commands
    if (text.startsWith('/')) return;
    
    const session = userSessions.get(chatId);
    
    if (session && session.step === 'waiting_video') {
        // Check if it looks like a video URL
        if (text.includes('mediadelivery.net') || text.includes('iframe')) {
            try {
                const videoInfo = extractVideoInfo(text);
                
                if (!videoInfo) {
                    bot.sendMessage(chatId, '❌ Invalid video URL format. Please send a valid mediadelivery.net link.');
                    return;
                }
                
                // Generate the hidden video link
                const hiddenVideoLink = `${PLAYER_URL}/?lib=${videoInfo.libId}&id=${videoInfo.videoId}`;
                
                // Send PERMANENT message with play button
                await bot.sendPhoto(chatId, session.imageFileId, {
                    caption: " ", // Invisible caption
                    reply_markup: {
                        inline_keyboard: [[
                            { 
                                text: "▶️ Play Now", 
                                web_app: { url: hiddenVideoLink }
                            }
                        ]]
                    }
                });
                
                // Clean up the user's messages for a tidy chat
                try {
                    await bot.deleteMessage(chatId, msg.message_id); // User's link
                    await bot.deleteMessage(chatId, msg.message_id - 1); // Bot's "Image received" message
                } catch (deleteError) {
                    // If deletion fails, it's not critical - main message is already sent
                    console.log("Cleanup not possible. The video post was still created.");
                }
                
                // Clear session
                userSessions.delete(chatId);
                
            } catch (error) {
                console.error('Video processing error:', error);
                bot.sendMessage(chatId, '❌ Error processing video link. Please check the URL and try again.');
            }
        } else {
            bot.sendMessage(chatId, '❌ Please send a valid video URL (should contain "mediadelivery.net")');
        }
    } else {
        // No active session
        bot.sendMessage(chatId, '📷 Please start by sending me an image first, then I\'ll ask for your video link!');
    }
});

// Clean up old sessions (every hour)
setInterval(() => {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    for (const [chatId, session] of userSessions.entries()) {
        if (session.timestamp < oneHourAgo) {
            userSessions.delete(chatId);
        }
    }
}, 60 * 60 * 1000);

function extractVideoInfo(url) {
    try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/').filter(p => p);
        
        if (pathParts.length >= 3 && (pathParts[0] === 'play' || pathParts[0] === 'embed')) {
            const libId = pathParts[1];
            const videoId = pathParts[2];
            return { libId, videoId, fullUrl: url };
        }
        
        return null;
    } catch (e) {
        return null;
    }
}

// Health check
app.get('/', (req, res) => {
    res.json({ 
        status: 'Bot is running!',
        timestamp: new Date().toISOString(),
        activeSessions: userSessions.size
    });
});

// Set webhook on startup
async function setupWebhook() {
    try {
        if (WEBHOOK_URL) {
            await bot.setWebHook(`${WEBHOOK_URL}/webhook`);
            console.log(`✅ Webhook set to: ${WEBHOOK_URL}/webhook`);
        } else {
            console.log('⚠️  WEBHOOK_URL not set, using polling instead');
            bot.startPolling();
        }
    } catch (error) {
        console.error('Webhook setup error:', error);
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🤖 Telegram bot server running on port ${PORT}`);
    setupWebhook();
});

// Export for serverless deployment
module.exports = app;
