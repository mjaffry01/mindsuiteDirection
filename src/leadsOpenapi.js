'use strict';
// OpenAPI 3 description of the lead generation API, served at /api/leads/openapi.json.
function openapi(server) {
  const lead = {
    type: 'object',
    properties: {
      company: { type: 'string', description: 'Company name. Optional if a work email is given.' },
      name: { type: 'string', description: 'Contact person’s full name (or use contact)' },
      title: { type: 'string', example: 'Head of Engineering' },
      email: { type: 'string', format: 'email' },
      phone: { type: 'string', example: '+971 50 123 4567' },
      country: { type: 'string', description: 'Country name or ISO code; used to set the region', example: 'AE' },
      region: { type: 'string', enum: ['India', 'Gulf', 'US', 'Europe', 'Asia'] },
      source: { type: 'string', enum: ['Outbound', 'LinkedIn', 'Website', 'Webinar', 'Referral', 'Partner', 'Event', 'Clutch'] },
      interest: { type: 'string', enum: ['Product Engineering', 'Applied AI', 'Cloud & Platform', 'ERP', 'Cyber', 'Not sure'] },
      timeline: { type: 'string', enum: ['Within 3 months', '3–6 months', 'Later', 'Not sure'] },
      employees: { type: 'number' },
      message: { type: 'string' },
      notes: { type: 'string' },
      externalId: { type: 'string', description: 'The lead’s id in the sending system' },
      utm_source: { type: 'string' }, utm_medium: { type: 'string' }, utm_campaign: { type: 'string' },
    },
  };
  const key = [{ apiKey: [] }];
  return {
    openapi: '3.0.3',
    info: { title: 'MindSuite lead generation API', version: '1.0.0', description: 'Capture, import, score and route leads into the MindSuite sales and marketing toolkit.' },
    servers: [{ url: server }],
    components: { securitySchemes: { apiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' }, basic: { type: 'http', scheme: 'basic' } }, schemas: { Lead: lead } },
    paths: {
      '/api/public/leads': { post: { summary: 'Website contact form (no key; allowed websites only)', requestBody: { content: { 'application/json': { schema: { allOf: [{ $ref: '#/components/schemas/Lead' }, { type: 'object', required: ['email', 'consent'], properties: { consent: { type: 'boolean' }, website: { type: 'string', description: 'Hidden honeypot field; leave empty' }, _t: { type: 'number', description: 'Time the form was shown (ms)' } } }] } } } }, responses: { 201: { description: 'Received' }, 400: { description: 'Invalid' }, 403: { description: 'Website not allowed' }, 429: { description: 'Too many submissions' } } } },
      '/api/webhooks/leads': { post: { summary: 'Add one lead, or an array of up to 100, from another tool', security: key, requestBody: { content: { 'application/json': { schema: { oneOf: [{ $ref: '#/components/schemas/Lead' }, { type: 'array', items: { $ref: '#/components/schemas/Lead' } }] } } } }, responses: { 201: { description: 'Created' }, 200: { description: 'Matched an existing lead' }, 401: { description: 'Missing or wrong key' } } } },
      '/api/webhooks/meetings': { post: { summary: 'Mark a discovery meeting as booked (creates the lead if new)', security: key, requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['email'], properties: { email: { type: 'string' }, name: { type: 'string' }, company: { type: 'string' }, scheduledAt: { type: 'string', format: 'date-time' } } } } } }, responses: { 200: { description: 'Updated' }, 201: { description: 'Created' } } } },
      '/api/leads/import': { post: { summary: 'Import a CSV of leads (header row required)', security: [{ apiKey: [] }, { basic: [] }], parameters: [{ name: 'source', in: 'query', schema: { type: 'string' } }], requestBody: { content: { 'text/csv': { schema: { type: 'string' } } } }, responses: { 201: { description: 'Summary of created, duplicates and errors' } } } },
      '/api/leads/score': { post: { summary: 'Score a lead without saving it', security: [{ apiKey: [] }, { basic: [] }], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Lead' } } } }, responses: { 200: { description: 'Score, reasons and detected region' } } } },
      '/api/leads/export.csv': { get: { summary: 'Download all leads as CSV', security: [{ basic: [] }], responses: { 200: { description: 'CSV file' } } } },
      '/api/leads/stats': { get: { summary: 'Lead counts by source, region and score band', security: [{ basic: [] }], parameters: [{ name: 'days', in: 'query', schema: { type: 'integer', default: 30 } }], responses: { 200: { description: 'Counts' } } } },
    },
  };
}
module.exports = { openapi };
