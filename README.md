<!--
 * @Author: Ziqian Zou
 * @Date: 2026-01-29 23:35:32
 * @LastEditors: Ziqian Zou
 * @LastEditTime: 2026-02-03 15:42:43
 * @Description: file content
 * @Github: https://github.com/LivepoolQ
 * Copyright 2026 Ziqian Zou, All Rights Reserved.
-->
🌀

## Cloudflare campfire message email

The campfire message endpoint is `functions/api/campfire/message.js`.

Required binding:

- `CAMPFIRE_STATE`: KV namespace used for campfire state and visitor messages.

Optional email forwarding variables:

- `RESEND_API_KEY`: Resend API key.
- `MESSAGE_TO_EMAIL`: inbox that receives visitor messages.
- `MESSAGE_FROM_EMAIL`: verified Resend sender, for example `Operation Astro <campfire@example.com>`.

Without the Resend variables, messages are still saved to KV. With all three variables, the message endpoint also forwards the note by email.

Cloudflare Pages path:

`Workers & Pages -> operation-astro -> Settings -> Environment variables`

After changing bindings or variables, redeploy the Pages project.
