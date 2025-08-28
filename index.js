// Advanced Telegram Bot with Web App & Multi-Channel Posting
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

// Your personal Telegram User ID
const YOUR_USER_ID = process.env.ADMIN_USER_ID || '';

// Your channels configuration - format: "channel_id:Channel Name,channel_id2:Channel Name 2"
const CHANNELS_CONFIG = process.env.CHANNELS_CONFIG || '';
const yourChannels = parseChannelsConfig(CHANNELS_CONFIG);

// Webhook endpoint
app.post('/webhook', (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

// Parse channels configuration
function parseChannelsConfig(config) {
    if (!config) return {};
    const channels = {};
    config.split(',').forEach(channel => {
        const [id, name] = channel.split(':');
        if (id && name) {
            channels[id.trim()] = name.trim();
        }
    });
    return channels;
}

// Bot commands and message handlers
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const isAdmin = msg.from.id.toString() === YOUR_USER_ID;
    
    let message = `🎬 *Video Link Bot*

*How to use:*
1️⃣ Send me an image
2️⃣ Send your video link
3️⃣ I'll create a clean shareable post`;

    if (isAdmin && Object.keys(yourChannels).length > 0) {
        message += `\n\n*Admin Commands:*\n/post - Post to channels\n/mychannels - List your channels`;
    }

    bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown'
    });
});

// Store user sessions
const userSessions = new Map();

// List available channels
bot.onText(/\/mychannels/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    
    if (userId !== YOUR_USER_ID) {
        bot.sendMessage(chatId, '❌ This command is for admin only.');
        return;
    }
    
    if (Object.keys(yourChannels).length === 0) {
        bot.sendMessage(chatId, '❌ No channels configured. Set CHANNELS_CONFIG environment variable.');
        return;
    }
    
    let message = `📋 *Your Channels:*\n\n`;
    Object.entries(yourChannels).forEach(([id, name]) => {
        message += `• ${name} (\`${id}\`)\n`;
    });
    
    message += `\nUse /post to share to these channels.`;
    
    bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown'
    });
});

// Admin command to post to channels
bot.onText(/\/post/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    
    if (userId !== YOUR_USER_ID) {
        bot.sendMessage(chatId, '❌ This command is for admin only.');
        return;
    }
    
    const session = userSessions.get(chatId);
    if (!session || !session.hiddenVideoLink) {
        bot.sendMessage(chatId, '❌ Please create a post first (send image + video link).');
        return;
    }
    
    if (Object.keys(yourChannels).length === 0) {
        bot.sendMessage(chatId, '❌ No channels configured. Set CHANNELS_CONFIG environment variable.');
        return;
    }
    
    // Create channel selection keyboard
    const keyboard = {
        inline_keyboard: Object.entries(yourChannels).map(([id, name]) => [
            { 
                text: `📢 ${name}`, 
                callback_data: `post_channel:${id}`
            }
        ])
    };
    
    // Add "Post to All" option if multiple channels
    if (Object.keys(yourChannels).length > 1) {
        keyboard.inline_keyboard.push([
            { 
                text: '🚀 Post to All Channels', 
                callback_data: 'post_all_channels'
            }
        ]);
    }
    
    bot.sendMessage(chatId, '📍 *Select channel to post:*', {
        parse_mode: 'Markdown',
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
        const photo = msg.photo[msg.photo.length - 1];
        const fileId = photo.file_id;
        
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

        if (isAdmin && Object.keys(yourChannels).length > 0) {
            message += `\n\nAfter sending the link, use /post to share to your channels.`;
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
    
    if (text.startsWith('/')) return;
    
    const session = userSessions.get(chatId);
    
    if (session && session.step === 'waiting_video') {
        if (text.includes('mediadelivery.net') || text.includes('iframe')) {
            try {
                const videoInfo = extractVideoInfo(text);
                
                if (!videoInfo) {
                    bot.sendMessage(chatId, '❌ Invalid video URL format. Please send a valid mediadelivery.net link.');
                    return;
                }
                
                const hiddenVideoLink = `${PLAYER_URL}/?lib=${videoInfo.libId}&id=${videoInfo.videoId}`;
                
                session.hiddenVideoLink = hiddenVideoLink;
                session.step = 'ready';
                
                // Use WEB_APP for better user experience
                await bot.sendPhoto(chatId, session.imageFileId, {
                    caption: `🎬 *Video Ready*\n\nTap the button below to watch! 👇`,
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
                
                if (isAdmin && Object.keys(yourChannels).length > 0) {
                    bot.sendMessage(chatId, '✅ Personal post created! Use /post to share to your channels.');
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

// Handle callback queries (channel selection)
bot.on('callback_query', async (callbackQuery) => {
    const message = callbackQuery.message;
    const chatId = message.chat.id;
    const data = callbackQuery.data;
    const userId = callbackQuery.from.id.toString();
    
    if (userId !== YOUR_USER_ID) {
        bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Admin only feature.' });
        return;
    }
    
    const session = userSessions.get(chatId);
    if (!session || !session.hiddenVideoLink) {
        bot.answerCallbackQuery(callbackQuery.id, { text: '❌ No post data found.' });
        return;
    }
    
    try {
        if (data.startsWith('post_channel:')) {
            const channelId = data.split(':')[1];
            await postToChannel(channelId, session, message);
            
        } else if (data === 'post_all_channels') {
            await postToAllChannels(session, message);
        }
        
    } catch (error) {
        console.error('Channel posting error:', error);
        bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Failed to post to channel.' });
    }
});

// Post to specific channel
async function postToChannel(channelId, session, originalMessage) {
    try {
        await bot.sendPhoto(channelId, session.imageFileId, {
            caption: `🎬 *Video Ready*\n\nTap the button below to watch! 👇`,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { 
                        text: "▶️ Play Video", 
                        web_app: { url: session.hiddenVideoLink }
                    }
                ]]
            }
        });
        
        const channelName = yourChannels[channelId] || channelId;
        bot.editMessageText(`✅ Posted to ${channelName}!`, {
            chat_id: originalMessage.chat.id,
            message_id: originalMessage.message_id
        });
        
    } catch (error) {
        console.error(`Error posting to channel ${channelId}:`, error);
        throw error;
    }
}

// Post to all channels
async function postToAllChannels(session, originalMessage) {
    let successCount = 0;
    const totalChannels = Object.keys(yourChannels).length;
    
    for (const channelId of Object.keys(yourChannels)) {
        try {
            await postToChannel(channelId, session, originalMessage);
            successCount++;
        } catch (error) {
            console.error(`Failed to post to channel ${channelId}:`, error);
        }
    }
    
    bot.editMessageText(`✅ Posted to ${successCount}/${totalChannels} channels!`, {
        chat_id: originalMessage.chat.id,
        message_id: originalMessage.message_id
    });
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
        activeSessions: userSessions.size,
        configuredChannels: Object.keys(yourChannels).length
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
    console.log(`📢 Configured channels: ${Object.keys(yourChannels).length}`);
    setupWebhook();
});

module.exports = app;
