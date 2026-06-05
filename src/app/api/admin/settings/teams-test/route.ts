import { NextResponse } from "next/server";
import { getSession, getSessionProfileId } from "@/lib/session";
import { sendTeamsMessage } from "@/lib/teams";

export async function POST(request: Request) {
  const session = await getSession();
  if (!getSessionProfileId(session) || session.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { webhookUrl } = (await request.json()) as { webhookUrl?: string };
  if (!webhookUrl?.startsWith("http")) {
    return NextResponse.json({ error: "A valid webhook URL is required." }, { status: 400 });
  }

  const result = await sendTeamsMessage(webhookUrl, {
    title:       "✅ TimeBoard — Test Message",
    text:        "Your Teams webhook is working correctly. TimeBoard shift reminders will be sent to this channel.",
    facts:       [
      { name: "Sent from", value: "TimeBoard Admin Settings" },
      { name: "Channel",   value: "Microsoft Teams Incoming Webhook" },
    ],
    actionLabel: "Open TimeBoard",
    actionUrl:   process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000",
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Delivery failed." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
