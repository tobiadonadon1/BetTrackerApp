const puppeteer = require('puppeteer');

(async () => {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  const consoleMessages = [];
  const errors = [];
  
  page.on('console', msg => {
    const text = msg.text();
    const type = msg.type();
    consoleMessages.push({ type, text });
    console.log(`[${type.toUpperCase()}]`, text);
  });
  
  page.on('pageerror', error => {
    errors.push(error.message);
    console.log('[PAGE ERROR]', error.message);
  });
  
  page.on('error', error => {
    errors.push(error.message);
    console.log('[ERROR]', error.message);
  });
  
  console.log('Navigating to http://localhost:8082...');
  
  try {
    await page.goto('http://localhost:8082', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    console.log('\n=== Page loaded ===');
    
    // Wait a bit more for any async errors
    await page.waitForTimeout(3000);
    
    console.log('\n=== Summary ===');
    console.log(`Total console messages: ${consoleMessages.length}`);
    console.log(`Total errors: ${errors.length}`);
    
    if (errors.length > 0) {
      console.log('\n=== ERRORS FOUND ===');
      errors.forEach((err, i) => console.log(`${i + 1}. ${err}`));
    }
    
  } catch (err) {
    console.error('Navigation error:', err.message);
  }
  
  await browser.close();
})();
