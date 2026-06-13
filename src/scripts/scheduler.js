export default {
  async fetch(request, env, ctx) {
    const allowedOrigins = [
      'https://fullsite.the-hangout.pages.dev',
      'https://thehangout-restaurants.com',
      'http://localhost:5173',
      'https://dash.cloudflare.com'
    ];
    try {
      const origin = request.headers.get('Origin') || '';
      const fromLocalhost = origin.includes('localhost');
      const isAllowed = allowedOrigins.includes(origin);

      const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Methods': 'POST, OPTIONS, PREFLIGHT',
        'Access-Control-Allow-Headers': 'Content-Type',
        ...(isAllowed && { 'Access-Control-Allow-Origin': origin }),
      };

      const url = new URL(request.url);

      if (url.pathname !== "/api/reserve") {
        return new Response("Not found", { status: 404, headers });
      }

      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers,
        });
      }

      if (request.method !== 'POST') {
        return new Response('Not allowed', { status: 405, headers });
      }

      if (!isAllowed) {
        return new Response('Forbidden', { status: 403, headers });
      }

      const calendarId = env.GOOGLE_CALENDAR_ID;
      const calendarApiUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;

      const data = await request.json();

      const validated = validateReservation(data, fromLocalhost);

      if (!validated.valid) {
        return new Response(JSON.stringify(validated.errors), {
          status: 400,
          headers
        });
      }

      const {
        name,
        email,
        phone,
        datetime,
        seats,
        message,
        token
      } = data;

      if (!fromLocalhost) {
        const isValid = await verifyTurnstile(env.TURNSTILE_SECRET, token, request.headers.get('cf-connecting-ip') || null);

        if (!isValid) {
          return new Response('Bad Request', { status: 400, headers });
        }
      }

      const startTime = new Date(datetime);
      const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // add 1 hour

      // 1. Create JWT
      const iat = Math.floor(Date.now() / 1000);
      const exp = iat + 3600;

      const header = {
        alg: 'RS256',
        typ: 'JWT',
      };

      const payload = {
        iss: env.GOOGLE_CLIENT_EMAIL,
        sub: env.SENDER_EMAIL,
        scope: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/gmail.send',
        aud: 'https://oauth2.googleapis.com/token',
        iat,
        exp,
      };

      const encodedHeader = base64urlEncode(JSON.stringify(header));
      const encodedPayload = base64urlEncode(JSON.stringify(payload));
      const jwtBody = `${encodedHeader}.${encodedPayload}`;

      const privateKey = await importPrivateKey(env.GOOGLE_PRIVATE_KEY);
      const signature = await crypto.subtle.sign(
        { name: 'RSASSA-PKCS1-v1_5' },
        privateKey,
        new TextEncoder().encode(jwtBody)
      );

      const encodedSignature = base64urlEncodeBytes(new Uint8Array(signature));
      const jwt = `${jwtBody}.${encodedSignature}`;

      // 2. Exchange JWT for access token
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: jwt,
        }),
      });

      const tokenJson = await tokenRes.json();
      if (!tokenRes.ok) {
        return new Response(JSON.stringify(tokenJson), { status: 500, headers });
      }

      const accessToken = tokenJson.access_token;

      // 3. Create calendar event
      const event = {
        summary: `Booking for ${name}. ${seats} People`,
        description: `Name: ${name
          }\nEmail: ${email
          }\nPhone: ${phone
          }\nNumber of Seats: ${seats
          }\nSpecial Requests: ${message
          }`,
        start: {
          dateTime: startTime
        },
        end: {
          dateTime: endTime
        }
      };

      const calRes = await fetch(
        calendarApiUrl,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(event),
        }
      );

      const calJson = await calRes.json();
      if (!calRes.ok) {
        return new Response(JSON.stringify(calJson), { status: 500, headers });
      }

      // 4. Send email notifications in background (non-blocking)
      const formattedDateTime = startTime.toLocaleString('en-US', {
        dateStyle: 'full',
        timeStyle: 'short',
        timeZone: 'Europe/Amsterdam'
      });

      // Schedule emails to be sent in the background without blocking the response
      ctx.waitUntil(
        (async () => {
          try {
            // Send notification to restaurant
            await sendEmailNotification(accessToken, env.NOTIFICATION_EMAIL, {
              name,
              email,
              phone,
              datetime: formattedDateTime,
              seats,
              message,
              calendarLink: calJson.htmlLink
            });
          } catch (emailError) {
            console.error('Failed to send email notification:', emailError);
          }
        })()
      );

      ctx.waitUntil(
        (async () => {
          try {
            // Send confirmation to customer
            await sendCustomerConfirmation(accessToken, email, {
              name,
              datetime: formattedDateTime,
              seats,
              message
            });
          } catch (emailError) {
            console.error('Failed to send customer confirmation:', emailError);
          }
        })()
      );

      return new Response(JSON.stringify({ success: true }), { headers });
    } catch (e) {
      return new Response(e.message, { status: 500 });
    }
  }
};

// Helper: Import PEM private key to CryptoKey
async function importPrivateKey(pem) {
  const pemClean = cleanPemKey(pem);
  const binary = Uint8Array.from(atob(pemClean), c => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8',
    binary.buffer,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  );
}

// Helper: Base64url encode string (for JWT - ASCII only)
function base64urlEncode(str) {
  return btoa(str)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

// Helper: Base64url encode Uint8Array
function base64urlEncodeBytes(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

// Helper: Base64url encode string with UTF-8 support (for email MIME)
function base64urlEncodeUTF8(str) {
  const utf8Bytes = new TextEncoder().encode(str);
  let binary = '';
  utf8Bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function cleanPemKey(pem) {
  return pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/-----.*?-----/g, '')
    .replace(/\\n/g, '')
    .replace(/\n/g, '')
    .replace(/\r/g, '')
    .replace(/\s+/g, '');
}

function validateReservation(formData, fromLocalhost = false) {
  const errors = {};

  if (!formData.token && !fromLocalhost) {
    errors.name = 'Missing token';
  }

  // Name: required, min 2 characters
  if (!formData.name || formData.name.trim().length < 2) {
    errors.name = 'Name is required and must be at least 2 characters long.';
  }

  // Email: basic regex check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!formData.email || !emailRegex.test(formData.email)) {
    errors.email = 'A valid email is required.';
  }

  // Phone: optional + or numeric
  const phoneRegex = /^\+?\d{5,20}$/;
  if (!formData.phone || !phoneRegex.test(formData.phone)) {
    errors.phone = 'A valid phone number is required.';
  }

  // Datetime: valid ISO string or parseable date
  const date = new Date(formData.datetime);
  if (!formData.datetime || isNaN(date.getTime())) {
    errors.datetime = 'A valid date and time is required.';
  }

  // Seats: required, integer > 0
  const seats = parseInt(formData.seats, 10);
  if (!formData.seats || isNaN(seats) || seats < 1) {
    errors.seats = 'Seats must be a number greater than 0.';
  }

  // Message: optional, but must not exceed 1000 characters
  if (formData.message && formData.message.length > 1000) {
    errors.message = 'Message is too long (max 1000 characters).';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}

async function verifyTurnstile(secret, token, remoteip = null) {
  if (!token) return false;

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret,
        response: token,
        remoteip: remoteip || '',
      }),
    });

    const data = await response.json();
    return data.success === true;
  } catch (err) {
    // Optional: log error
    console.error('Turnstile validation error:', err);
    return false;
  }
}

async function sendEmailNotification(accessToken, recipientEmail, reservationData) {
  const { name, email, phone, datetime, seats, message, calendarLink } = reservationData;

  // Create email content
  const subject = `New Reservation: ${name} - ${seats} guests`;
  const textContent = `
New Reservation Received
========================

Customer Details:
- Name: ${name}
- Email: ${email}
- Phone: ${phone}
- Date & Time: ${datetime}
- Number of Guests: ${seats}
${message ? `- Special Requests: ${message}` : ''}

Calendar Event: ${calendarLink || 'Created successfully'}

---
This is an automated notification from The Hangout reservation system.
  `.trim();

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #2c3e50; color: white; padding: 20px; text-align: center; }
    .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
    .detail { margin: 10px 0; }
    .label { font-weight: bold; color: #2c3e50; }
    .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
    .button { display: inline-block; padding: 10px 20px; background-color: #3498db; color: white; text-decoration: none; border-radius: 5px; margin-top: 15px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>New Reservation Received</h1>
    </div>
    <div class="content">
      <h2>Customer Details:</h2>
      <div class="detail"><span class="label">Name:</span> ${name}</div>
      <div class="detail"><span class="label">Email:</span> ${email}</div>
      <div class="detail"><span class="label">Phone:</span> ${phone}</div>
      <div class="detail"><span class="label">Date & Time:</span> ${datetime}</div>
      <div class="detail"><span class="label">Number of Guests:</span> ${seats}</div>
      ${message ? `<div class="detail"><span class="label">Special Requests:</span> ${message}</div>` : ''}
      ${calendarLink ? `<a href="${calendarLink}" class="button">View in Google Calendar</a>` : ''}
    </div>
    <div class="footer">
      This is an automated notification from The Hangout reservation system.
    </div>
  </div>
</body>
</html>
  `.trim();

  // Create MIME message
  const boundary = 'boundary_' + Math.random().toString(36).substring(2);
  const mimeMessage = [
    `To: ${recipientEmail}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    '',
    textContent,
    '',
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    '',
    htmlContent,
    '',
    `--${boundary}--`,
  ].join('\r\n');

  // Encode message in base64url format
  const encodedMessage = base64urlEncodeUTF8(mimeMessage);

  // Send via Gmail API
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      raw: encodedMessage,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gmail API failed: ${errorText}`);
  }

  return response;
}

async function sendCustomerConfirmation(accessToken, recipientEmail, reservationData) {
  const { name, datetime, seats, message } = reservationData;

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #2c3e50; color: white; padding: 30px 20px; text-align: center; }
    .content { background-color: #ffffff; padding: 30px 20px; border: 1px solid #ddd; }
    .detail { margin: 15px 0; font-size: 16px; }
    .label { font-weight: bold; color: #2c3e50; }
    .highlight-box { background-color: #f0f7ff; padding: 20px; border-left: 4px solid #3498db; margin: 20px 0; }
    .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 13px; color: #666; text-align: center; }
    .success-icon { font-size: 48px; color: #27ae60; text-align: center; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Reservation Confirmed!</h1>
    </div>
    <div class="content">
      <div class="success-icon">✓</div>
      <p>Dear ${name},</p>
      <p>Thank you for choosing The Hangout! We're pleased to confirm your reservation.</p>
      
      <div class="highlight-box">
        <h3 style="margin-top: 0; color: #2c3e50;">Your Reservation Details:</h3>
        <div class="detail"><span class="label">Date & Time:</span> ${datetime}</div>
        <div class="detail"><span class="label">Number of Guests:</span> ${seats}</div>
        ${message ? `<div class="detail"><span class="label">Special Requests:</span> ${message}</div>` : ''}
      </div>
      
      <p>We look forward to welcoming you! If you need to make any changes to your reservation, please contact us as soon as possible.</p>
      
      <p>See you soon!</p>
      <p><strong>The Hangout Team</strong></p>
    </div>
    <div class="footer">
      <p>The Hangout Restaurant<br>
      Contact us: info@thehangout-restaurants.com - <a href="tel:+31152400136">+31.152400136</a></p>
    </div>
  </div>
</body>
</html>
  `.trim();

  const textContent = `
RESERVATION CONFIRMED

Dear ${name},

Thank you for choosing The Hangout! We're pleased to confirm your reservation.

YOUR RESERVATION DETAILS:
- Date & Time: ${datetime}
- Number of Guests: ${seats}
${message ? `- Special Requests: ${message}` : ''}

We look forward to welcoming you! If you need to make any changes to your reservation, please contact us as soon as possible.

See you soon!
The Hangout Team

---
The Hangout Restaurant
Contact us: info@thehangout-restaurants.com - +31.152400136
  `.trim();

  // Create MIME message
  const subject = `Reservation Confirmed - The Hangout`;
  const boundary = 'boundary_' + Math.random().toString(36).substring(2);
  const mimeMessage = [
    `To: ${recipientEmail}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    '',
    textContent,
    '',
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    '',
    htmlContent,
    '',
    `--${boundary}--`,
  ].join('\r\n');

  // Encode message in base64url format
  const encodedMessage = base64urlEncodeUTF8(mimeMessage);

  // Send via Gmail API
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      raw: encodedMessage,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gmail API failed: ${errorText}`);
  }

  return response;
}