import { CanvCass } from "@cass-modules/CassieahExtras";
import { loadImage } from "@napi-rs/canvas";

export const meta: CommandMeta = {
  name: "quote",
  description: "Generate a quote image VIA CanvCass",
  author: "Liane Cagara",
  version: "2.0.0",
  usage: "{prefix}{name} <text>",
  category: "Media",
  permissions: [0],
  noPrefix: false,
  waitingTime: 5,
  requirement: "3.0.0",
  otherNames: ["q"],
  icon: "📝",
  noLevelUI: true,
  noWeb: true,
};

export const style: CommandStyle = {
  title: "📝 Quote",
  contentFont: "fancy",
  titleFont: "bold",
};

export async function entry({
  cancelCooldown,
  output,
  args,
  prefix,
  commandName,
  uid,
  usersDB,
  userName,
}: CommandContext) {
  if (args.length === 0) {
    cancelCooldown();
    return output.reply(
      `❌ Please enter a quote.
**Example**: ${prefix}${commandName} Life is short, smile while you still have teeth.`
    );
  }

  if (!usersDB.isNumKey(uid)) {
    return output.reply("❌ Only facebook users can use this command.");
  }

  const quoteText = args.join(" ");

  let url = await usersDB.getAvatarURL(uid);
  if (!url) {
    return output.reply(`❌ We cannot find your profile picture.`);
  }

  const i = await output.reply("⏳ ***Generating***\n\nPlease wait...");

  const info = await usersDB.getUserInfo(uid);

  try {
    const canv = new CanvCass(720, 720);

    const pfp = await loadImage("")

    await output.reply({
      body: `📝 Quote from ***${info?.name ?? userName}***:`,
      attachment: await canv.toStream(),
    });

    await output.unsend(i.messageID);
  } catch (error) {
    return output.error(error);
  }
}
