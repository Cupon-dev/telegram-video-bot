// Secure Telegram Bot with Admin-Only Channel Posting
// Deploy on Railway for 24/7 operation

const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

const app = express();
app.use(express.json());

// Get token from environment variable
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const bot = new TelegramBot(BOT_TOKEN, { polling: false });

// Your video player URL
const PLAYER_URL = process.env.PLAYER_URL || 'https://bplyrrr.netlify.app';

// Webhook URL will be set automatically
const WEBHOOK_URL = process.env.WEBHOOK_URL;

// Your personal Telegram User ID (get it from @userinfobot)
const YOUR_USER_ID = process.env.ADMIN_USER_ID || '';

// Your channel ID where the bot should post (get it from @username_to_id_bot)
const YOUR_CHANNEL_ID = process.env.CHANNEL_ID || '';

// Webhook endpoint
app.post('/webhook', (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

// Bot commands and message handlers
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const isAdmin = msg.from.id.toString() === YOUR_USER_ID;
    
    let message = `🎬 *Video Link Bot*

*How to use:*
1️⃣ Send me an image
2️⃣ Send your video link
3️⃣ I'll create a clean shareable post`;

    if (isAdmin) {
        message += `\n\n*Admin Command:*\nUse /postchannel to share directly to your channel`;
    }

    bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown'
    });
});

/// Admin-only command to post directly to channel
bot.onText(/\/postchannel/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    
    // DEBUG: Check what values we're getting
    console.log(`DEBUG: User ID: ${userId}, Admin ID: '${YOUR_USER_ID}', Match: ${userId === YOUR_USER_ID}`);
    
    // SECURITY CHECK: Only you can use this command
    if (userId !== YOUR_USER_ID) {
        bot.sendMessage(chatId, `❌ Admin only. Your ID: ${userId}, Expected: ${YOUR_USER_ID || 'NOT_SET'}`);
        return;
    }
    
    const session = userSessions.get(chatId);
    if (!session || session.step !== 'ready') {
        bot.sendMessage(chatId, '❌ Please create a post first (send image + video link).');
        return;
    }
    
    // Post directly to your channel
    postToChannel(session, chatId);
});

// Store user sessions
const userSessions = new Map();

// Handle image uploads
bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const isAdmin = userId === YOUR_USER_ID;
    
    try {
        // Get the highest resolution photo
        const photo = msg.photo[msg.photo.length - 1];
        const fileId = photo.file_id;
        
        // Store in session
        userSessions.set(chatId, {
            imageFileId: fileId,
            step: 'waiting_video',
            timestamp: Date.now(),
            isAdmin: isAdmin,
            userId: userId
        });
        
        let message = `📸 *Image received!*

Now send me your video link:
\`https://iframe.mediadelivery.net/play/...\``;

        if (isAdmin) {
            message += `\n\nAfter sending the link, use /postchannel to share directly to your channel.`;
        }

        bot.sendMessage(chatId, message, {
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
    const userId = msg.from.id.toString();
    const isAdmin = userId === YOUR_USER_ID;
    
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
                
                // Update session
                session.hiddenVideoLink = hiddenVideoLink;
                session.step = 'ready';
                
                // Create forwardable post for everyone
                await bot.sendPhoto(chatId, session.imageFileId, {
                    caption: `🎬 *Video Ready*\n\nTap the button below to watch! 👇`,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: "▶️ Watch Now", url: hiddenVideoLink }
                        ]]
                    }
                });
                
                // Additional option for admin
                if (isAdmin) {
                    bot.sendMessage(chatId, '✅ Personal post created! Use /postchannel to share to your channel.');
                }
                
            } catch (error) {
                console.error('Video processing error:', error);
                bot.sendMessage(chatId, '❌ Error processing video link. Please check the URL and try again.');
            }
        } else {
            bot.sendMessage(chatId, '❌ Please send a valid video URL (should contain "mediadelivery.net")');
        }
    } else {
        bot.sendMessage(chatId, '📷 Please start by sending me an image first!');
    }
});

// Function to post to channel (admin only)
async function postToChannel(session, userChatId) {
    try {
        // Post to your channel
        await bot.sendPhoto(YOUR_CHANNEL_ID, session.imageFileId, {
            caption: `🎬 *Video Ready*\n\nTap the button below to watch! 👇`,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: "▶️ Watch Now", url: session.hiddenVideoLink }
                ]]
            }
        });
        
        bot.sendMessage(userChatId, '✅ Successfully posted to your channel!');
        
    } catch (error) {
        console.error('Channel posting error:', error);
        bot.sendMessage(userChatId, '❌ Failed to post to channel. Make sure:\n1. Bot is admin in your channel\n2. Channel ID is correct in environment variables');
    }
}

// Clean up old sessions
setInterval(cleanupSessions, 60 * 60 * 1000);

function cleanupSessions() {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    for (const [chatId, session] of userSessions.entries()) {
        if (session.timestamp < oneHourAgo) {
            userSessions.delete(chatId);
        }
    }
}

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

module.exports = app;
