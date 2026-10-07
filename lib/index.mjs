// What the suite core imports. Everything else is internal.
export { createEmailApp, EmailApp, emailCommand } from './app.mjs';
export { RunByEmail, parseAnswer } from './runbyemail/index.mjs';
export { verifySender } from './runbyemail/verify.mjs';
export { TOOLS, catalogue } from './tools.mjs';
export { makeHandler, buildMcp } from './http.mjs';
export { MemoryMailServer } from './mail/memory.mjs';
export { seedDemo } from './demo.mjs';
