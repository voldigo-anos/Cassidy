/*
@XaviaCMD
@Christus
*/

import axios from "axios";

const config = {
  name: "ai",
  version: "2.3.0",
  permissions: [0],
  noPrefix: "both",
  credits: "Christus",
  description: "Interact with Christus Gemini AI via Aryan Chauhan’s API Proxy",
  category: "Artificial Intelligence",
  usages: "[question]",
  cooldown: 3
};

const style = {
  title: "🇨🇮 𝗖𝗵𝗿𝗶𝘀𝘁𝘂𝘀 𝗚𝗲𝗺𝗶𝗻𝗶 🇨🇮"
};

async function onCall({ message, args }) {
  const text = args.join(" ");
  if (!text)
    return message.reply("❌ Please provide a question or message for Christus Gemini to answer.");

  try {
    const url = `https://arychauhann.onrender.com/api/gemini-proxy2?prompt=${encodeURIComponent(text)}`;
    const res = await axios.get(url, { headers: { "Content-Type": "application/json" } });

    if (!res.data || !res.data.result) {
      return message.reply("⚠️ No response received from Christus Gemini. Please try again later.");
    }

    const response = res.data.result.trim();
    const timestamp = new Date().toISOString().replace("T", " ").split(".")[0];

    const formattedMessage = 
`━━━━━━━━━━━━━━━
${style.title}
━━━━━━━━━━━━━━━
💬 𝗬𝗼𝘂 𝗮𝘀𝗸𝗲𝗱: ${text}
💡 𝗖𝗵𝗿𝗶𝘀𝘁𝘂𝘀 𝗕𝗼𝘁'𝘀 𝗥𝗲𝘀𝗽𝗼𝗻𝘀𝗲: ${response}

📅 𝗧𝗶𝗺𝗲𝘀𝘁𝗮𝗺𝗽: ${timestamp} UTC
━━━━━━━ ✕ ━━━━━━
𝖠𝗌 𝖳𝗁𝖾 𝖩𝗈𝗎𝗋𝗇𝖾𝗒𝗌 𝖨𝗇 𝖳𝗁𝖾 𝖲𝗍𝖺𝗋𝗌, 𝖳𝗁𝖾𝗋𝖾'𝗌 𝖭𝗈 𝖲𝗍𝗈𝗉𝗉𝗂𝗇𝗀. 🇨🇮`;

    message.reply(formattedMessage);

  } catch (err) {
    message.reply(`❌ An error occurred while fetching data:\n${err.message}`);
  }
}

export default {
  config,
  onCall,
  style
};
