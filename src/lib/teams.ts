/**
 * Microsoft Teams webhook sender.
 *
 * Supports two webhook types:
 *   "messagecard"  — Classic Incoming Webhook connector (MessageCard format).
 *                    Create in Teams: channel ▸ Apps ▸ Incoming Webhook.
 *   "workflow"     — Power Automate / Workflow connector (Adaptive Card format).
 *                    Create in Teams: channel ▸ Workflows ▸ "Post to a channel when a webhook request is received".
 *
 * The type is auto-detected by inspecting the URL:
 *   - URLs containing "webhook.office.com"  → messagecard
 *   - URLs containing "logic.azure.com" or "powerautomate" → workflow
 *   - Everything else defaults to messagecard
 */

export interface TeamsMessage {
  title: string;
  text: string;            // plain-text summary (shown in notifications)
  facts?: Array<{ name: string; value: string }>;
  actionLabel?: string;
  actionUrl?: string;
}

function detectWebhookType(url: string): "messagecard" | "workflow" {
  if (url.includes("logic.azure.com") || url.includes("powerautomate.com")) {
    return "workflow";
  }
  return "messagecard";  // webhook.office.com and everything else
}

function buildMessageCard(msg: TeamsMessage): object {
  const sections: object[] = [
    {
      activityTitle: `**${msg.title}**`,
      activityText:  msg.text,
      facts:         msg.facts ?? [],
      markdown:      true,
    },
  ];

  const actions: object[] = msg.actionUrl
    ? [{ "@type": "OpenUri", name: msg.actionLabel ?? "Open TimeBoard",
         targets: [{ os: "default", uri: msg.actionUrl }] }]
    : [];

  return {
    "@type":      "MessageCard",
    "@context":   "http://schema.org/extensions",
    themeColor:   "4F46E5",
    summary:      msg.title,
    sections,
    potentialAction: actions,
  };
}

function buildAdaptiveCard(msg: TeamsMessage): object {
  const body: object[] = [
    { type: "TextBlock", text: msg.title, weight: "Bolder", size: "Medium" },
    { type: "TextBlock", text: msg.text, wrap: true },
  ];

  if (msg.facts && msg.facts.length > 0) {
    body.push({
      type: "FactSet",
      facts: msg.facts.map((f) => ({ title: f.name, value: f.value })),
    });
  }

  const actions: object[] = msg.actionUrl
    ? [{ type: "Action.OpenUrl", title: msg.actionLabel ?? "Open TimeBoard", url: msg.actionUrl }]
    : [];

  return {
    type: "message",
    attachments: [{
      contentType: "application/vnd.microsoft.card.adaptive",
      content: {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        type:    "AdaptiveCard",
        version: "1.4",
        body,
        actions,
      },
    }],
  };
}

export async function sendTeamsMessage(
  webhookUrl: string,
  msg: TeamsMessage,
): Promise<{ ok: boolean; error?: string }> {
  if (!webhookUrl?.startsWith("http")) {
    return { ok: false, error: "Invalid Teams webhook URL." };
  }

  const type    = detectWebhookType(webhookUrl);
  const payload = type === "workflow" ? buildAdaptiveCard(msg) : buildMessageCard(msg);

  try {
    const res = await fetch(webhookUrl, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });

    // Teams returns "1" (plain text) on success for MessageCard; Workflow returns 200 with JSON
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Teams responded ${res.status}: ${body.slice(0, 200)}` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}
