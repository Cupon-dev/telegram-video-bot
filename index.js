// Advanced Telegram Bot with Clickable Image Protection & Multi-Channel Posting
// Deploy on Railway for 24/7 operation

const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static('public')); // Serve static files

// Get token from environment variable
const BOT_TOKEN = process.env.BOT_TOKEN || '';
if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN environment variable is required!');
    process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: false });

// Your video player URL - MUST be HTTPS and publicly accessible
const PLAYER_URL = process.env.PLAYER_URL || 'https://bplyrrr.netlify.app';

// Validate PLAYER_URL
if (!PLAYER_URL.startsWith('https://')) {
    console.error('❌ PLAYER_URL must be HTTPS for web_app to work!');
    process.exit(1);
}

// Webhook URL will be set automatically
const WEBHOOK_URL = BASE_URL;

// Your personal Telegram User ID
const YOUR_USER_ID = process.env.ADMIN_USER_ID || '';

// Your channels configuration - format: "channel_id:Channel Name,channel_id2:Channel Name 2"
const CHANNELS_CONFIG = process.env.CHANNELS_CONFIG || '';
const yourChannels = parseChannelsConfig(CHANNELS_CONFIG);

// Store user sessions
const userSessions = new Map();

// Serve protected clickable image pages
app.get('/play/:postId', async (req, res) => {
    const postId = req.params.postId;
    const postData = protectedPosts.get(postId);
    
    if (!postData) {
        return res.status(404).send(`
            <html>
                <body style="background: #000; color: #fff; text-align: center; padding: 50px; font-family: sans-serif;">
                    <h2>❌ Video Not Found</h2>
                    <p>This video link has expired or is invalid.</p>
                </body>
            </html>
        `);
    }
    
    try {
        // Generate and serve the clickable image HTML
        const html = generateClickableImageHTML(postData.imageUrl, postData.videoUrl, postId);
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
        
        console.log(`🎬 Served protected post: ${postId}`);
        
    } catch (error) {
        console.error('Error serving protected post:', error);
        res.status(500).send('Error loading video');
    }
});

// Clean up old protected posts (every hour)
setInterval(() => {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    let cleanedCount = 0;
    
    for (const [postId, postData] of protectedPosts.entries()) {
        if (postData.timestamp < oneHourAgo) {
            protectedPosts.delete(postId);
            cleanedCount++;
        }
    }
    
    if (cleanedCount > 0) {
        console.log(`🧹 Cleaned up ${cleanedCount} old protected posts`);
    }
}, 60 * 60 * 1000);

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

// Validate video URL and extract info
function extractVideoInfo(url) {
    try {
        const urlObj = new URL(url);
        
        // Support different URL formats
        if (url.includes('mediadelivery.net') || url.includes('iframe')) {
            const pathParts = urlObj.pathname.split('/').filter(p => p);
            
            if (pathParts.length >= 3 && (pathParts[0] === 'play' || pathParts[0] === 'embed')) {
                const libId = pathParts[1];
                const videoId = pathParts[2];
                return { libId, videoId, fullUrl: url };
            }
        }
        
        return null;
    } catch (e) {
        console.error('URL parsing error:', e);
        return null;
    }
}

// Webhook endpoint
app.post('/webhook', (req, res) => {
    try {
        bot.processUpdate(req.body);
        res.sendStatus(200);
    } catch (error) {
        console.error('Webhook processing error:', error);
        res.sendStatus(500);
    }
});

// Create button markup with protected image option
function createVideoButtonMarkup(url, useWebApp = true, useProtectedImage = false) {
    const cleanUrl = url.trim();
    
    if (useProtectedImage) {
        // Use regular URL button pointing to our protected HTML page
        return {
            inline_keyboard: [[
                { 
                    text: "🎬 Watch Video", 
                    url: cleanUrl
                }
            ]]
        };
    } else if (useWebApp) {
        // Try web_app
        return {
            inline_keyboard: [[
                { 
                    text: "▶️ Play Video", 
                    web_app: { url: cleanUrl }
                }
            ]]
        };
    } else {
        // Fallback to regular URL button
        return {
            inline_keyboard: [[
                { 
                    text: "▶️ Play Video", 
                    url: cleanUrl
                }
            ]]
        };
    }
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
        message += `\n\n*Admin Commands:*
/post - Post to channels
/mychannels - List your channels
/webtest - Test web app
/clearsessions - Clear old sessions
/status - Bot status`;
    }

    bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown'
    }).catch(err => console.error('Start command error:', err));
});

// Bot status command
bot.onText(/\/status/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    
    if (userId !== YOUR_USER_ID) {
        bot.sendMessage(chatId, '❌ Admin only command.');
        return;
    }
    
    const status = `📊 *Bot Status*

🔗 Player URL: ${PLAYER_URL}
🌐 Bot URL: ${BASE_URL}
📢 Channels: ${Object.keys(yourChannels).length}
💾 Active Sessions: ${userSessions.size}
🛡️ Protected Posts: ${protectedPosts.size}
🕐 Uptime: ${Math.floor(process.uptime())} seconds
🔘 Button Mode: ${USE_PROTECTED_IMAGE ? 'Protected Image' : (WEB_APP_SUPPORTED && !FORCE_URL_BUTTONS ? 'Web App' : 'URL Buttons')}
⚙️ Force URL Buttons: ${FORCE_URL_BUTTONS ? 'ON' : 'OFF'}

*Configured Channels:*
${Object.entries(yourChannels).map(([id, name]) => `• ${name} (\`${id}\`)`).join('\n') || 'None'}`;

    bot.sendMessage(chatId, status, {
        parse_mode: 'Markdown'
    }).catch(err => console.error('Status command error:', err));
});

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
    }).catch(err => console.error('Channels command error:', err));
});

// Clear sessions command
bot.onText(/\/clearsessions/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    
    if (userId !== YOUR_USER_ID) {
        bot.sendMessage(chatId, '❌ Admin only.');
        return;
    }
    
    const sessionCount = userSessions.size;
    userSessions.clear();
    
    bot.sendMessage(chatId, `✅ Cleared ${sessionCount} old sessions!\n\nNow create a NEW post (send image + link) and it will use web_app properly.`);
});

// Test web app command - Enhanced
bot.onText(/\/webtest/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    
    if (userId !== YOUR_USER_ID) {
        bot.sendMessage(chatId, '❌ Admin only.');
        return;
    }
    
    try {
        console.log(`🧪 Testing web_app with URL: ${PLAYER_URL}`);
        
        // Test web_app first
        await bot.sendMessage(chatId, '🧪 *Testing Web App Button*\n\nIf you see the button below and it opens properly, web_app is working!', {
            parse_mode: 'Markdown',
            reply_markup: createVideoButtonMarkup(PLAYER_URL, true)
        });
        
        // Test regular URL button as fallback
        setTimeout(async () => {
            await bot.sendMessage(chatId, '🔗 *Testing Regular URL Button (Fallback)*\n\nThis is how it looks with a regular URL button:', {
                parse_mode: 'Markdown',
                reply_markup: createVideoButtonMarkup(PLAYER_URL, false)
            });
            
            bot.sendMessage(chatId, `✅ Both button types sent!\n\nCurrent Mode: ${WEB_APP_SUPPORTED && !FORCE_URL_BUTTONS ? 'Web App' : 'URL Buttons'}\n\nTo force URL buttons, set: FORCE_URL_BUTTONS=true`);
        }, 1000);
        
    } catch (error) {
        console.error('Web app test error:', error);
        WEB_APP_SUPPORTED = false;
        
        bot.sendMessage(chatId, `❌ Web app test failed: ${error.message}\n\nSwitching to URL buttons as fallback\n\nTo fix web_app:\n• Enable Inline Mode with @BotFather\n• Player URL must be HTTPS\n• Player URL must be publicly accessible`);
    }
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
    }).catch(err => console.error('Post command error:', err));
});

// Handle image uploads
bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const isAdmin = userId === YOUR_USER_ID;
    
    try {
        const photo = msg.photo[msg.photo.length - 1];
        const fileId = photo.file_id;
        
        // Store session data
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

        await bot.sendMessage(chatId, message, {
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
    const text = msg.text.trim();
    const userId = msg.from.id.toString();
    const isAdmin = userId === YOUR_USER_ID;
    
    // Skip commands
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
                
                // Create the hidden video link
                const hiddenVideoLink = `${PLAYER_URL}/?lib=${videoInfo.libId}&id=${videoInfo.videoId}`;
                
                // Update session
                session.hiddenVideoLink = hiddenVideoLink;
                session.originalVideoUrl = text;
                session.step = 'ready';
                
                console.log(`📹 Created video link: ${hiddenVideoLink}`);
                
                // Create protected post with clickable image
                let finalUrl;
                
                if (USE_PROTECTED_IMAGE) {
                    // Create protected HTML page with clickable image
                    finalUrl = await createProtectedPost(session, chatId);
                } else {
                    // Use direct video link
                    finalUrl = hiddenVideoLink;
                }
                
                // Send the post with smart button selection
                const buttonMarkup = createVideoButtonMarkup(finalUrl, WEB_APP_SUPPORTED && !FORCE_URL_BUTTONS, USE_PROTECTED_IMAGE);
                
                await bot.sendPhoto(chatId, session.imageFileId, {
                    caption: `🎬 *Video Ready*\n\nTap the button below to watch! 👇`,
                    parse_mode: 'Markdown',
                    reply_markup: buttonMarkup
                });
                
                if (isAdmin && Object.keys(yourChannels).length > 0) {
                    await bot.sendMessage(chatId, '✅ Personal post created! Use /post to share to your channels.');
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
    
    // Answer the callback query immediately
    await bot.answerCallbackQuery(callbackQuery.id);
    
    if (userId !== YOUR_USER_ID) {
        bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Admin only feature.' });
        return;
    }
    
    const session = userSessions.get(chatId);
    if (!session || !session.hiddenVideoLink) {
        await bot.editMessageText('❌ No post data found. Please create a new post.', {
            chat_id: chatId,
            message_id: message.message_id
        });
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
        await bot.editMessageText(`❌ Failed to post: ${error.message}`, {
            chat_id: chatId,
            message_id: message.message_id
        });
    }
});

// Post to specific channel - Enhanced with protected images
async function postToChannel(channelId, session, originalMessage) {
    const channelName = yourChannels[channelId] || channelId;
    
    try {
        console.log(`📤 Posting to channel ${channelId} (${channelName})`);
        
        // Create protected post URL
        let finalUrl;
        let buttonType;
        
        if (USE_PROTECTED_IMAGE) {
            finalUrl = await createProtectedPost(session, originalMessage.chat.id);
            buttonType = 'protected image';
        } else {
            finalUrl = session.hiddenVideoLink;
            buttonType = WEB_APP_SUPPORTED && !FORCE_URL_BUTTONS ? 'web_app' : 'url';
        }
        
        console.log(`🔗 Final URL: ${finalUrl}`);
        console.log(`🔘 Button type: ${buttonType}`);
        
        // Create appropriate button markup
        let buttonMarkup;
        
        if (USE_PROTECTED_IMAGE || FORCE_URL_BUTTONS || !WEB_APP_SUPPORTED) {
            buttonMarkup = createVideoButtonMarkup(finalUrl, false, USE_PROTECTED_IMAGE);
        } else {
            buttonMarkup = createVideoButtonMarkup(finalUrl, true, false);
        }
        
        try {
            // Post with selected button type
            await bot.sendPhoto(channelId, session.imageFileId, {
                caption: `🎬 *Video Ready*\n\nTap the button below to watch! 👇`,
                parse_mode: 'Markdown',
                reply_markup: buttonMarkup
            });
            
        } catch (buttonError) {
            if (buttonError.message.includes('BUTTON_TYPE_INVALID')) {
                console.log('🔄 web_app failed, falling back to protected image URL...');
                WEB_APP_SUPPORTED = false;
                
                // Create protected post if not already done
                if (!USE_PROTECTED_IMAGE) {
                    finalUrl = await createProtectedPost(session, originalMessage.chat.id);
                }
                
                // Retry with URL button pointing to protected page
                await bot.sendPhoto(channelId, session.imageFileId, {
                    caption: `🎬 *Video Ready*\n\nTap the button below to watch! 👇`,
                    parse_mode: 'Markdown',
                    reply_markup: createVideoButtonMarkup(finalUrl, false, true)
                });
                
                buttonType = 'protected image (fallback)';
            } else {
                throw buttonError;
            }
        }
        
        // Update the original message
        await bot.editMessageText(`✅ Successfully posted to ${channelName}!\n🛡️ Mode: ${buttonType}`, {
            chat_id: originalMessage.chat.id,
            message_id: originalMessage.message_id
        });
        
        console.log(`✅ Posted successfully to ${channelName} (${buttonType})`);
        
    } catch (error) {
        console.error(`❌ Error posting to channel ${channelId} (${channelName}):`, error);
        
        let errorMessage = `❌ Failed to post to ${channelName}\n\n`;
        
        if (error.message.includes('chat not found')) {
            errorMessage += '• Bot not added to channel\n• Check channel ID';
        } else if (error.message.includes('not enough rights')) {
            errorMessage += '• Bot needs admin rights';
        } else {
            errorMessage += `• ${error.message}`;
        }
        
        await bot.editMessageText(errorMessage, {
            chat_id: originalMessage.chat.id,
            message_id: originalMessage.message_id
        });
        
        throw error;
    }
}

// Post to all channels with better progress tracking
async function postToAllChannels(session, originalMessage) {
    const channelIds = Object.keys(yourChannels);
    const totalChannels = channelIds.length;
    let successCount = 0;
    let failedChannels = [];
    
    // Update message to show progress
    await bot.editMessageText(`📤 Posting to ${totalChannels} channels...`, {
        chat_id: originalMessage.chat.id,
        message_id: originalMessage.message_id
    });
    
    for (const channelId of channelIds) {
        try {
            console.log(`📤 Posting to channel ${channelId}...`);
            
            await bot.sendPhoto(channelId, session.imageFileId, {
                caption: `🎬 *Video Ready*\n\nTap the button below to watch! 👇`,
                parse_mode: 'Markdown',
                reply_markup: createVideoButtonMarkup(session.hiddenVideoLink, WEB_APP_SUPPORTED && !FORCE_URL_BUTTONS, USE_PROTECTED_IMAGE)
            });
            
            successCount++;
            console.log(`✅ Posted to ${yourChannels[channelId]}`);
            
            // Small delay to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 100));
            
        } catch (error) {
            console.error(`❌ Failed to post to channel ${channelId}:`, error);
            failedChannels.push(yourChannels[channelId] || channelId);
        }
    }
    
    // Final status message
    let statusMessage = `📊 **Posting Complete!**\n\n✅ Success: ${successCount}/${totalChannels} channels`;
    
    if (failedChannels.length > 0) {
        statusMessage += `\n❌ Failed: ${failedChannels.join(', ')}`;
    }
    
    await bot.editMessageText(statusMessage, {
        chat_id: originalMessage.chat.id,
        message_id: originalMessage.message_id,
        parse_mode: 'Markdown'
    });
}

// Debug channel posting
bot.onText(/\/debugchannel/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    
    if (userId !== YOUR_USER_ID) return;
    
    const session = userSessions.get(chatId);
    if (!session || !session.hiddenVideoLink) {
        bot.sendMessage(chatId, '❌ No active session. Create a post first.');
        return;
    }
    
    const debugInfo = `🔍 **Channel Post Debug**

📹 **Video URL:** 
\`${session.hiddenVideoLink}\`

🔗 **Original URL:** 
\`${session.originalVideoUrl || 'N/A'}\`

🎯 **Button Type:** web_app

📱 **Player URL:** 
\`${PLAYER_URL}\`

✅ **URL Valid:** ${session.hiddenVideoLink.startsWith('https://') ? 'Yes' : 'No'}

📊 **Session Data:**
• Image ID: ${session.imageFileId ? 'Present' : 'Missing'}
• Status: ${session.step}
• Created: ${new Date(session.timestamp).toLocaleString()}`;

    bot.sendMessage(chatId, debugInfo, {
        parse_mode: 'Markdown'
    });
});

// Clean up old sessions (every hour)
setInterval(() => {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    let cleanedCount = 0;
    
    for (const [chatId, session] of userSessions.entries()) {
        if (session.timestamp < oneHourAgo) {
            userSessions.delete(chatId);
            cleanedCount++;
        }
    }
    
    if (cleanedCount > 0) {
        console.log(`🧹 Cleaned up ${cleanedCount} old sessions`);
    }
}, 60 * 60 * 1000);

// Health check endpoint
app.get('/', (req, res) => {
    res.json({ 
        status: '🤖 Bot is running!',
        timestamp: new Date().toISOString(),
        activeSessions: userSessions.size,
        protectedPosts: protectedPosts.size,
        configuredChannels: Object.keys(yourChannels).length,
        playerUrl: PLAYER_URL,
        botUrl: BASE_URL,
        botConfigured: !!BOT_TOKEN,
        webhookConfigured: !!WEBHOOK_URL,
        protectedImageMode: USE_PROTECTED_IMAGE
    });
});

// Error handling for bot
bot.on('error', (error) => {
    console.error('Bot error:', error);
});

bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
});

// Set webhook on startup
async function setupWebhook() {
    try {
        if (WEBHOOK_URL) {
            const webhookUrl = `${WEBHOOK_URL}/webhook`;
            await bot.setWebHook(webhookUrl);
            console.log(`✅ Webhook set to: ${webhookUrl}`);
        } else {
            console.log('⚠️  WEBHOOK_URL not set, using polling instead');
            await bot.deleteWebHook();
            bot.startPolling({ restart: true });
            console.log('🔄 Started polling mode');
        }
    } catch (error) {
        console.error('❌ Webhook setup error:', error);
        console.log('🔄 Falling back to polling...');
        bot.startPolling({ restart: true });
    }
}

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`🚀 Telegram bot server running on port ${PORT}`);
    console.log(`🔗 Player URL: ${PLAYER_URL}`);
    console.log(`📢 Configured channels: ${Object.keys(yourChannels).length}`);
    console.log(`👤 Admin User ID: ${YOUR_USER_ID || 'Not set'}`);
    
    await setupWebhook();
    
    console.log('✅ Bot is ready!');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Received SIGTERM, shutting down gracefully...');
    bot.stopPolling();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 Received SIGINT, shutting down gracefully...');
    bot.stopPolling();
    process.exit(0);
});

module.exports = app;
