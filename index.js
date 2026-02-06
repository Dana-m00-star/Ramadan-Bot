const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const cron = require("node-cron");
const fs = require("fs");

// استدعاء الأسئلة
const { qna, tf, words } = require('./questions.js');

// إنشاء البوت
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// إعدادات البوت
const CHANNEL_ID = process.env.CHANNEL_ID;
const ADMIN_ID = "1406429112502976556";

// تواريخ رمضان
const RAMADAN_START = new Date("2026-02-18");
const RAMADAN_END = new Date("2026-03-20");

// مسارات الملفات
const pointsPath = "./points.json";
const attendancePath = "./attendance.json";
const usedQPath = "./usedQuestions.json";
const dailyPointsPath = "./dailyPoints.json";

// متغيرات تشغيل
let attendanceToday = new Set();
let attendanceOpen = false;
let quizRunning = false;

// تحميل الأسئلة
const QUESTIONS = [...qna, ...tf, ...words];

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

// ---- كرون: رسالة أول يوم رمضان ----
cron.schedule("0 0 18 2 *", async () => {
  const ch = await client.channels.fetch(CHANNEL_ID);
  ch.send("@everyone 💚 رمضان كريم ومبارك عليكم الشهر");
});

// ---- كرون: تنبيه قبل التحضير 10 دقائق ----
cron.schedule("50 22 * * *", async () => {
  if (!isRamadan()) return;
  const ch = await client.channels.fetch(CHANNEL_ID);
  ch.send("@everyone باقي 10 دقائق على تحضير التراويح");
});

// ---- كرون: التحضير اليومي الساعة 23:00 ----
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
    content: "@everyone تحضير اللي صلى التراويح. اضغط صليت خلال 30 دقيقة",
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

// ---- تسجيل الحضور بالزر ----
client.on("interactionCreate", async i => {
  if (!i.isButton()) return;
  if (i.customId !== "attend") return;

  if (!attendanceOpen) return i.reply({ content: "انتهى التحضير", ephemeral: true });
  if (attendanceToday.has(i.user.id)) return i.reply({ content: "مسجل مسبقًا", ephemeral: true });

  attendanceToday.add(i.user.id);
  i.reply({ content: "تم تسجيل حضورك", ephemeral: true });
});

// ---- أوامر المستخدمين ----
client.on("messageCreate", async msg => {
  if (msg.author.bot) return;

  // سجل كل رسالة في الـ Console
  console.log({
    server: msg.guild ? msg.guild.name : "DM",
    serverId: msg.guild ? msg.guild.id : "DM",
    channel: msg.channel.name,
    channelId: msg.channel.id,
    user: msg.author.username,
    userId: msg.author.id,
    content: msg.content,
    date: new Date().toISOString()
  });

  const points = loadJSON(pointsPath, {});
  const attendance = loadJSON(attendancePath, {});
  const used = loadJSON(usedQPath, []);
  const dailyPoints = loadJSON(dailyPointsPath, {});

  // نقاطي
  if (msg.content.trim() === "نقاطي") {
    msg.reply(`نقاطك الحالية: ${points[msg.author.id] || 0}`);
  }

  // توب حضور
  if (msg.content.trim() === "توب حضور") {
    const sorted = Object.entries(attendance).sort((a, b) => b[1] - a[1]).slice(0, 5);
    msg.reply(
      "توب حضور\n" +
      sorted.map(([id, c], i) => `${i + 1}. <@${id}> — ${c}`).join("\n")
    );
  }

  // توب نقاط
  if (msg.content.trim() === "توب نقاط") {
    const sorted = Object.entries(points).sort((a, b) => b[1] - a[1]).slice(0, 5);
    msg.reply(
      "توب نقاط\n" +
      sorted.map(([id, c], i) => `${i + 1}. <@${id}> — ${c}`).join("\n")
    );
  }

  // ---- فعالية الأسئلة ----
  if (msg.content.trim() === "فعاليه") {
    if (msg.author.id !== ADMIN_ID) return msg.reply("هذا الأمر للأدمن فقط");
    if (quizRunning) return msg.reply("الفعالية شغالة حاليًا");

    startQuiz(msg);
  }

  // إيقاف الفعالية
  if (msg.content.trim() === "إيقاف فعاليه") {
    if (msg.author.id !== ADMIN_ID) return msg.reply("هذا الأمر للأدمن فقط");
    if (!quizRunning) return msg.reply("لا توجد فعالية شغالة حاليًا");

    quizRunning = false;
    msg.reply("تم إيقاف الفعالية");
  }
});

// ---- دالة بدء الفعالية ----
async function startQuiz(msg) {
  quizRunning = true;

  // تحميل البيانات
  const points = loadJSON(pointsPath, {});
  const used = loadJSON(usedQPath, []);
  const dailyScores = loadJSON(dailyPointsPath, {});

  let available = QUESTIONS.filter((_, i) => !used.includes(i));

  if (available.length < 20) {
    quizRunning = false;
    return msg.reply("لا يوجد 20 سؤال غير مكرر");
  }

  await msg.channel.send("بدأت فعالية الأسئلة! ");

  for (let i = 0; i < 20; i++) {
    if (!quizRunning) break;

    const qIndex = Math.floor(Math.random() * available.length);
    const question = available[qIndex];
    const realIndex = QUESTIONS.indexOf(question);

    used.push(realIndex);
    available.splice(qIndex, 1);
    saveJSON(usedQPath, used);

    // تحديد نوع السؤال
    let questionType = "qna";
    if (question.type) questionType = question.type;
    else if (["صح", "غلط"].includes(question.a?.[0])) questionType = "tf";
    else if (question.word) questionType = "words";

    // عرض السؤال
    let displayQ;
    if (questionType === "words")
      displayQ = ` اول واحد يكتب:\n${question.word}`;
    else if (questionType === "tf")
      displayQ = ` جاوب بصح أو غلط:\n${question.q}`;
    else
      displayQ = ` ${question.q}`;

    await msg.channel.send(`**سؤال ${i + 1}:**\n${displayQ}`);

    // ---- Collector ----
    const filter = m => !m.author.bot;
    const collector = msg.channel.createMessageCollector({
      filter,
      time: 30000
    });

    let answered = false;

    const normalize = txt =>
      txt
        .toString()
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");

    collector.on("collect", async m => {
      if (!quizRunning) {
        collector.stop();
        return;
      }

      console.log("📩", m.author.username, ":", m.content);

      const answer = normalize(m.content);
      let correct = false;

      if (questionType === "tf") {
        if (Array.isArray(question.a)) {
          correct = question.a.some(a => normalize(a) === answer);
        } else {
          correct = normalize(question.a) === answer;
        }
      }

      else if (questionType === "words") {
        correct = normalize(question.word) === answer;
      }

      else if (questionType === "qna") {
        if (Array.isArray(question.a)) {
          correct = question.a.some(a => normalize(a) === answer);
        }
      }

      if (correct && !answered) {
        answered = true;

        // ➕ إضافة النقاط
        points[m.author.id] = (points[m.author.id] || 0) + 1;
        dailyScores[m.author.id] = (dailyScores[m.author.id] || 0) + 1;

        saveJSON(pointsPath, points);
        saveJSON(dailyPointsPath, dailyScores);

        await m.reply("✅ **صح!** حصلت على نقطة ");

        collector.stop("answered");
      }
    });

    await new Promise(resolve => {
      collector.on("end", async () => {
        if (!answered && quizRunning) {
          await msg.channel.send(
            ` انتهى الوقت!\n**الإجابة الصحيحة:** ${
              Array.isArray(question.a)
                ? question.a.join("، ")
                : question.a || question.word
            }`
          );
        }
        resolve();
      });
    });
  }

  // ---- نتائج اليوم ----
  const sortedDaily = Object.entries(dailyScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, c], i) => `${i + 1}. <@${id}> — ${c} نقطة`);

  await msg.channel.send(
    `🏁 **انتهت الفعالية**\n\n🏆 أفضل المشاركين اليوم:\n${sortedDaily.join("\n") || "لا أحد"}`
  );

  quizRunning = false;
}

// ---- كرون: إعلان الفائز النهائي نهاية رمضان ----
cron.schedule("0 0 20 3 *", async () => {
  const ch = await client.channels.fetch(CHANNEL_ID);
  const points = loadJSON(pointsPath, {});
  const attendance = loadJSON(attendancePath, {});
  const dailyPoints = loadJSON(dailyPointsPath, {});

  const topAttendance = Object.entries(attendance).sort((a, b) => b[1] - a[1])[0];
  const topAttendanceId = topAttendance ? topAttendance[0] : "-";
  const topAttendanceCount = topAttendance ? topAttendance[1] : 0;

  const topDaily = Object.entries(dailyPoints).sort((a, b) => b[1] - a[1])[0];
  const topDailyId = topDaily ? topDaily[0] : "-";
  const topDailyCount = topDaily ? topDaily[1] : 0;

  ch.send(`النتائج النهائية لشهر رمضان

أعلى الحضور: <@${topAttendanceId}> — ${topAttendanceCount}
أعلى نقاط الفعالية: <@${topDailyId}> — ${topDailyCount}`);
});

// ---- تشغيل البوت ----
client.once("clientReady", () => {
  console.log("Ramadan Bot Ready");
});

client.login(process.env.TOKEN);
