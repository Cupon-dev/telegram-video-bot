// Automated Telegram Posting System
// Deploy on Railway for 24/7 operation

const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

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

// Channels configuration
const CHANNELS_CONFIG = process.env.CHANNELS_CONFIG || '';
const yourChannels = parseChannelsConfig(CHANNELS_CONFIG);

// Posting schedules for each channel
const CHANNEL_SCHEDULES = process.env.CHANNEL_SCHEDULES || '';
const channelSchedules = parseSchedulesConfig(CHANNEL_SCHEDULES);

// Content folder path
const CONTENT_FOLDER = process.env.CONTENT_FOLDER || './content';

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

// Parse schedules configuration
function parseSchedulesConfig(config) {
    if (!config) return {};
    const schedules = {};
    config.split(';').forEach(schedule => {
        const [channelId, cronPattern] = schedule.split(':');
        if (channelId && cronPattern) {
            schedules[channelId.trim()] = cronPattern.trim();
        }
    });
    return schedules;
}

// Initialize content folder
function initContentFolder() {
    if (!fs.existsSync(CONTENT_FOLDER)) {
        fs.mkdirSync(CONTENT_FOLDER, { recursive: true });
        console.log(`📁 Created content folder: ${CONTENT_FOLDER}`);
    }
    
    // Create subfolders for each channel
    Object.keys(yourChannels).forEach(channelId => {
        const channelFolder = path.join(CONTENT_FOLDER, channelId);
        if (!fs.existsSync(channelFolder)) {
            fs.mkdirSync(channelFolder, { recursive: true });
        }
    });
}

// Scan content folder for new files
function scanContentFolder() {
    const content = {};
    
    Object.keys(yourChannels).forEach(channelId => {
        const channelFolder = path.join(CONTENT_FOLDER, channelId);
        if (fs.existsSync(channelFolder)) {
            const files = fs.readdirSync(channelFolder);
            content[channelId] = files.filter(file => 
                file.endsWith('.txt') || 
                ['.jpg', '.jpeg', '.png', '.webp'].includes(path.extname(file).toLowerCase())
            );
        }
    });
    
    return content;
}

// Get random content for channel
function getRandomContent(channelId) {
    const channelFolder = path.join(CONTENT_FOLDER, channelId);
    if (!fs.existsSync(channelFolder)) return null;
    
    const files = fs.readdirSync(channelFolder);
    const textFiles = files.filter(file => file.endsWith('.txt'));
    const imageFiles = files.filter(file => 
        ['.jpg', '.jpeg', '.png', '.webp'].includes(path.extname(file).toLowerCase())
    );
    
    if (textFiles.length === 0 || imageFiles.length === 0) return null;
    
    // Get random text file and matching image
    const randomTextFile = textFiles[Math.floor(Math.random() * textFiles.length)];
    const baseName = path.parse(randomTextFile).name;
    
    // Try to find matching image
    let matchingImage = imageFiles.find(img => 
        path.parse(img).name === baseName
    );
    
    // If no matching image, get random image
    if (!matchingImage && imageFiles.length > 0) {
        matchingImage = imageFiles[Math.floor(Math.random() * imageFiles.length)];
    }
    
    if (!matchingImage) return null;
    
    // Read video URL from text file
    const textFilePath = path.join(channelFolder, randomTextFile);
    const videoUrl = fs.readFileSync(textFilePath, 'utf8').trim();
    
    const imagePath = path.join(channelFolder, matchingImage);
    
    return {
        videoUrl,
        imagePath,
        textFile: randomTextFile,
        imageFile: matchingImage
    };
}

// Process video URL
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

// Post to channel
async function postToChannel(channelId, content) {
    try {
        console.log(`📤 Attempting to post to channel: ${channelId}`);
        
        // Verify channel exists
        if (!yourChannels[channelId]) {
            throw new Error(`Channel ${channelId} not configured`);
        }
        
        // Verify content exists
        if (!content || !content.videoUrl || !content.imagePath) {
            throw new Error('Missing content data');
        }
        
        // Verify image file exists
        if (!fs.existsSync(content.imagePath)) {
            throw new Error(`Image file not found: ${content.imagePath}`);
        }
        
        const videoInfo = extractVideoInfo(content.videoUrl);
        if (!videoInfo) {
            throw new Error('Invalid video URL format');
        }
        
        const hiddenVideoLink = `${PLAYER_URL}/?lib=${videoInfo.libId}&id=${videoInfo.videoId}`;
        const imageBuffer = fs.readFileSync(content.imagePath);
        
        console.log(`🖼️ Sending photo to channel ${channelId}`);
        
        // Post to channel
        await bot.sendPhoto(channelId, imageBuffer, {
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
        
        console.log(`✅ Successfully posted to ${channelId}`);
        return true;
        
    } catch (error) {
        console.error(`❌ Failed to post to channel ${channelId}:`, error.message);
        return false;
    }
}
        
        // Move used files to archive folder
        archiveContent(channelId, content.textFile, content.imageFile);
        
        return true;
    } catch (error) {
        console.error('Error posting to channel:', error);
        return false;
    }
}

// Archive used content
function archiveContent(channelId, textFile, imageFile) {
    const archiveFolder = path.join(CONTENT_FOLDER, channelId, 'archive');
    if (!fs.existsSync(archiveFolder)) {
        fs.mkdirSync(archiveFolder, { recursive: true });
    }
    
    const channelFolder = path.join(CONTENT_FOLDER, channelId);
    
    // Add timestamp to avoid overwriting
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    if (textFile) {
        const oldPath = path.join(channelFolder, textFile);
        const newPath = path.join(archiveFolder, `${timestamp}_${textFile}`);
        if (fs.existsSync(oldPath)) {
            fs.renameSync(oldPath, newPath);
        }
    }
    
    if (imageFile) {
        const oldPath = path.join(channelFolder, imageFile);
        const newPath = path.join(archiveFolder, `${timestamp}_${imageFile}`);
        if (fs.existsSync(oldPath)) {
            fs.renameSync(oldPath, newPath);
        }
    }
}

// Setup scheduled posting
function setupScheduledPosting() {
    Object.entries(channelSchedules).forEach(([channelId, cronPattern]) => {
        if (cron.validate(cronPattern)) {
            cron.schedule(cronPattern, async () => {
                console.log(`⏰ Running scheduled post for channel ${channelId}`);
                
                const content = getRandomContent(channelId);
                if (content) {
                    await postToChannel(channelId, content);
                } else {
                    console.log(`❌ No content available for channel ${channelId}`);
                }
            });
            
            console.log(`✅ Scheduled posting for channel ${channelId}: ${cronPattern}`);
        } else {
            console.error(`❌ Invalid cron pattern for channel ${channelId}: ${cronPattern}`);
        }
    });
}

// Manual post command
bot.onText(/\/postnow(?:\s+(\S+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    
    if (userId !== YOUR_USER_ID) {
        bot.sendMessage(chatId, '❌ This command is for admin only.');
        return;
    }
    
    let targetChannelId = match[1];
    
    // If no channel specified, show selection
    if (!targetChannelId) {
        const keyboard = {
            inline_keyboard: Object.entries(yourChannels).map(([id, name]) => [
                { 
                    text: `📢 ${name}`, 
                    callback_data: `post_now:${id}`
                }
            ])
        };
        
        bot.sendMessage(chatId, '📍 *Select channel to post now:*', {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
        return;
    }
    
    // Post to specified channel
    try {
        const content = getRandomContent(targetChannelId);
        if (content) {
            await postToChannel(targetChannelId, content);
            bot.sendMessage(chatId, `✅ Posted to ${yourChannels[targetChannelId] || targetChannelId}`);
        } else {
            bot.sendMessage(chatId, `❌ No content available for channel ${targetChannelId}`);
        }
    } catch (error) {
        bot.sendMessage(chatId, `❌ Error posting to channel: ${error.message}`);
    }
});

// Handle callback queries
bot.on('callback_query', async (callbackQuery) => {
    const message = callbackQuery.message;
    const chatId = message.chat.id;
    const data = callbackQuery.data;
    const userId = callbackQuery.from.id.toString();
    
    if (userId !== YOUR_USER_ID) {
        bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Admin only feature.' });
        return;
    }
    
    if (data.startsWith('post_now:')) {
        const channelId = data.split(':')[1];
        const content = getRandomContent(channelId);
        
        if (content) {
            await postToChannel(channelId, content);
            bot.editMessageText(`✅ Posted to ${yourChannels[channelId] || channelId}`, {
                chat_id: chatId,
                message_id: message.message_id
            });
        } else {
            bot.editMessageText(`❌ No content available for channel ${channelId}`, {
                chat_id: chatId,
                message_id: message.message_id
            });
        }
    }
});

// Content status command
bot.onText(/\/contentstatus/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    
    if (userId !== YOUR_USER_ID) {
        bot.sendMessage(chatId, '❌ This command is for admin only.');
        return;
    }
    
    const content = scanContentFolder();
    let message = '📊 *Content Status:*\n\n';
    
    Object.entries(content).forEach(([channelId, files]) => {
        const textFiles = files.filter(f => f.endsWith('.txt')).length;
        const imageFiles = files.filter(f => 
            ['.jpg', '.jpeg', '.png', '.webp'].includes(path.extname(f).toLowerCase())
        ).length;
        
        message += `• ${yourChannels[channelId] || channelId}: ${textFiles} texts, ${imageFiles} images\n`;
    });
    
    bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown'
    });
});

// Initialize the system
function initialize() {
    initContentFolder();
    setupScheduledPosting();
    
    console.log('🤖 Automated posting system initialized');
    console.log('📁 Content folder:', CONTENT_FOLDER);
    console.log('📺 Channels:', Object.keys(yourChannels).length);
    console.log('⏰ Schedules:', Object.keys(channelSchedules).length);
}

// Health check
app.get('/', (req, res) => {
    const content = scanContentFolder();
    res.json({ 
        status: 'Bot is running!',
        timestamp: new Date().toISOString(),
        channels: Object.keys(yourChannels),
        schedules: channelSchedules,
        content: content
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
    initialize();
});

module.exports = app;
