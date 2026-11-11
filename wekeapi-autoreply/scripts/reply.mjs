// Send a text reply and record it (enforces >=3s between sends; updates replied.json for dedup).
// Usage: node reply.mjs [--state-dir <dir>] <appId> <toWxid> <conversationId> <content>
//   conversationId: the incoming message's conversation_id (S:<wxid> or R:<roomid>)
// stdout: the send API JSON. exit 0 on code=0, 1 on business error, 2 on local error.
import path from 'node:path';
import { resolveCli, runCli, resolveStateDir, readJson, writeJson, sleep } from './common.mjs';

const args = process.argv.slice(2);
const dir = resolveStateDir(args);
const i = args.indexOf('--state-dir');
if (i >= 0) args.splice(i, 2);
const [appId, toWxid, conversationId, content] = args;
if (!appId || !toWxid || !conversationId || !content) {
  process.stderr.write('usage: node reply.mjs [--state-dir <dir>] <appId> <toWxid> <conversationId> <content>\n');
  process.exit(2);
}

const repliedPath = path.join(dir, 'replied.json');
const lastSendPath = path.join(dir, 'lastsend.json');

async function main() {
  const cli = resolveCli();
  const lastSend = readJson(lastSendPath, { ts: 0 });
  const wait = 3200 - (Date.now() - lastSend.ts);
  if (wait > 0) await sleep(wait);

  let res;
  try { res = runCli(cli, ['message', 'send-text', '--app-id', appId, '--to-wxid', toWxid, '--content', content]); }
  finally { writeJson(lastSendPath, { ts: Date.now() }); }

  if (res.code === 0) {
    const replied = readJson(repliedPath, {});
    const ct = res.data && res.data.createTime ? res.data.createTime : Math.floor(Date.now() / 1000);
    replied[appId + '|' + conversationId] = ct;
    writeJson(repliedPath, replied);
  }
  process.stdout.write(JSON.stringify(res));
  process.exit(res.code === 0 ? 0 : 1);
}

main().catch(e => { process.stderr.write('fatal ' + e.message + '\n'); process.exit(2); });