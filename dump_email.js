const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

const client = new ImapFlow({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT),
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

(async () => {
  await client.connect();
  let lock = await client.getMailboxLock('INBOX');
  try {
    const uid = 211; 
    console.log('--- DUMPING UID', uid, '---');
    for await (let message of client.fetch(uid, { source: true })) {
      let parsed = await simpleParser(message.source);
      console.log('Subject:', parsed.subject);
      console.log('Text Content:');
      console.log(parsed.text || 'No text content');
      console.log('HTML Content (Simplified):');
      const html = parsed.html || '';
      console.log(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').substring(0, 1000));
    }
  } finally {
    lock.release();
    await client.logout();
  }
})().catch(console.error);
