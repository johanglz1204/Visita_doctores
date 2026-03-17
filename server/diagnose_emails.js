const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
require('dotenv').config({ path: '../.env' });

async function diagnose() {
  const client = new ImapFlow({
    host: process.env.EMAIL_HOST || 'imap.gmail.com',
    port: parseInt(process.env.EMAIL_PORT) || 993,
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    },
    logger: false
  });

  await client.connect();
  let lock = await client.getMailboxLock('INBOX');
  
  try {
    const uid = 111; // We know this one failed
    console.log('--- DUMPING UID', uid, '---');
    for await (let message of client.fetch(uid, { source: true })) {
      let parsed = await simpleParser(message.source);
      console.log('Subject:', parsed.subject);
      console.log('HTML CONTENT:');
      console.log(parsed.html);
    }
  } finally {
    lock.release();
  }
  await client.logout();
}

diagnose().catch(console.error);
