const MAX_MESSAGE_LENGTH = 100;
const MESSAGE_PREFIX = "campfire:message:";
const RATE_LIMIT_PREFIX = "campfire:message-rate:";
const RATE_LIMIT_SECONDS = 10 * 60;

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const json = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init.headers || {}),
    },
  });

const cleanMessage = (value) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH);

const getClientKey = (request) => {
  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "local";
  return `${RATE_LIMIT_PREFIX}${ip}`;
};

const sendEmail = async (env, messageRecord) => {
  if (!env.RESEND_API_KEY || !env.MESSAGE_TO_EMAIL || !env.MESSAGE_FROM_EMAIL) {
    return { configured: false };
  }

  const createdAt = new Date(messageRecord.createdAt).toISOString();
  const subject = "New Operation Astro campfire message";
  const text = [
    "A visitor left a message by the campfire.",
    "",
    messageRecord.message,
    "",
    `Created at: ${createdAt}`,
    `Message ID: ${messageRecord.id}`,
  ].join("\n");
  const html = [
    "<div style=\"font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.55; color: #1f2937;\">",
    "<p>A visitor left a message by the campfire.</p>",
    `<blockquote style="margin: 16px 0; padding: 12px 16px; border-left: 4px solid #f59e0b; background: #fff7ed;">${escapeHtml(messageRecord.message)}</blockquote>`,
    `<p style="font-size: 12px; color: #6b7280;">Created at: ${escapeHtml(createdAt)}<br />Message ID: ${escapeHtml(messageRecord.id)}</p>`,
    "</div>",
  ].join("");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
      "Idempotency-Key": messageRecord.id,
    },
    body: JSON.stringify({
      from: env.MESSAGE_FROM_EMAIL,
      to: [env.MESSAGE_TO_EMAIL],
      subject,
      text,
      html,
      tags: [
        {
          name: "source",
          value: "operation_astro_campfire",
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Email forwarding failed: ${errorText}`);
  }

  const result = await response.json().catch(() => ({}));
  return {
    configured: true,
    id: result.id || "",
  };
};

export async function onRequestPost({ request, env }) {
  try {
    if (!env.CAMPFIRE_STATE) {
      throw new Error("Missing CAMPFIRE_STATE KV binding");
    }

    const body = await request.json().catch(() => ({}));
    const message = cleanMessage(body.message);

    if (!message) {
      return json({ error: "Message cannot be empty." }, { status: 400 });
    }

    const rateLimitKey = getClientKey(request);
    const rateLimited = await env.CAMPFIRE_STATE.get(rateLimitKey);
    if (rateLimited) {
      return json({ error: "Please wait a little before leaving another message." }, { status: 429 });
    }

    const now = Date.now();
    const id = `${now}-${crypto.randomUUID()}`;
    const messageRecord = {
      id,
      message,
      createdAt: now,
      userAgent: request.headers.get("user-agent") || "",
    };

    await env.CAMPFIRE_STATE.put(`${MESSAGE_PREFIX}${id}`, JSON.stringify(messageRecord));
    await env.CAMPFIRE_STATE.put(rateLimitKey, "1", { expirationTtl: RATE_LIMIT_SECONDS });

    let email = { configured: false };
    try {
      email = await sendEmail(env, messageRecord);
    } catch (error) {
      return json({
        ...messageRecord,
        email,
        warning: error.message,
      });
    }

    return json({
      ...messageRecord,
      email,
    });
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
}
