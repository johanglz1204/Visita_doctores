const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const db = require('./db');
const { cleanForDisplay, normalize } = require('./utils/stringUtils');

async function syncEmails() {
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

  // Handle connection errors to prevent unhandled promise rejections / Node crashes
  client.on('error', err => {
    console.error('[IMAP ERROR]', err);
  });


  await client.connect();
  let lock = await client.getMailboxLock('INBOX');
  
  try {
    // Buscar correos de los últimos 5 días (sin importar si ya fueron leídos en el celular)
    // El sistema evitará descargar duplicados automáticamente por el número de Ticket
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    
    let uids = await client.search({ since: fiveDaysAgo });
    
    if (uids.length === 0) {
      console.log('No recent emails found in the last 5 days');
      return;
    }

    console.log(`[EMAIL SYNC] Found ${uids.length} unread emails. Starting batch processing...`);

    // Batch size 5 to keep connection alive and avoid timeouts
    const batchSize = 5;
    for (let i = 0; i < uids.length; i += batchSize) {
      const currentBatch = uids.slice(i, i + batchSize);
      
      try {
        // 1. Download all messages in the batch completely to memory
        // This prevents IMAP connection timeouts caused by slow database processing holding up the stream
        const messagesToProcess = [];
        for await (let message of client.fetch(currentBatch, { source: true })) {
          messagesToProcess.push({
            uid: message.uid,
            source: Buffer.from(message.source) // Copy the buffer
          });
        }
        
        console.log(`[EMAIL SYNC] Downloaded batch of ${messagesToProcess.length} emails. Processing now...`);

        // 2. Process them without holding up the IMAP fetch stream
        for (let msg of messagesToProcess) {
          try {
            let parsed = await simpleParser(msg.source);
            let rawContent = parsed.text || '';
            if (!rawContent && parsed.html) {
              rawContent = parsed.html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ');
            }

            // Clean up weird spaces and HTML entities
            const content = rawContent.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

          // Try to find Sucursal for the whole email
          const sucursalMatch = content.match(/Sucursal:\s*([^;\|\r\n]+?)(?=\s+Ticket:|\s+Nombre:|$)/i);
          const emailSucursal = sucursalMatch ? sucursalMatch[1].trim().toUpperCase() : '';

          // SICOFA splits: Usually "Sucursal:", "Ticket:" or "Nombre:" starts a new record
          // We'll look for all occurrences of "Nombre:" which is the mandatory part of a sale
          const salesMatch = content.matchAll(/Ticket:\s*(\d+).*?Nombre:\s*([^;\|\r\n]+?)\s*Piezas:\s*(\d+)\s*Doctor:\s*([^;\|\r\n]+?)\s*Fecha:\s*([\d\-\:\s]{10,20})/gi);
          
          let count = 0;
          let matchedPrimary = false;

          for (const match of salesMatch) {
            matchedPrimary = true;
            const ticket = match[1];
            const productName = match[2].trim().toUpperCase();
            const quantity = parseInt(match[3], 10);
            const doctorName = match[4].trim().toUpperCase();
            const saleDate = new Date(match[5].trim());

            if (doctorName && productName) {
              // 1. Find/Create Doctor
              let doctorId;
              const { rows: docRows } = await db.query('SELECT id FROM doctors WHERE UPPER(name) = $1', [doctorName]);
              if (docRows.length > 0) {
                doctorId = docRows[0].id;
              } else {
                const { rows: newDoc } = await db.query('INSERT INTO doctors (name) VALUES ($1) RETURNING id', [doctorName]);
                doctorId = newDoc[0].id;
              }

              // 2. Find/Match Product (Cleaned)
              let productId;
              const cleanedProdMatch = cleanForDisplay(productName);
              const { rows: prodRows } = await db.query(
                'SELECT id FROM products WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) OR LOWER(TRIM(name)) = LOWER(TRIM($2)) LIMIT 1', 
                [cleanedProdMatch, productName]
              );
              
              if (prodRows.length > 0) {
                productId = prodRows[0].id;
              } else {
                console.warn(`[SYNC WARNING] Producto no encontrado en catálogo oficial: "${productName}". Saltando venta para evitar duplicados.`);
                continue; // Saltar esta venta, el producto debe ser dado de alta vía Excel o MySQL Sync
              }

              // 3. Record Sale (Prevent duplicates by Ticket ID in raw_text)
              const rawTextStr = `Email UID ${msg.uid} | Ticket ${ticket}`;
              const { rows: existingSale } = await db.query(
                `SELECT id FROM sales_history WHERE doctor_id = $1 AND product_id = $2 AND raw_text = $3`,
                [doctorId, productId, rawTextStr]
              );

              if (existingSale.length === 0) {
                await db.query(
                  `INSERT INTO sales_history (doctor_id, product_id, quantity, sale_date, sucursal, raw_text)
                   VALUES ($1, $2, $3, $4, $5, $6)`,
                  [doctorId, productId, quantity, saleDate, emailSucursal, rawTextStr]
                );

                // 4. Update Inventory
                await db.query(
                  `UPDATE inventory_stocks 
                   SET current_stock = GREATEST(current_stock - $1, 0), updated_at = NOW()
                   WHERE doctor_id = $2 AND product_id = $3`,
                  [quantity, doctorId, productId]
                );
                count++;
              } else {
                console.log(`   [SYNC SKIP] Duplicate sale prevented for Ticket ${ticket}`);
              }
            }
          }

          // Fallback: If no matches found with the big regex, try the line-by-line approach for single-sale emails
          if (!matchedPrimary && count === 0) {
             const prodMatch = content.match(/Nombre:\s*([^;\|\r\n]+?)(?=\s+Piezas:|$)/i);
             const qMatch = content.match(/Piezas:\s*(\d+)/i);
             const docMatch = content.match(/Doctor:\s*([^;\|\r\n]+?)(?=\s+Fecha:|$)/i);
             const dMatch = content.match(/Fecha:\s*([\d\-\:\s]{10,20})/i);

             if (prodMatch && qMatch && docMatch) {
                const productName = prodMatch[1].trim().toUpperCase();
                const quantity = parseInt(qMatch[1], 10);
                const doctorName = docMatch[1].trim().toUpperCase();
                const saleDate = dMatch ? new Date(dMatch[1]) : (parsed.date || new Date());

                // Same DB logic as above (Find/Create + Insert) - simplified for fallback
                const { rows: docR } = await db.query('SELECT id FROM doctors WHERE UPPER(name) = $1', [doctorName]);
                const docId = docR.length > 0 ? docR[0].id : (await db.query('INSERT INTO doctors (name) VALUES ($1) RETURNING id', [doctorName])).rows[0].id;
                
                // 2. Find/Match Product (Fallback)
                const cleanedProdFb = cleanForDisplay(productName);
                const { rows: prodR } = await db.query(
                  'SELECT id FROM products WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) OR LOWER(TRIM(name)) = LOWER(TRIM($2)) LIMIT 1', 
                  [cleanedProdFb, productName]
                );
                
                if (prodR.length > 0) {
                  const prodId = prodR[0].id;

                  const rawTextFallback = `Email UID ${msg.uid} (Fallback)`;
                  const { rows: existingFbSale } = await db.query(
                    `SELECT id FROM sales_history WHERE doctor_id = $1 AND product_id = $2 AND raw_text = $3`,
                    [docId, prodId, rawTextFallback]
                  );

                  if (existingFbSale.length === 0) {
                    await db.query(`INSERT INTO sales_history (doctor_id, product_id, quantity, sale_date, sucursal, raw_text) VALUES ($1, $2, $3, $4, $5, $6)`,
                      [docId, prodId, quantity, saleDate, emailSucursal, rawTextFallback]);
                    
                    await db.query(`UPDATE inventory_stocks SET current_stock = GREATEST(current_stock - $1, 0), updated_at = NOW() WHERE doctor_id = $2 AND product_id = $3`,
                      [quantity, docId, prodId]);
                    
                    count++;
                  } else {
                    console.log(`   [SYNC SKIP] Duplicate fallback sale prevented for UID ${msg.uid}`);
                  }
                } else {
                  console.warn(`   [SYNC SKIP] Producto fallback no encontrado: "${productName}"`);
                }
             }
          }

          console.log(`[SYNC] Email UID ${msg.uid}: Processed ${count} sales.`);
          await client.messageFlagsAdd(msg.uid, ['\\Seen']);
        } catch (msgErr) {
          console.error(`[SYNC ERROR] Email UID ${msg.uid}:`, msgErr);
        }
      }
    } catch(batchErr) {
      console.error('[SYNC ERROR] Fatal batch error:', batchErr.message);
    }
  }
  console.log('✅ [EMAIL SYNC] Sincronización finalizada correctamente.');
  } catch (err) {
    console.error('❌ [EMAIL SYNC] Error crítico en la conexión IMAP:', err.message);
  } finally {
    if (lock) lock.release();
  }

  await client.logout();
}

module.exports = { syncEmails };

