// Alternative: Create tables using direct REST API calls
// This uses the PostgREST API to create tables

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://encdegylezyqbitongjk.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVuY2RlZ3lsZXp5cWJpdG9uZ2prIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUxMzUzOSwiZXhwIjoyMDg3MDg5NTM5fQ.Au-3c8C-_q8EaFZjIil69muiVYokwHY_VLH3ZIRDrvM';

async function setupViaRest() {
  console.log('Attempting to setup database via REST API...\n');
  
  // Try to use the pgrest API to execute SQL
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'apikey': SERVICE_KEY,
    },
    body: JSON.stringify({
      query: 'CREATE TABLE IF NOT EXISTS test_table (id serial primary key)'
    })
  });
  
  const result = await response.text();
  console.log('Response:', result);
}

setupViaRest().catch(console.error);
