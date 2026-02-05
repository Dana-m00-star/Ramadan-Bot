const { Client, GatewayIntentBits } = require("discord.js");
const cron = require("node-cron");
const fs = require("fs");
const questions = require("./questions");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const CHANNEL_ID = "PUT_CHANNEL_ID_HERE";

const startRamadan = new Date("2026-02-18T00:00:00+03:00");
const endRamadan = new Date("2026-03-20T23:59:59+03:00");

function read(file) {
  return JSON.parse(fs.readFileSync(file));
}
function write(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
function shuffle(arr) {
  return arr.sort(() => Math.random() - 0.5);
}

function getDailyQuestions() {
  const used = read("usedQuestions.json");
  let all = [...questions.qna, ...questions.tf, ...questions.words]
    .filter(q => !used.includes(q.id));

  const selected = shuffle(all).slice(0, 20);
  selected.forEach(q => used.push(q.id));
  write("usedQuestions.json", used);
  return selected;
}

async function startEvent(channel) {
  const daily = {};
  const qs = getDailyQuestions();

  for (const q of qs) {
    let msg, filter;

    if (q.word) {
      const scrambled = shuffle(q.word.split("")).join("");
      msg = `✍️ فك الكلمة: **${scrambled}**`;
      filter = m => m.content === q.word;
    } else {
      msg = `🕌 ${q.q}`;
      filter = m => q.a.includes(m.content);
    }

    await channel.send(msg);
    const collected = await channel.awaitMessages({ filter, max: 1, time: 20000 });

    if (collected.size) {
      const user = collected.first().author.id;
      daily[user] = (daily[user] || 0) + 1;
      await channel.send(`⭐ نقطة لـ <@${user}>`);
    }
  }

  const sorted = Object.entries(daily).sort((a,b)=>b[1]-a[1]);
  if (sorted.length) {
    await channel.send(`🏆 فائز اليوم: <@${sorted[0][0]}> بـ ${sorted[0][1]} نقطة`);
  }

  const month = read("points.json");
  for (const [u,p] of Object.entries(daily)) {
    month[u] = (month[u] || 0) + p;
  }
  write("points.json", month);
}

cron.schedule("0 20 * * *", async () => {
  const now = new Date();
  if (now < startRamadan || now > endRamadan) return;

  const channel = client.channels.cache.get(CHANNEL_ID);
  if (!channel) return;

  await channel.send("🌙 تحضير بعد التراويح");
  setTimeout(() => startEvent(channel), 6000);
});

client.once("ready", () => {
  console.log("🌙 Ramadan Bot Ready");
});

client.login(process.env.BOT_TOKEN);
