#!/usr/bin/env node
/**
 * Test variant picker against all One Piece cards.
 * Simulates PriceHistory.tsx logic and checks results.
 */

const ORACLE = 'https://artifacte-oracle-production.up.railway.app';

// --- Copy of buildSearchQuery logic ---
function buildSearchQuery(name) {
  const CHART_OVERRIDES = {
    '2022 #001 Monkey D. Luffy PSA 10 One Piece Promos': 'one piece luffy P-001 super prerelease winner',
  '2024 #019 Divine Departure PSA 10 One Piece Japanese OP10-Royal Blood': 'OP10019 divine depature Japanese',
  '2023 #092 Rob Lucci PSA 10 One Piece Japanese OP05-Awakening of the New Era Pokemon': 'OP05092 rob lucci japanese special alternate art',
  };
  if (CHART_OVERRIDES[name]) return CHART_OVERRIDES[name];

  const opMatch = name.match(/#?((?:OP|ST|EB|PRB?)\d+-\d+)/i) || name.match(/#?((?:OP|ST|EB|PRB?)\d{5,})/i);
  if (opMatch) {
    let cardNum = opMatch[1];
    if (!cardNum.includes('-')) {
      const m = cardNum.match(/^([A-Z]+\d{2})(\d+)$/i);
      if (m) cardNum = `${m[1]}-${m[2]}`;
    }
    const variant = name.match(/\b(manga|alt(?:ernate)?\s*art|super\s*pre.?release|winner|sp|sec)\b/i);
    return variant ? `${cardNum} ${variant[0]}` : cardNum;
  }

  const hashMatch = name.match(/#(\d+(?:\/[\w-]+)?)/);
  if (hashMatch) {
    const setPrefix = name.match(/\b(OP|ST|EB|PRB?)\d{2}/i);
    if (setPrefix) {
      const cardNum = `${setPrefix[0]}-${hashMatch[1]}`;
      const variant = name.match(/\b(manga|alt(?:ernate)?\s*art|wanted|super\s*pre.?release|winner|sp|sec|3rd\s*anniversary|gold|serialized|tournament)\b/i);
      const charWords = name
        .replace(/\b\d{4}\b/g, '').replace(/#\d+/g, '')
        .replace(/\b(PSA|CGC|BGS|SGC)\s*\d+\.?\d*/gi, '')
        .replace(/\b(GEM[- ]?MT|MINT|PRISTINE|English|EN)\b/gi, '')
        .replace(/\b(Pokemon|One Piece|Yu-Gi-Oh|Magic|Dragon Ball)\b/gi, '')
        .replace(/\b(OP|ST|EB)\d+[-\w]*/gi, '')
        .replace(/[\/|,-]/g, ' ')
        .trim().split(/\s+/).filter(w => w.length > 2 && /^[A-Z]/.test(w)).slice(0, 3);
      const parts = [cardNum, ...charWords];
      if (variant) parts.push(variant[0]);
      return parts.join(' ');
    }
    // fallback with card context
    const parts = [];
    const cleanName = name
      .replace(/[\/|]/g, ' ').replace(/\b\d{4}\b/g, '').replace(/#\d+/g, '')
      .replace(/\b(PSA|CGC|BGS|SGC)\s*\d+\.?\d*/gi, '')
      .replace(/\b(GEM[- ]?MT|MINT|PRISTINE)\b/gi, '')
      .replace(/\b(English|EN)\b/gi, '')
      .replace(/\b(Pokemon|One Piece|Yu-Gi-Oh|Magic|Dragon Ball)\b/gi, '')
      .replace(/\b(Promos?|Promo|FULL ART|SPECIAL BOX)\b/gi, '')
      .replace(/-HOLO\b/gi, '').replace(/-/g, ' ').trim();
    const words = cleanName.split(/\s+/).filter(w => w.length > 2 && /^[A-Z]/.test(w));
    if (words.length > 0) parts.push(...words.slice(0, 6));
    parts.push(hashMatch[1]);
    if (/one piece/i.test(name)) parts.push('one piece');
    return parts.join(' ');
  }

  let q = name
    .replace(/\b(PSA|CGC|BGS|SGC)\s*\d+\.?\d*/gi, '')
    .replace(/\b(GEM[- ]?MT|MINT|PRISTINE|NEAR MINT)\b/gi, '')
    .replace(/\b\d{4}\b/g, '')
    .replace(/\b(Pokemon|One Piece|Yu-Gi-Oh|Magic|Dragon Ball|Vibes|TCG)\b/gi, '')
    .replace(/\b(English|EN)\b/gi, '')
    .replace(/\b(1st Edition|Unlimited|Shadowless|Holo|Reverse)\b/gi, '')
    .replace(/\s+/g, ' ').trim();
  const words = q.split(' ').filter(w => w.length > 2);
  if (words.length > 5) q = words.slice(0, 5).join(' ');
  return q || name.slice(0, 50);
}

// --- Variant picker logic ---
function normalizeGrade(g) {
  if (!g) return undefined;
  let n = g.trim()
    .replace(/^Beckett\s*/i, 'BGS ')
    .replace(/^Professional Sports Authenticator\s*/i, 'PSA ')
    .replace(/^Certified Guaranty Company\s*/i, 'CGC ');
  n = n.replace(/^(PSA|BGS|CGC|SGC)\s+/i, (_, co) => `${co.toUpperCase()}-`);
  return n;
}

function pickVariant(variants, cardName, grade) {
  if (!variants || variants.length === 0) return null;
  let chosen = variants[0];
  
  const cardNumMatch = cardName.match(/#(\w+)/);
  if (cardNumMatch && variants.length > 1) {
    const targetNum = cardNumMatch[1];
    const matchesNum = (cn) => cn === targetNum || cn.endsWith(`-${targetNum}`) || cn.endsWith(targetNum);
    
    const exactMatch = variants.find(v => matchesNum(String(v.cardNumber)));
    if (exactMatch) {
      const sameNumVariants = variants.filter(v => matchesNum(String(v.cardNumber)));
      if (sameNumVariants.length > 1) {
        const isCardJapanese = /JAPANESE|JPN|\bJP\b/i.test(cardName);
        
        // Language filter
        let langFiltered = sameNumVariants;
        if (isCardJapanese) {
          const jpOnly = sameNumVariants.filter(v => /JAPANESE/i.test(v.name || '') || /JAPANESE/i.test(v.brand || ''));
          if (jpOnly.length > 0) langFiltered = jpOnly;
        } else {
          const enOnly = sameNumVariants.filter(v => !/JAPANESE|CHINESE/i.test(v.name || '') && !/JAPANESE|CHINESE/i.test(v.brand || ''));
          if (enOnly.length > 0) langFiltered = enOnly;
        }
        
        // Pick variant with most sales for requested grade
        const gradePrefix = grade ? grade.split('-')[0]?.toUpperCase() : '';
        const gradeNum = grade ? grade.split('-')[1] : '';
        if (gradePrefix && gradeNum && langFiltered.length > 1) {
          let bestVariant = langFiltered[0];
          let bestCount = 0;
          for (const v of langFiltered) {
            const sales = (v.grades || []).filter(g => 
              g.grader?.toUpperCase() === gradePrefix && String(g.grade) === gradeNum
            ).length;
            if (sales > bestCount) { bestCount = sales; bestVariant = v; }
          }
          chosen = bestVariant;
        } else {
          chosen = langFiltered[0];
        }
      } else {
        chosen = exactMatch;
      }
    }
  }
  return chosen;
}

async function testCard(card) {
  const name = card.name;
  const rawGrade = card.gradingCompany && card.gradeNum 
    ? `${card.gradingCompany} ${card.gradeNum}` : undefined;
  const grade = normalizeGrade(rawGrade);
  const isJP = /japanese|jpn|\bjp\b/i.test(name);
  
  const searchQuery = buildSearchQuery(name);
  
  const res = await fetch(`${ORACLE}/api/live/search?q=${encodeURIComponent(searchQuery)}`);
  const data = await res.json();
  const variants = data.variants || [];
  
  if (variants.length === 0) {
    return { name, lang: isJP ? 'JP' : 'EN', grade, query: searchQuery, result: '❌ NO VARIANTS', chosen: null };
  }
  
  const chosen = pickVariant(variants, name, grade);
  
  // Check if chosen has sales for requested grade
  const gradePrefix = grade ? grade.split('-')[0] : '';
  const gradeNum = grade ? grade.split('-')[1] : '';
  const salesForGrade = (chosen?.grades || []).filter(g => 
    g.grader?.toUpperCase() === gradePrefix && String(g.grade) === gradeNum
  ).length;
  
  const chosenIsJP = /japanese/i.test(chosen?.name || '') || /japanese/i.test(chosen?.brand || '');
  const langMatch = isJP === chosenIsJP || (!isJP && !chosenIsJP);
  
  // Test chart endpoint
  const chartParams = new URLSearchParams({ q: searchQuery, grade: grade || '' });
  if (chosen?.assetId) chartParams.set('assetId', chosen.assetId);
  let chartRes = await fetch(`${ORACLE}/api/live/chart?${chartParams}`);
  let chartOk = chartRes.status === 200;
  
  // Fallback: retry without grade if grade-specific chart fails
  let usedFallback = false;
  if (!chartOk && grade) {
    const fallbackParams = new URLSearchParams({ q: searchQuery });
    if (chosen?.assetId) fallbackParams.set('assetId', chosen.assetId);
    chartRes = await fetch(`${ORACLE}/api/live/chart?${fallbackParams}`);
    chartOk = chartRes.status === 200;
    usedFallback = chartOk;
  }
  
  const status = !langMatch ? '❌ WRONG LANG' 
    : !chartOk ? '❌ CHART FAIL'
    : usedFallback ? '✅ OK (all grades)'
    : '✅ OK';
  
  return {
    name: name.slice(0, 70),
    lang: isJP ? 'JP' : 'EN',
    grade,
    query: searchQuery,
    result: status,
    chosenName: chosen?.name?.slice(0, 60),
    chosenLang: chosenIsJP ? 'JP' : 'EN',
    sales: salesForGrade,
    chartOk,
    totalVariants: variants.length,
  };
}

async function main() {
  // Fetch all One Piece listings
  const res = await fetch(`${ORACLE}/api/listings?q=piece&limit=100`);
  const data = await res.json();
  const cards = data.listings.filter(l => l.ccCategory === 'One Piece' && l.gradingCompany);
  
  console.log(`Testing ${cards.length} One Piece cards...\n`);
  
  for (const card of cards) {
    const r = await testCard(card);
    console.log(`${r.result} | ${r.lang} ${r.grade} | ${r.name}`);
    if (r.result !== '✅ OK') {
      console.log(`  Query: ${r.query}`);
      console.log(`  Chosen: [${r.chosenLang}] ${r.chosenName} (${r.sales} sales, ${r.totalVariants} variants)`);
      console.log(`  Chart: ${r.chartOk ? 'OK' : 'FAIL'}`);
    }
    console.log('');
  }
}

main().catch(console.error);
