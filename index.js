const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
const cron = require("node-cron");

// ====== إعداد البوت ======
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ====== متغيرات البيئة ======
const CHANNEL_ID = process.env.CHANNEL_ID;
const ADMIN_ID = "1406429112502976556"; // ايدي الأدمن

// ====== تجربة التحضير ======
let attendanceToday = new Set();
let attendanceOpen = false;
let quizRunning = false;

// ====== أسئلة تجربة ======
const QUESTIONS = [
  { q: "كم عدد أيام شهر رمضان؟" },
  { q: "ما اسم صلاة الليل في رمضان؟" },
  { q: "ما الوجبة قبل الفجر؟" },
  { q: "في أي شهر نزل القرآن؟" },
  { q: "صلاة التراويح سنة مؤكدة؟" },
  { q: "السحور يكون بعد الفجر؟" }
];

// ====== ضبط التحضير بعد 5 دقائق ======
const now = new Date();
let startMinute = now.getMinutes() + 5;
let startHour = now.getHours();

if (startMinute >= 60) {
  startMinute -= 60;
  startHour += 1;
}

cron.schedule(`${startMinute} ${startHour} * * *`, async () => {
  const ch = await client.channels.fetch(CHANNEL_ID);
  attendanceToday.clear();
  attendanceOpen = true;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("attend")
      .setLabel(" حاضر")
      .setStyle(ButtonStyle.Success)
  );

  const msg = await ch.send({
    content: "@everyone  **تحضير فعاليات رمضان (تجربة)**\nاضغط **حاضر** خلال دقيقة",
    components: [row]
  });

  setTimeout(async () => {
    attendanceOpen = false;

    let mentions = [];
    attendanceToday.forEach(id => mentions.push(`• <@${id}>`));

    await msg.edit({ components: [] });

    ch.send(` **نتائج التحضير (تجربة)**

عدد الحاضرين: ${attendanceToday.size}

👥 **الحاضرين:**
${mentions.join("\n") || "—"}

+1 نقطة لكل حاضر `);
  }, 60 * 1000); // دقيقة واحدة
});

// ====== زر الحضور ======
client.on("interactionCreate", async i => {
  if (!i.isButton()) return;
  if (i.customId !== "attend") return;

  if (!attendanceOpen)
    return i.reply({ content: " انتهى التحضير", ephemeral: true });

  if (attendanceToday.has(i.user.id))
    return i.reply({ content: "مسجل مسبقًا ", ephemeral: true });

  attendanceToday.add(i.user.id);
  i.reply({ content: "تم تسجيل حضورك ", ephemeral: true });
});

// ====== أوامر تجربة ======
client.on("messageCreate", async msg => {
  if (msg.author.bot) return;

  // ----- نقاطي (مؤقتة) -----
  if (msg.content === "/نقاطي") {
    msg.reply(` نقاطك الحالية: **${attendanceToday.has(msg.author.id) ? 1 : 0}**`);
  }

  // ----- توب حضور (مؤقت) -----
  if (msg.content === "توب حضور") {
    msg.reply(" توب حضور (تجربة): كل الحاضرين مؤقتًا");
  }

  // ----- فعالية الأسئلة (تجربة) -----
  if (msg.content === "فعاليه") {
    if (msg.author.id !== ADMIN_ID) {
      return msg.reply(" هذا الأمر للأدمن فقط");
    }
    if (quizRunning) return msg.reply(" الفعالية شغالة حاليًا");

    quizRunning = true;
    msg.channel.send(" **بدأت فعالية الأسئلة (تجربة)**");

    for (let i = 0; i < QUESTIONS.length; i++) {
      await msg.channel.send(` **سؤال ${i + 1}:**\n${QUESTIONS[i].q}`);
      await new Promise(res => setTimeout(res, 30000)); // 30 ثانية لكل سؤال
    }

    msg.channel.send("🏁 **انتهت الفعالية! (تجربة)**");
    quizRunning = false;
  }
});

// ====== تشغيل البوت ======
client.once("ready", () => {
  console.log("🌙 Ramadan Bot Ready (تجربة)");
});

client.login(process.env.TOKEN);
