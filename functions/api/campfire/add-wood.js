const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_WOOD = 30;
const STATE_KEY = "campfire:global";

const json = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init.headers || {}),
    },
  });

const snapshot = (state = {}) => {
  const now = Date.now();
  const burnUntil = Number.isFinite(state.burnUntil) ? state.burnUntil : 0;
  const remainingMs = Math.max(0, burnUntil - now);
  const woodCount = Math.min(MAX_WOOD, Math.ceil(remainingMs / DAY_MS));

  return {
    burnUntil,
    remainingMs,
    woodCount,
    maxWood: MAX_WOOD,
    updatedAt: Number.isFinite(state.updatedAt) ? state.updatedAt : 0,
  };
};

const readState = async (env) => {
  if (!env.CAMPFIRE_STATE) {
    throw new Error("Missing CAMPFIRE_STATE KV binding");
  }

  const stored = await env.CAMPFIRE_STATE.get(STATE_KEY, "json");
  return snapshot(stored || {});
};

export async function onRequestPost({ env }) {
  try {
    const current = await readState(env);
    if (current.woodCount >= MAX_WOOD) {
      return json({ ...current, error: "The campfire already has the maximum number of logs." }, { status: 409 });
    }

    const now = Date.now();
    const nextBurnUntil = Math.min(now + MAX_WOOD * DAY_MS, Math.max(now, current.burnUntil) + DAY_MS);
    const next = snapshot({
      burnUntil: nextBurnUntil,
      updatedAt: now,
    });

    await env.CAMPFIRE_STATE.put(
      STATE_KEY,
      JSON.stringify({
        burnUntil: next.burnUntil,
        updatedAt: next.updatedAt,
      }),
    );

    return json(next);
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
}
