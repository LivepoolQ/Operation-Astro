const MAX_MESSAGE_LENGTH = 100;
const MESSAGE_PREFIX = "campfire:message:";
const RATE_LIMIT_PREFIX = "campfire:message-rate:";
const RATE_LIMIT_SECONDS = 10 * 60;

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

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: env.MESSAGE_FROM_EMAIL,
      to: [env.MESSAGE_TO_EMAIL],
      subject: "New Operation Astro campfire message",
      text: [
        "A visitor left a message by the campfire.",
        "",
        messageRecord.message,
        "",
        `Created at: ${new Date(messageRecord.createdAt).toISOString()}`,
      ].join("\n"),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Email forwarding failed: ${errorText}`);
  }

  return { configured: true };
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
