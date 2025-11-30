import 'dotenv/config';
import { Client, GatewayIntentBits, Partials, EmbedBuilder, SlashCommandBuilder, REST, Routes } from 'discord.js';
import fs from 'fs';
import axios from 'axios';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel]
});

// =========================
// MEMORY AI
// =========================
let memory = {};
const memoryFile = './memory.json';
if (fs.existsSync(memoryFile)) memory = JSON.parse(fs.readFileSync(memoryFile));
function saveMemory(){ fs.writeFileSync(memoryFile, JSON.stringify(memory,null,2)); }

// =========================
// AUTO MOD + KEYWORDS
// =========================
const bannedWords = ["fuck","lồn","dm","chửi","sex"];
const triggers = {
    "hello": "Hello ní 😎",
    "netcard": "NetCard là số 1 🔥",
    "help": "Ní cần gì tôi hỗ trợ?"
};
function autoMod(msg){
    for(const w of bannedWords){
        if(msg.content.toLowerCase().includes(w)){
            msg.delete().catch(()=>{});
            msg.channel.send(`⚠️ <@${msg.author.id}> Vi phạm nội quy!`);
            return true;
        }
    }
    return false;
}

// =========================
// SLASH COMMANDS
// =========================
const commands = [
    new SlashCommandBuilder().setName("ai").setDescription("Chat với AI").addStringOption(opt=>opt.setName("prompt").setDescription("Bạn muốn hỏi gì?").setRequired(true)),
    new SlashCommandBuilder().setName("reset").setDescription("Reset cuộc trò chuyện của bạn")
].map(cmd=>cmd.toJSON());

const rest = new REST({ version:"10" }).setToken(process.env.DISCORD_TOKEN);
(async()=>{
    try{
        const appId = (await rest.get(Routes.currentApplication())).id;
        await rest.put(Routes.applicationCommands(appId), { body: commands });
        console.log("✔ Slash commands đăng ký xong!");
    }catch(err){ console.error(err);}
})();

// =========================
// AI FUNCTIONS
// =========================
async function aiReply(text){
    const res = await axios.post("https://api.openai.com/v1/chat/completions",{
        model:"gpt-4o-mini",
        messages:[{role:"user",content:text}]
    },{
        headers:{Authorization:`Bearer ${process.env.OPENAI_KEY}`}
    });
    return res.data.choices[0].message.content;
}

async function aiSticker(prompt){
    const res = await axios.post("https://api.openai.com/v1/images/generations",{
        model:"gpt-image-1",
        prompt,
        size:"512x512"
    },{
        headers:{Authorization:`Bearer ${process.env.OPENAI_KEY}`}
    });
    return res.data.data[0].url;
}

// =========================
// BOT READY
// =========================
client.on("ready",()=>{
    console.log(`🤖 Bot chạy 24/7: ${client.user.tag}`);
});

// =========================
// INTERACTION SLASH COMMANDS
// =========================
client.on("interactionCreate", async interaction=>{
    if(!interaction.isChatInputCommand()) return;
    const id = interaction.user.id;

    if(interaction.commandName==="ai"){
        const prompt = interaction.options.getString("prompt");

        if(!memory[id]) memory[id]=[{role:"system",content:"Bạn là trợ lý AI toàn năng, trả lời tất cả lĩnh vực."}];
        memory[id].push({role:"user",content:prompt});
        saveMemory();

        await interaction.reply("⏳ Đang trả lời AI...");

        try{
            const answer = await aiReply(prompt);
            memory[id].push({role:"assistant",content:answer});
            saveMemory();

            const embed = new EmbedBuilder().setColor("Blue").setTitle("🤖 AI Trả lời").setDescription(answer).setTimestamp();
            await interaction.editReply({content:"",embeds:[embed]});
        }catch(err){
            await interaction.editReply("❌ Lỗi rồi: "+err.message);
        }
    }

    if(interaction.commandName==="reset"){
        delete memory[id];
        saveMemory();
        await interaction.reply("🔄 Cuộc trò chuyện đã reset!");
    }
});

// =========================
// MESSAGE CREATE (DM + CHANNEL)
// =========================
const MAIN_CHANNEL_ID = "1444632866712457256";

client.on("messageCreate", async msg=>{
    if(msg.author.bot) return;

    // AUTO MOD
    if(autoMod(msg)) return;

    // CHỈ HOẠT ĐỘNG TRONG MAIN CHANNEL HOẶC DM
    if(msg.channel.id !== MAIN_CHANNEL_ID && msg.channel.type !== 1) return;

    // KEYWORD TRIGGERS
    for(const k in triggers){
        if(msg.content.toLowerCase().includes(k)) msg.reply(triggers[k]);
    }

    // DM AI
    if(msg.channel.type === 1){
        const reply = await aiReply(msg.content);
        msg.reply(reply);
        return;
    }

    // Sticker
    if(msg.content.startsWith("!sticker")){
        const prompt = msg.content.replace("!sticker","").trim();
        const url = await aiSticker(prompt);
        msg.reply({content:"Sticker AI của ní đây:",files:[url]});
    }

    // AI text chat
    if(msg.content.startsWith("!ai")){
        const prompt = msg.content.replace("!ai","").trim();
        if(!memory[msg.author.id]) memory[msg.author.id]=[{role:"system",content:"Bạn là trợ lý AI toàn năng, trả lời tất cả lĩnh vực."}];
        memory[msg.author.id].push({role:"user",content:prompt});
        saveMemory();

        const reply = await aiReply(prompt);
        memory[msg.author.id].push({role:"assistant",content:reply});
        saveMemory();

        const embed = new EmbedBuilder().setColor("Blue").setDescription(reply).setTimestamp();
        msg.reply({embeds:[embed]});
    }

    // =========================
    // AUTO CHAT TOÀN NĂNG
    // =========================
    const autoPhrases = [
        /thời tiết/i,
        /tin tức/i,
        /tin thể thao/i,
        /wiki/i,
        /lịch sử/i,
        /game/i,
        /môn học/i,
        /trường học/i,
        /code/i
    ];

    for(const regex of autoPhrases){
        if(regex.test(msg.content)){
            let answer = await aiReply(msg.content);
            const embed = new EmbedBuilder().setColor("Orange").setTitle("🤖 AI Auto Chat").setDescription(answer).setTimestamp();
            msg.reply({embeds:[embed]});
        }
    }
});

// =========================
// ANTI-CRASH
// =========================
process.on("unhandledRejection", err=>console.log("ERR:",err));
process.on("uncaughtException", err=>console.log("ERR:",err));

client.login(process.env.DISCORD_TOKEN);
