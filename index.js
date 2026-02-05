const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
const cron = require("node-cron");
const fs = require("fs");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const CHANNEL_ID = process.env.CHANNEL_ID;
const ADMIN_ID = "1406429112502976556";

// تواريخ رمضان
const RAMADAN_START = new Date("2026-02-18");
const RAMADAN_END   = new Date("2026-03-20");

// ---- رسالة أول يوم رمضان ----
cron.schedule("0 0 18 2 *", async () => { // 18 فبراير الساعة 00:00
  const ch = await client.channels.fetch(CHANNEL_ID);
  ch.send("رمضان كريم ومبارك عليكم الشهر");
});

// مسارات الملفات
const pointsPath = "./points.json";
const attendancePath = "./attendance.json";
const usedQPath = "./usedQuestions.json";
const dailyPointsPath = "./dailyPoints.json";
const questionsPath = "./questions.js";

// متغيرات تشغيل
let attendanceToday = new Set();
let attendanceOpen = false;
let quizRunning = false;

// تحميل الأسئلة
const QUESTIONS = require(questionsPath);

// دوال مساعدة
function loadJSON(path, def) {
  return fs.existsSync(path) ? JSON.parse(fs.readFileSync(path)) : def;
}

function saveJSON(path, data) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

function isRamadan() {
  const now = new Date();
  return now >= RAMADAN_START && now <= RAMADAN_END;
}

function getRamadanDay() {
  const diff = Math.floor((new Date() - RAMADAN_START) / (1000 * 60 * 60 * 24));
  return `${diff + 1} رمضان`;
}

// تنبيه قبل التحضير 10 دقائق
cron.schedule("50 22 * * *", async () => {
  if (!isRamadan()) return;
  const ch = await client.channels.fetch(CHANNEL_ID);
  ch.send("@everyone باقي 10 دقائق على تحضير اللي صلى التراويح");
});

// التحضير اليومي الساعة 23:00
cron.schedule("0 23 * * *", async () => {
  if (!isRamadan()) return;

  const ch = await client.channels.fetch(CHANNEL_ID);
  attendanceToday.clear();
  attendanceOpen = true;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("attend")
      .setLabel("صليت")
      .setStyle(ButtonStyle.Success)
  );

  const msg = await ch.send({
    content: "@everyone تحضير اللي صلى التراويح. اضغط صلت خلال 30 دقيقة",
    components: [row]
  });

  setTimeout(async () => {
    attendanceOpen = false;

    const points = loadJSON(pointsPath, {});
    const attendance = loadJSON(attendancePath, {});
    let mentions = [];

    attendanceToday.forEach(id => {
      points[id] = (points[id] || 0) + 1;
      attendance[id] = (attendance[id] || 0) + 1;
      mentions.push(`• <@${id}>`);
    });

    saveJSON(pointsPath, points);
    saveJSON(attendancePath, attendance);

    await msg.edit({ components: [] });

    ch.send(`نتائج التحضير – ${getRamadanDay()}

عدد الحاضرين: ${attendanceToday.size}

الحاضرين:
${mentions.join("\n") || "-"}

+1 نقطة لكل حاضر`);
  }, 30 * 60 * 1000);
});

// زر الحضور
client.on("interactionCreate", async i => {
  if (!i.isButton()) return;
  if (i.customId !== "attend") return;

  if (!attendanceOpen)
    return i.reply({ content: "انتهى التحضير", ephemeral: true });

  if (attendanceToday.has(i.user.id))
    return i.reply({ content: "مسجل مسبقًا", ephemeral: true });

  attendanceToday.add(i.user.id);
  i.reply({ content: "تم تسجيل حضورك", ephemeral: true });
});

// أوامر المستخدمين
client.on("messageCreate", async msg => {
  if (msg.author.bot) return;

  const points = loadJSON(pointsPath, {});
  const attendance = loadJSON(attendancePath, {});
  const used = loadJSON(usedQPath, []);
  const dailyPoints = loadJSON(dailyPointsPath, {});

  // نقاطي
  if (msg.content === "/نقاطي") {
    msg.reply(`نقاطك الحالية: ${points[msg.author.id] || 0}`);
  }

  // توب حضور
  if (msg.content === "توب حضور") {
    const sorted = Object.entries(attendance).sort((a, b) => b[1] - a[1]).slice(0, 5);
    msg.reply(
      "توب حضور\n" +
      sorted.map(([id, c], i) => `${i + 1}. <@${id}> — ${c}`).join("\n")
    );
  }

  // توب نقاط
  if (msg.content === "توب نقاط") {
    const sorted = Object.entries(points).sort((a, b) => b[1] - a[1]).slice(0, 5);
    msg.reply(
      "توب نقاط\n" +
      sorted.map(([id, c], i) => `${i + 1}. <@${id}> — ${c}`).join("\n")
    );
  }

  // فعالية الأسئلة
  if (msg.content === "فعاليه") {
    if (msg.author.id !== ADMIN_ID) return msg.reply("هذا الأمر للأدمن فقط");
    if (quizRunning) return msg.reply("الفعالية شغالة حاليًا");

    quizRunning = true;

    let available = QUESTIONS.filter((_, i) => !used.includes(i));

    if (available.length < 20) {
      quizRunning = false;
      return msg.reply("لا يوجد 20 سؤال غير مكرر");
    }

    msg.channel.send("بدأت فعالية الأسئلة");

    let dailyScores = {}; // نقاط الفعالية لهذا اليوم

    for (let i = 0; i < 20; i++) {
      if (!quizRunning) break;

      const qIndex = Math.floor(Math.random() * available.length);
      const question = available[qIndex];
      const realIndex = QUESTIONS.indexOf(question);

      used.push(realIndex);
      available.splice(qIndex, 1);
      saveJSON(usedQPath, used);

      await msg.channel.send(`سؤال ${i + 1}:\n${question.q}`);

      await new Promise(res => setTimeout(res, 30 * 1000));
    }

    // توزيع نقاط على المشاركين في الفعالية
    attendanceToday.forEach(id => {
      dailyPoints[id] = (dailyPoints[id] || 0) + 1;
      points[id] = (points[id] || 0) + 1;
    });

    saveJSON(pointsPath, points);
    saveJSON(dailyPointsPath, dailyPoints);

    // ترتيب اليوم
    let sortedDaily = Object.entries(dailyPoints)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, c], i) => `${i + 1}. <@${id}> — ${c}`);

    msg.channel.send(`انتهت الفعالية. أفضل المشاركين اليوم:\n${sortedDaily.join("\n")}`);

    quizRunning = false;
  }

  // إيقاف الفعالية
  if (msg.content === "إيقاف فعالية") {
    if (msg.author.id !== ADMIN_ID) return msg.reply("هذا الأمر للأدمن فقط");
    if (!quizRunning) return msg.reply("لا توجد فعالية شغالة حاليًا");

    quizRunning = false;
    msg.reply("تم إيقاف الفعالية مؤقتًا");
  }
});

// إعلان الفائز النهائي نهاية رمضان
cron.schedule("0 0 20 3 *", async () => { // 20 مارس الساعة 00:00
  const ch = await client.channels.fetch(CHANNEL_ID);
  const points = loadJSON(pointsPath, {});
  const attendance = loadJSON(attendancePath, {});
  const dailyPoints = loadJSON(dailyPointsPath, {});

  // فائز التحضير
  const topAttendance = Object.entries(attendance).sort((a, b) => b[1] - a[1])[0];
  const topAttendanceId = topAttendance ? topAttendance[0] : "-";
  const topAttendanceCount = topAttendance ? topAttendance[1] : 0;

  // فائز الفعالية
  const topDaily = Object.entries(dailyPoints).sort((a, b) => b[1] - a[1])[0];
  const topDailyId = topDaily ? topDaily[0] : "-";
  const topDailyCount = topDaily ? topDaily[1] : 0;

  ch.send(`النتائج النهائية لشهر رمضان

أعلى الحضور: <@${topAttendanceId}> — ${topAttendanceCount}
أعلى نقاط الفعالية: <@${topDailyId}> — ${topDailyCount}`);
});

// تشغيل البوت
client.once("ready", () => {
  console.log("Ramadan Bot Ready");
});

client.login(process.env.TOKEN);
