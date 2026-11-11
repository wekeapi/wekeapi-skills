// Real-time WeChat message listener. Blocks until new reply-worthy messages arrive or timeout.
// Usage: node listen.mjs [--state-dir <dir>] [--timeout <ms>] [--interval <ms>] [--limit <n>]
//                       [--accounts <appId,appId>] [--group-mode none|at|all]
// stdout: {"timedOut":bool,"messages":[{account,isGroup,new_msg_id,from,to,room_id,conversation_id,content,create_time,timestamp}]}
import fs from 'node:fs';
import path from 'node:path';
import { resolveCli, runCli, loadAccounts, flagValue, resolveStateDir, readJson, writeJson, sleep, log } from './common.mjs';

const argv = process.argv.slice(2);
const dir = resolveStateDir(argv);
const timeoutMs = parseInt(flagValue(argv, '--timeout', '55000'), 10);
const intervalMs = parseInt(flagValue(argv, '--interval', '3000'), 10);
const limit = parseInt(flagValue(argv, '--limit', '50'), 10);
const groupMode = flagValue(argv, '--group-mode', 'at'); // none | at | all
const accountsFilter = flagValue(argv, '--accounts', '');

const statePath = path.join(dir, 'state.json');
const repliedPath = path.join(dir, 'replied.json');

const SYSTEM_EXACT = new Set(['weixin','newsapp','medianote','floatbottle','fmessage','qqmail','qmessage','tmessage','lbsapp','shakeapp','blogapp','masssendapp','feedsapp','voipapp','voicevoipapp','voiceinputapp','googlecontact','facebookapp','qqfriend','linkedinplugin','mphelper','filehelper','weixinreminder','weixinteam']);
const isSystemSender = from => SYSTEM_EXACT.has(from) || (from || '').startsWith('gh_');
const isGroup = m => !!m.room_id || (m.conversation_id || '').startsWith('R:') || (m.to || '').endsWith('@chatroom');

function qualifies(m, account, ownWxids) {
  if (m.revoked) return false;
  if (m.type !== 'text' && m.msg_type !== 1) return false; // text only
  const from = m.from || '';
  if (ownWxids.has(from)) return false;        // never reply to own accounts (bot-to-bot loop)
  if (isSystemSender(from)) return false;
  if (isGroup(m)) {
    if (groupMode === 'none') return false;
    if (groupMode === 'all') return true;
    const c = m.content || '';
    return [account.nickname, account.alias].filter(Boolean).some(n => c.includes('@' + n));
  }
  return true; // private chat
}

function fetchMessages(cli, account) {
  const res = runCli(cli, ['data', 'messages', '--app-id', account.appId, '--limit', String(limit)]);
  if (res.code !== 0) throw new Error('data messages code=' + res.code + ' ' + res.message);
  return res.data.messages || [];
}

async function main() {
  const cli = resolveCli();
  const allAccounts = loadAccounts(cli);
  const ownWxids = new Set(allAccounts.map(a => a.wxid)); // loop prevention across ALL logged-in accounts
  let accounts = allAccounts;
  if (accountsFilter) {
    const set = new Set(accountsFilter.split(','));
    accounts = allAccounts.filter(a => set.has(a.appId));
  }
  if (!accounts.length) { log('no accounts to listen'); process.stdout.write(JSON.stringify({ timedOut: true, messages: [], error: 'no accounts' })); return; }

  let seen = readJson(statePath, null);
  if (!seen || !Array.isArray(seen.seen)) {
    // First run: seed seen with current IDs so only NEW messages trigger replies.
    const s = new Set();
    let ok = 0;
    for (const acc of accounts) {
      try { for (const m of fetchMessages(cli, acc)) s.add(m.new_msg_id); ok++; }
      catch (e) { log('seed error', acc.nickname, e.message); }
    }
    if (ok === 0) {
      // Service unreachable: don't persist an empty seed, retry next run.
      log('seed failed (msg-sync unreachable); will retry. Run: wekeapi data start');
      process.stdout.write(JSON.stringify({ timedOut: true, messages: [], error: 'msg-sync unreachable' }));
      return;
    }
    seen = { seen: [...s] };
    writeJson(statePath, seen);
    log('seeded seen IDs:', s.size);
  }
  const seenSet = new Set(seen.seen);

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const replied = readJson(repliedPath, {});
    const found = [];
    for (const acc of accounts) {
      let msgs;
      try { msgs = fetchMessages(cli, acc); }
      catch (e) { log('poll error', acc.nickname, e.message); continue; }
      for (const m of msgs) {
        if (seenSet.has(m.new_msg_id)) continue;
        seenSet.add(m.new_msg_id);
        // Skip messages sent before our last reply in this conversation (sync-delay duplicates).
        const lastReply = replied[acc.appId + '|' + m.conversation_id];
        if (lastReply && m.create_time <= lastReply) continue;
        if (qualifies(m, acc, ownWxids)) {
          found.push({
            account: { appId: acc.appId, wxid: acc.wxid, nickname: acc.nickname },
            isGroup: isGroup(m),
            new_msg_id: m.new_msg_id,
            from: m.from, to: m.to,
            room_id: m.room_id || null,
            conversation_id: m.conversation_id,
            content: m.content,
            create_time: m.create_time,
            timestamp: m.timestamp
          });
        }
      }
    }
    writeJson(statePath, { seen: [...seenSet] });
    if (found.length) {
      found.sort((a, b) => a.create_time - b.create_time);
      process.stdout.write(JSON.stringify({ timedOut: false, messages: found }, null, 2));
      return;
    }
    await sleep(intervalMs);
  }
  process.stdout.write(JSON.stringify({ timedOut: true, messages: [] }, null, 2));
}

main().catch(e => { log('fatal', e.message); process.stdout.write(JSON.stringify({ timedOut: true, messages: [], error: e.message })); });