const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

const client = new ImapFlow({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT),
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  },
  logger: false
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
      const text = parsed.text || '(No text)';
      console.log(text.substring(0, 500));
      
      const content = text.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
      const sucursalMatch = content.match(/Sucursal:\s*([^;\|\r\n]+?)(?=\s+Ticket:|\s+Nombre:|$)/i);
      console.log('MATCHED SUCURSAL:', sucursalMatch ? sucursalMatch[1] : 'NOT FOUND');
    }
  } finally {
    lock.release();
    await client.logout();
  }
})().catch(console.error);
