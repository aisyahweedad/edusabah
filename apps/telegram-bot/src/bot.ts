import { Bot, InlineKeyboard, type Context } from "grammy";
import { COMPLAINT_CATEGORIES, type ComplaintCategory, slaHoursFor } from "@k-aecs/shared";
import { BotApiError, createComplaint, escalateOwnComplaint, harnessChat, lookupComplaint } from "./lib/api.js";
import {
  CATEGORY_LABELS,
  CATEGORY_LABELS_INV,
  CONSENT_TEXT,
  CONSENT_VERSION,
  MENU_TEXT,
  STATUS_LABELS,
  formatDate,
} from "./lib/intent.js";
import { clearState, getState, setState, type WizardDraft, type WizardStep } from "./lib/state.js";

type BotContext = Context;

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

type LineKind = "heading" | "bullet" | "paragraph";

function classifyLine(line: string): LineKind {
  const trimmed = line.trim();
  if (/^#{1,6}\s+/.test(trimmed) || /^\*\*[^*]+\*\*:?$/.test(trimmed)) return "heading";
  if (/^([-*•]|\d+[.)])\s+/.test(trimmed)) return "bullet";
  return "paragraph";
}

/** One blank line between points, two before each big point (heading). */
function neatenAiText(text: string): string {
  const out: string[] = [];

  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;

    const kind = classifyLine(line);
    if (out.length) {
      while (out.length && out[out.length - 1] === "") out.pop();
      out.push("", ...(kind === "heading" ? [""] : []));
    }
    out.push(line);
  }

  return out.join("\n").trim();
}

/** Render the AI's Markdown-ish output as Telegram HTML after escaping it. */
function formatAiHtml(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^\n*]+)\*\*/g, "<b>$1</b>")
    .replace(/__([^\n_]+)__/g, "<b>$1</b>")
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/^#{1,6}\s+(.+)$/gm, "<b>$1</b>");
}

export function telegramUserIdOf(ctx: BotContext): string | undefined {
  const from = ctx.from;
  return from ? String(from.id) : undefined;
}

function chatIdOf(ctx: BotContext): number | undefined {
  return ctx.chat?.id;
}

function menuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("Tanya Soalan", "menu:question")
    .text("Buat Aduan", "menu:complaint")
    .row()
    .text("Semak Aduan", "menu:lookup")
    .text("Bantuan", "menu:help");
}

export function registerBotHandlers(bot: Bot<BotContext>): void {
  bot.command("start", async (ctx) => {
    const chatId = chatIdOf(ctx);
    if (chatId === undefined) return;
    const state = getState(chatId);
    if (state.kind === "consent") {
      await ctx.reply(MENU_TEXT, { parse_mode: "HTML", reply_markup: menuKeyboard() });
      return;
    }
    const kb = new InlineKeyboard().text("Saya Setuju", "consent:agree").row().text("Batal", "consent:decline");
    await ctx.reply(CONSENT_TEXT, { reply_markup: kb });
    setState(chatId, { kind: "consent" });
  });

  bot.command("menu", async (ctx) => {
    const chatId = chatIdOf(ctx);
    if (chatId !== undefined) setState(chatId, { kind: "idle" });
    await ctx.reply(MENU_TEXT, { parse_mode: "HTML", reply_markup: menuKeyboard() });
  });

  bot.command("help", async (ctx) => {
    const chatId = chatIdOf(ctx);
    if (chatId !== undefined) setState(chatId, { kind: "idle" });
    await helpReply(ctx);
  });

  bot.callbackQuery(/^consent:(agree|decline)$/, async (ctx) => {
    const chatId = chatIdOf(ctx);
    if (chatId === undefined) return;
    const choice = ctx.match[1];
    if (choice === "decline") {
      await ctx.answerCallbackQuery();
      await ctx.reply("Baiklah. Anda perlu bersetuju dengan dasar data sebelum menggunakan EduSabah. Ketik /start bila bersedia.");
      setState(chatId, { kind: "idle" });
      return;
    }
    await ctx.answerCallbackQuery();
    await ctx.reply(
      `Terima kasih. Persetujuan anda (${CONSENT_VERSION}) direkodkan.\n\n` + MENU_TEXT,
      { parse_mode: "HTML", reply_markup: menuKeyboard() },
    );
    setState(chatId, { kind: "idle" });
  });

  bot.callbackQuery(/^menu:(question|complaint|lookup|help)$/, async (ctx) => {
    const which = ctx.match[1] as "question" | "complaint" | "lookup" | "help";
    const chatId = chatIdOf(ctx);
    const tgId = telegramUserIdOf(ctx);
    if (chatId === undefined || tgId === undefined) return;
    await ctx.answerCallbackQuery();
    if (which === "question") {
      setState(chatId, { kind: "question" });
      await ctx.reply("Tanya saya apa sahaja tentang pendidikan di Sabah — saya juga boleh cari maklumat terkini di web.");
      return;
    }
    if (which === "lookup") {
      setState(chatId, { kind: "lookup" });
      await ctx.reply("Sila hantar nombor rujukan aduan anda (contoh: KPSTI-2026-000001).");
      return;
    }
    if (which === "help") {
      setState(chatId, { kind: "idle" });
      await helpReply(ctx);
      return;
    }
    setState(chatId, { kind: "wizard", step: "category", data: {} });
    await sendCategoryPicker(ctx);
  });

  bot.callbackQuery(/^wizard:category:(.+)$/, async (ctx) => {
    const chatId = chatIdOf(ctx);
    if (chatId === undefined) return;
    await ctx.answerCallbackQuery();
    const label = ctx.match[1];
    if (!label) return;
    const category = CATEGORY_LABELS_INV[label];
    if (!category) return;
    const state = getState(chatId);
    if (state.kind !== "wizard") return;
    setState(chatId, { kind: "wizard", step: "title", data: { category } });
    await ctx.reply(`Kategori: <b>${escapeHtml(label)}</b>\n\nSila berikan tajuk ringkas (min 5 aksara).`, { parse_mode: "HTML" });
  });

  bot.callbackQuery(/^wizard:location:skip$/, async (ctx) => {
    const chatId = chatIdOf(ctx);
    if (chatId === undefined) return;
    await ctx.answerCallbackQuery();
    const state = getState(chatId);
    if (state.kind !== "wizard") return;
    setState(chatId, { kind: "wizard", step: "confirm", data: state.data });
    await confirmReply(ctx, state.data);
  });

  bot.callbackQuery(/^wizard:confirm:yes$/, async (ctx) => {
    const chatId = chatIdOf(ctx);
    const tgId = telegramUserIdOf(ctx);
    if (chatId === undefined || tgId === undefined) return;
    await ctx.answerCallbackQuery();
    const state = getState(chatId);
    if (state.kind !== "wizard" || state.step !== "confirm") return;
    const data = state.data;
    const category = data.category;
    const title = data.title;
    const description = data.description;
    if (!category || !title || !description) return;
    try {
      const { complaint } = await createComplaint(tgId, {
        category,
        title,
        description,
        location: data.location,
      });
      clearState(chatId);
      const statusLabel = STATUS_LABELS[complaint.status] ?? complaint.status;
      const slaHours = slaHoursFor(complaint.severity);
      const slaText =
        slaHours >= 24 ? `${Math.round(slaHours / 24)} hari bekerja` : `${slaHours} jam`;
      const escalatedNote = complaint.status === "escalated"
        ? "\n\n⚠️ Aduan ini <b>dinaikkan tahap secara automatik</b> kerana kepentingan tinggi. Setiausaha Politik telah dimaklumkan."
        : "";
      await ctx.reply(
        "Aduan anda telah diterima. Terima kasih.\n\n" +
          `Nombor rujukan: <b>${escapeHtml(complaint.referenceNumber)}</b>\n` +
          `Status: ${escapeHtml(statusLabel)}\n` +
          `Tarikh: ${escapeHtml(formatDate(complaint.createdAt))}\n` +
          `Masa sasaran tindakan: <b>${escapeHtml(slaText)}</b>` +
          escalatedNote +
          "\n\nSimpan nombor rujukan ini untuk menyemak status melalui /menu → Semak Aduan.",
        { parse_mode: "HTML" },
      );
    } catch (error) {
      await ctx.reply(
        `Maaf, aduan tidak dapat dihantar.\n\n${error instanceof Error ? error.message : "Sila cuba lagi."}`,
      );
    }
  });

  bot.callbackQuery(/^wizard:confirm:no$/, async (ctx) => {
    const chatId = chatIdOf(ctx);
    if (chatId === undefined) return;
    await ctx.answerCallbackQuery();
    clearState(chatId);
    await ctx.reply("Aduan dibatalkan. Tiada data disimpan.", { reply_markup: menuKeyboard() });
  });

  // UC-03: citizen-triggered escalation for overdue complaints.
  bot.callbackQuery(/^lookup:escalate:(.+)$/, async (ctx) => {
    const chatId = chatIdOf(ctx);
    const tgId = telegramUserIdOf(ctx);
    if (chatId === undefined || tgId === undefined) return;
    await ctx.answerCallbackQuery();
    const reference = ctx.match[1];
    if (!reference) return;
    try {
      await escalateOwnComplaint(tgId, reference);
      await ctx.reply(
        `Aduan <b>${escapeHtml(reference)}</b> telah dinaikkan tahap ke Setiausaha Politik. ` +
          "Anda akan dimaklumkan apabila terdapat kemaskini.",
        { parse_mode: "HTML", reply_markup: menuKeyboard() },
      );
    } catch (error) {
      await ctx.reply(
        error instanceof Error ? `Maaf: ${error.message}` : "Maaf, eskalasi tidak dapat dilakukan.",
      );
    }
  });

  bot.callbackQuery("menu:back", async (ctx) => {
    const chatId = chatIdOf(ctx);
    if (chatId === undefined) return;
    await ctx.answerCallbackQuery();
    setState(chatId, { kind: "idle" });
    await ctx.reply(MENU_TEXT, { parse_mode: "HTML", reply_markup: menuKeyboard() });
  });

  bot.on("message", async (ctx) => {
    const chatId = chatIdOf(ctx);
    const tgId = telegramUserIdOf(ctx);
    const text = ctx.message.text?.trim();
    if (chatId === undefined || tgId === undefined || !text) return;

    const state = getState(chatId);
    if (state.kind === "wizard") {
      await handleWizardText(ctx, state.step, state.data);
      return;
    }

    if (state.kind === "lookup") {
      await ctx.reply("Menyemak…");
      try {
        const { complaint, notes, tracking } = await lookupComplaint(tgId, text);
        setState(chatId, { kind: "idle" });
        const statusLabel = STATUS_LABELS[complaint.status] ?? complaint.status;
        let message =
          `${complaint.referenceNumber}\n` +
          `Tajuk: <b>${escapeHtml(complaint.title)}</b>\n` +
          `Status: <b>${escapeHtml(statusLabel)}</b>\n` +
          `Dikemaskini: ${escapeHtml(formatDate(complaint.createdAt))}\n`;
        if (tracking?.responsibleUnit) {
          message += `Unit bertanggungjawab: <b>${escapeHtml(tracking.responsibleUnit)}</b>\n`;
        }
        if (tracking?.responsibleOfficer) {
          message += `Pegawai: ${escapeHtml(tracking.responsibleOfficer)}\n`;
        }
        if (tracking?.overdue) {
          message +=
            "\n⚠️ <b>Aduan ini melebihi masa sasaran.</b>\n" +
            "Anda boleh naikkan tahap aduan ini kepada pihak yang lebih tinggi.\n";
        }
        if ((complaint.status === "resolved" || complaint.status === "closed") && complaint.resolutionSummary) {
          message += `\n<i>Rumusan penyelesaian:</i>\n${escapeHtml(complaint.resolutionSummary)}\n`;
        }
        if (notes.length) {
          message += "\n<i>Makluman terkini:</i>\n";
          for (const note of notes.slice(0, 3)) {
            message += `• ${escapeHtml(formatDate(note.createdAt))} — ${escapeHtml(note.content.slice(0, 300))}\n`;
          }
        }
        const keyboard =
          tracking?.offerEscalation && tracking.overdue
            ? new InlineKeyboard()
                .text("Naikkan tahap aduan", `lookup:escalate:${complaint.referenceNumber}`)
                .row()
                .text("Menu utama", "menu:back")
            : new InlineKeyboard().text("Menu utama", "menu:back");
        await ctx.reply(message, { parse_mode: "HTML", reply_markup: keyboard });
      } catch (error) {
        const notFound =
          error instanceof BotApiError &&
          (error.code === "NOT_FOUND" || error.code === "NOT_YOURS");
        const intro = notFound
          ? `Nombor rujukan <b>${escapeHtml(text)}</b> tidak ditemui untuk akaun anda.`
          : "Maaf, aduan tidak dapat disemak buat masa ini.";
        const next = notFound
          ? "Sila hantar nombor rujukan lain (contoh: KPSTI-2026-000001), atau ketik Menu utama untuk keluar."
          : "Sila hantar semula nombor rujukan anda, atau ketik Menu utama untuk keluar.";
        await ctx.reply(`${intro}\n\n${next}`, {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard().text("Menu utama", "menu:back"),
        });
      }
      return;
    }

    if (state.kind === "question" || state.kind === "idle") {
      setState(chatId, { kind: "question" });
      await ctx.reply("Memproses soalan anda…");
      try {
        const result = await harnessChat(tgId, String(chatId), text);
        const answer = formatAiHtml(neatenAiText(result.text || "Tiada jawapan."));
        await ctx.reply(answer, {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard()
            .text("Buat Aduan", "menu:complaint")
            .text("Menu utama", "menu:back"),
        });
      } catch (error) {
        await ctx.reply(
          error instanceof Error
            ? `Maaf, perkhidmatan sedang sibuk.\n\n${error.message}`
            : "Maaf, perkhidmatan sedang sibuk. Sila cuba lagi.",
          {
            reply_markup: new InlineKeyboard()
              .text("Buat Aduan", "menu:complaint")
              .text("Menu utama", "menu:back"),
          },
        );
      }
      return;
    }

    await ctx.reply(MENU_TEXT, { parse_mode: "HTML", reply_markup: menuKeyboard() });
  });
}

async function handleWizardText(
  ctx: BotContext,
  step: WizardStep,
  data: WizardDraft,
): Promise<void> {
  const chatId = chatIdOf(ctx);
  const text = (ctx.message?.text ?? "").trim();
  if (chatId === undefined) return;
  if (step === "confirm") {
    await ctx.reply("Sila tekan butang Hantar atau Batal di bawah.", {
      reply_markup: new InlineKeyboard().text("Hantar Aduan", "wizard:confirm:yes").text("Batal", "wizard:confirm:no"),
    });
    return;
  }
  if (step === "category") {
    await sendCategoryPicker(ctx);
    return;
  }
  if (step === "title") {
    if (text.length < 5) {
      await ctx.reply("Tajuk terlalu pendek. Sila guna sekurang-kurangnya 5 aksara.");
      return;
    }
    setState(chatId, { kind: "wizard", step: "description", data: { ...data, title: text } });
    await ctx.reply("Tajuk disimpan. Sila terangkan aduan anda secara terperinci (min 20 aksara):");
    return;
  }
  if (step === "description") {
    if (text.length < 20) {
      await ctx.reply("Huraian terlalu pendek. Sila berikan sekurang-kurangnya 20 aksara.");
      return;
    }
    setState(chatId, {
      kind: "wizard",
      step: "location",
      data: { ...data, description: text },
    });
    const kb = new InlineKeyboard().text("Langkau", "wizard:location:skip");
    await ctx.reply("Sila berikan lokasi (nama sekolah/daerah) atau tekan Langkau:", { reply_markup: kb });
    return;
  }
  if (step === "location") {
    setState(chatId, {
      kind: "wizard",
      step: "confirm",
      data: { ...data, location: text || data.location },
    });
    await confirmReply(ctx, { ...data, location: text || data.location });
  }
}

async function sendCategoryPicker(ctx: BotContext): Promise<void> {
  const kb = new InlineKeyboard();
  COMPLAINT_CATEGORIES.forEach((category, i) => {
    if (i % 2 === 0 && i > 0) kb.row();
    kb.text(CATEGORY_LABELS[category], `wizard:category:${CATEGORY_LABELS[category]}`);
  });
  await ctx.reply("Pilih kategori aduan:", { reply_markup: kb });
}

async function confirmReply(ctx: BotContext, data: WizardDraft): Promise<void> {
  const category = data.category as ComplaintCategory | undefined;
  const message =
    "Sila sahkan aduan anda:\n\n" +
    `Kategori: <b>${escapeHtml(category ? CATEGORY_LABELS[category] : "—")}</b>\n` +
    `Tajuk: <b>${escapeHtml((data.title ?? "").slice(0, 200))}</b>\n` +
    `Huraian: ${escapeHtml((data.description ?? "").slice(0, 300))}\n` +
    `Lokasi: ${escapeHtml(data.location ?? "Tidak dinyatakan")}\n\n` +
    "Adakah maklumat ini betul?";
  const kb = new InlineKeyboard().text("Hantar Aduan", "wizard:confirm:yes").text("Batal", "wizard:confirm:no");
  await ctx.reply(message, { parse_mode: "HTML", reply_markup: kb });
}

async function helpReply(ctx: BotContext): Promise<void> {
  await ctx.reply(
    "<b>Bantuan EduSabah</b>\n\n" +
      "• <b>Tanya Soalan</b> — tanya isu pendidikan; AI kami mencari jawapan dalam pangkalan pengetahuan dan web.\n" +
      "• <b>Buat Aduan</b> — bimbingan langkah demi langkah untuk menyerahkan aduan.\n" +
      "• <b>Semak Aduan</b> — semak status aduan menggunakan nombor rujukan.\n\n" +
      "Waktu operasi sokongan: Isnin–Jumaat, 8 pagi–5 petang.\n" +
      "Untuk kecemasan sekolah, sila hubungi Pejabat Pendidikan Daerah berhampiran.",
    {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text("Menu utama", "menu:back"),
    },
  );
}
