// Advanced Telegram Bot with Channel Posting
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

// Store your channel IDs (you can add multiple)
const YOUR_CHANNEL_IDS = process.env.CHANNEL_IDS ? process.env.CHANNEL_IDS.split(',') : [];
// Your personal Telegram User ID (get it from @userinfobot)
const YOUR_USER_ID = process.env.ADMIN_USER_ID || '';

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
        message += `\n\n*Admin Features:*\nUse /post to share to your channels`;
    }

    message += `\n\n*No visible links, just images!* 👌`;

    bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown'
    });
});

// Admin command to post to channels
bot.onText(/\/post/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    
    // Check if user is admin
    if (userId !== YOUR_USER_ID) {
        bot.sendMessage(chatId, '❌ This command is for admin only.');
        return;
    }
    
    const session = userSessions.get(chatId);
    if (session && session.step === 'waiting_channel_selection') {
        bot.sendMessage(chatId, 'Please complete your current post first.');
        return;
    }
    
    if (!session || !session.imageFileId || !session.hiddenVideoLink) {
        bot.sendMessage(chatId, 'Please create a post first by sending an image and video link.');
        return;
    }
    
    // Show channel selection keyboard
    const keyboard = {
        inline_keyboard: YOUR_CHANNEL_IDS.map(channelId => [
            { text: `Post to ${channelId}`, callback_data: `post_to:${channelId}` }
        ])
    };
    
    bot.sendMessage(chatId, 'Select channel to post:', {
        reply_markup: keyboard
    });
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
            isAdmin: isAdmin
        });
        
        let message = `📸 *Image received!*

Now send me your video link:
\`https://iframe.mediadelivery.net/play/...\``;

        if (isAdmin) {
            message += `\n\nAfter sending the link, use /post to share to your channels.`;
        } else {
            message += `\n\nI'll create a clean post with your image! 🎯`;
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
                
                // Update session with video link
                session.hiddenVideoLink = hiddenVideoLink;
                session.step = 'ready';
                
                // Send forwardable message with play button
                await bot.sendMessage(chatId, "🎬 **Video Available**", {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[
                            { 
                                text: "▶️ Play Video", 
                                web_app: { url: hiddenVideoLink }
                            }
                        ]]
                    }
                });
                
                // Send image separately (fully forwardable)
                await bot.sendPhoto(chatId, session.imageFileId, {
                    caption: " " // Empty caption
                });
                
                // Clean up previous messages
                try {
                    await bot.deleteMessage(chatId, msg.message_id); // User's link
                    await bot.deleteMessage(chatId, msg.message_id - 1); // Bot's "Image received"
                } catch (deleteError) {
                    console.log("Cleanup not possible. Main post was created.");
                }
                
                if (isAdmin) {
                    bot.sendMessage(chatId, '✅ Post created! Use /post to share to your channels.');
                }
                
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

// Handle callback queries (channel selection)
bot.on('callback_query', async (callbackQuery) => {
    const message = callbackQuery.message;
    const chatId = message.chat.id;
    const data = callbackQuery.data;
    
    if (data.startsWith('post_to:')) {
        const channelId = data.split(':')[1];
        const session = userSessions.get(chatId);
        
        if (!session || !session.hiddenVideoLink) {
            bot.answerCallbackQuery(callbackQuery.id, { text: 'No post data found. Please create a post first.' });
            return;
        }
        
        try {
            // Post to channel
            await bot.sendPhoto(channelId, session.imageFileId, {
                caption: " ", // Invisible caption
                reply_markup: {
                    inline_keyboard: [[
                        { 
                            text: "▶️ Play Video", 
                            web_app: { url: session.hiddenVideoLink }
                        }
                    ]]
                }
            });
            
            bot.answerCallbackQuery(callbackQuery.id, { text: '✅ Posted to channel successfully!' });
            bot.editMessageText('✅ Posted to channel successfully!', {
                chat_id: chatId,
                message_id: message.message_id
            });
            
        } catch (error) {
            console.error('Channel posting error:', error);
            bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Failed to post to channel. Make sure bot is admin in channel.' });
        }
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

module.exports = app;
