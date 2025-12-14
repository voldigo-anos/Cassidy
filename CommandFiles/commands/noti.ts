// @ts-check

/**
 * @type {CommandMeta}
 */
export const meta = {
  name: "noti",
  description:
    "Send styled notifications to all groups and allow admins to reply via the bot.",
  author: "Christus",
  version: "6.0.0",
  usage: "{prefix}{name} <message>",
  category: "owner",
  permissions: [2],
  noPrefix: true,
  waitingTime: 5,
  requirement: "3.0.0",
  icon: "📢",
  noLevelUI: true,
  noWeb: true,
};

import { defineEntry } from "@cass/define";

const { getStreamsFromAttachment } = global.utils;

/* -------------------- MEMORY -------------------- */

interface NotificationData {
  groupName: string;
}

interface AdminReplyData {
  originalThreadID: string;
  userID: string;
}

const notificationMemory: Record<string, NotificationData> = {};
const adminReplies: Record<string, AdminReplyData> = {};

/* -------------------- ENTRY -------------------- */

export const entry = defineEntry(
  async ({ input, output, api, args, threadsData, envCommands }) => {
    const delayPerGroup =
      envCommands?.notification?.delayPerGroup ?? 300;

    if (!args.length) {
      return output.reply(
        "⚠ Please provide the message to send to all groups."
      );
    }

    const allThreads = (await threadsData.getAll()).filter(
      (t: any) =>
        t.isGroup &&
        t.members.find(
          (m: any) =>
            m.userID == api.getCurrentUserID() && m.inGroup
        )
    );

    if (!allThreads.length) {
      return output.reply("⚠ No groups found.");
    }

    await output.reply(
      `⏳ Sending notification to ${allThreads.length} groups...`
    );

    let success = 0;
    const errors: { groupName: string; error: string }[] = [];

    for (const thread of allThreads) {
      let groupName = thread.name || "Unknown group";

      if (!thread.name) {
        try {
          const info = await api.getThreadInfo(thread.threadID);
          groupName = info.threadName || groupName;
        } catch {}
      }

      const body = `
━━━━━━━━━━━━━━
📢 𝐍𝐎𝐓𝐈𝐅𝐈𝐂𝐀𝐓𝐈𝐎𝐍
🏷️ 𝐆𝐫𝐨𝐮𝐩 𝐧𝐚𝐦𝐞: ${groupName}

💬
${args.join(" ")}
━━━━━━━━━━━━━━
      `.trim();

      try {
        const attachments = await getStreamsFromAttachment([
          ...input.attachments,
          ...(input.messageReply?.attachments || []),
        ]);

        const sent = await api.sendMessage(
          { body, attachment: attachments },
          thread.threadID
        );

        notificationMemory[
          `${thread.threadID}_${sent.messageID}`
        ] = { groupName };

        success++;
        await new Promise((r) => setTimeout(r, delayPerGroup));
      } catch (e: any) {
        errors.push({
          groupName,
          error: e?.message || "Unknown error",
        });
      }
    }

    let report = `
━━━━━━━━━━━━
📬 𝐒𝐄𝐍𝐃 𝐑𝐄𝐏𝐎𝐑𝐓
✅ Success: ${success}
❌ Failed: ${errors.length}
`;

    for (const err of errors) {
      report += `❌ ${err.groupName}: ${err.error}\n`;
    }

    report += "━━━━━━━━━━━━";

    return output.reply(report.trim());
  }
);

/* -------------------- MESSAGE LISTENER -------------------- */

export async function onMessage({ api, event }: any) {
  if (!event.messageReply) return;

  const repliedID = event.messageReply.messageID;
  const key = Object.keys(notificationMemory).find((k) =>
    k.endsWith(`_${repliedID}`)
  );
  if (!key) return;

  const { groupName } = notificationMemory[key];
  const userName = event.senderName || "Unknown";
  const userID = event.senderID;

  const adminMessage = `
━━━━━━━━━━━━
👤 𝐍𝐎𝐓𝐈𝐅𝐈𝐂𝐀𝐓𝐈𝐎𝐍 𝐑𝐄𝐏𝐋𝐘
📝 Name : ${userName}
🆔 ID   : ${userID}
🏷️ Group: ${groupName}
────────────────────
💬 Message:
${event.body}
────────────────────
💡 Reply to this message to answer via the bot.
━━━━━━━━━━━━
  `.trim();

  try {
    const threads = await api.getThreadList(1000, null, ["INBOX"]);
    const adminIDs = [
      ...new Set(
        threads
          .filter((t: any) => t.isGroup)
          .flatMap((t: any) =>
            t.members
              .filter((m: any) => m.role === 2)
              .map((m: any) => m.userID)
          )
      ),
    ];

    for (const adminID of adminIDs) {
      try {
        const sent = await api.sendMessage(adminMessage, adminID);
        adminReplies[sent.messageID] = {
          originalThreadID: event.threadID,
          userID,
        };
      } catch {}
    }
  } catch {}
}

/* -------------------- ADMIN REPLY -------------------- */

export async function reply({ api, event }: any) {
  const replyData =
    adminReplies[event.messageReply?.messageID];
  if (!replyData) return;

  const { originalThreadID, userID } = replyData;

  try {
    await api.sendMessage(
      event.body,
      originalThreadID || userID
    );
    delete adminReplies[event.messageReply.messageID];
  } catch {}
}
