import { NextResponse } from "next/server";

// This is a TEST endpoint — returns a script that tests CC API from the browser
// The browser's origin/cookies might bypass CloudFront WAF
export async function GET() {
  const html = `<!DOCTYPE html>
<html><head><title>CC Buy API Test</title></head>
<body style="background:#111;color:#fff;font-family:monospace;padding:20px">
<h2>CC Buy API Browser Test</h2>
<p>Testing if CloudFront WAF allows browser requests to CC API...</p>
<pre id="result">Running...</pre>
<script>
async function test() {
  const el = document.getElementById('result');
  
  // Test 1: Direct fetch to CC v2
  try {
    el.textContent = 'Test 1: POST to api.collectorcrypt.com/v2...\\n';
    const r1 = await fetch('https://api.collectorcrypt.com/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'sendQuickBuyTxV2',
        params: { currency: 'SOL', nftAddress: 'test123', price: 0 }
      })
    });
    el.textContent += 'Status: ' + r1.status + '\\n';
    const text = await r1.text();
    el.textContent += 'Response: ' + text.slice(0, 500) + '\\n\\n';
  } catch(e) {
    el.textContent += 'Error: ' + e.message + '\\n\\n';
  }
  
  // Test 2: v1 endpoint
  try {
    el.textContent += 'Test 2: POST to api.collectorcrypt.com/v1...\\n';
    const r2 = await fetch('https://api.collectorcrypt.com/v1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'test' })
    });
    el.textContent += 'Status: ' + r2.status + '\\n';
    const text2 = await r2.text();
    el.textContent += 'Response: ' + text2.slice(0, 500) + '\\n\\n';
  } catch(e) {
    el.textContent += 'Error: ' + e.message + '\\n\\n';
  }

  // Test 3: marketplace endpoint (known to work)
  try {
    el.textContent += 'Test 3: GET api.collectorcrypt.com/marketplace (control)...\\n';
    const r3 = await fetch('https://api.collectorcrypt.com/marketplace');
    el.textContent += 'Status: ' + r3.status + '\\n';
    el.textContent += 'Size: ' + (await r3.text()).length + ' chars\\n';
  } catch(e) {
    el.textContent += 'Error: ' + e.message + '\\n';
  }
}
test();
</script>
</body></html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html" },
  });
}
