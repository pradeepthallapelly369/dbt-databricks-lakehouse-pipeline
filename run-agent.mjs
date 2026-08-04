#!/usr/bin/env node

/**
 * run-agent.mjs — Automated job scan, evaluation, and notification agent.
 *
 * Integrates the career-ops scanner and evaluation pipeline with the
 * legacy QlikHunter notification system (Email and Telegram).
 *
 * Options:
 *   --dry-run      Run scanner and python scouts, simulate evaluations, but do not save reports or send alerts.
 *   --no-scan      Skip running the scanner/scouts, only evaluate already pending jobs in pipeline.md.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import yaml from 'js-yaml';
import { chromium } from 'playwright';

// Load env vars
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.meta?.[0] || import.meta.url));

// CLI options
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const noScan = args.includes('--no-scan');

console.log(`==================================================`);
console.log(`🚀 Starting Automated Job Search & Eval Agent`);
console.log(`   Dry Run: ${dryRun ? 'YES' : 'NO'} | Scan: ${noScan ? 'NO' : 'YES'}`);
console.log(`==================================================\n`);

// Load filters from portals.yml
function loadFilters() {
  if (!fs.existsSync('portals.yml')) {
    console.error('❌ portals.yml not found. Cannot load filters.');
    process.exit(1);
  }
  const portalsContent = fs.readFileSync('portals.yml', 'utf-8');
  const portals = yaml.load(portalsContent);
  
  const titleFilter = portals.title_filter || {};
  const posKeywords = (titleFilter.positive || []).map(k => k.toLowerCase());
  const negKeywords = (titleFilter.negative || []).map(k => k.toLowerCase());
  
  const titleMatches = (title) => {
    if (!title) return false;
    const t = title.toLowerCase();
    const hasPos = posKeywords.some(k => t.includes(k));
    const hasNeg = negKeywords.some(k => t.includes(k));
    return hasPos && !hasNeg;
  };
  
  const locFilter = portals.location_filter || {};
  const allowLocs = (locFilter.allow || []).map(k => k.toLowerCase());
  const blockLocs = (locFilter.block || []).map(k => k.toLowerCase());
  
  const locationMatches = (location) => {
    if (!location) return true; // pass empty location
    const l = location.toLowerCase();
    if (blockLocs.some(k => l.includes(k))) return false;
    if (allowLocs.length === 0) return true;
    return allowLocs.some(k => l.includes(k));
  };
  
  return { titleMatches, locationMatches };
}

// Load seen URLs for dedup
function loadSeenUrls() {
  const seen = new Set();
  
  // 1. scan-history.tsv
  const historyPath = 'data/scan-history.tsv';
  if (fs.existsSync(historyPath)) {
    const lines = fs.readFileSync(historyPath, 'utf-8').split('\n');
    for (const line of lines.slice(1)) {
      const parts = line.split('\t');
      if (parts[0]) seen.add(parts[0].trim());
    }
  }
  
  // 2. pipeline.md
  const pipelinePath = 'data/pipeline.md';
  if (fs.existsSync(pipelinePath)) {
    const lines = fs.readFileSync(pipelinePath, 'utf-8').split('\n');
    for (const line of lines) {
      const match = line.match(/^- \[[ x!]\] (https?:\/\/\S+)/i);
      if (match) seen.add(match[1].trim());
    }
  }
  
  // 3. applications.md
  const appsPath = 'data/applications.md';
  if (fs.existsSync(appsPath)) {
    const text = fs.readFileSync(appsPath, 'utf-8');
    for (const match of text.matchAll(/https?:\/\/[^\s|)]+/g)) {
      seen.add(match[0].trim());
    }
  }
  
  return seen;
}

// Append new offers to pipeline.md and scan-history.tsv
function addNewOffers(offers) {
  if (offers.length === 0) return 0;
  
  const pipelinePath = 'data/pipeline.md';
  const historyPath = 'data/scan-history.tsv';
  const today = new Date().toISOString().split('T')[0];
  
  let pipelineContent = '';
  if (fs.existsSync(pipelinePath)) {
    pipelineContent = fs.readFileSync(pipelinePath, 'utf-8');
  } else {
    pipelineContent = '# Pipeline\n\n## Pending\n';
  }
  
  let historyContent = '';
  if (fs.existsSync(historyPath)) {
    historyContent = fs.readFileSync(historyPath, 'utf-8');
  } else {
    historyContent = 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\tlocation\n';
  }
  
  let addedCount = 0;
  for (const offer of offers) {
    if (pipelineContent.includes(offer.url)) {
      continue;
    }
    
    // Add to Pending
    const pendingLine = `- [ ] ${offer.url} | ${offer.company} | ${offer.title} | ${offer.location || 'Remote'}`;
    pipelineContent = pipelineContent.replace(/(## Pending\s*?\n)/i, `$1${pendingLine}\n`);
    
    // Add to history
    historyContent += `${offer.url}\t${today}\t${offer.source || 'Scout'}\t${offer.title}\t${offer.company}\tadded\t${offer.location || ''}\n`;
    addedCount++;
  }
  
  if (!dryRun && addedCount > 0) {
    fs.mkdirSync('data', { recursive: true });
    fs.writeFileSync(pipelinePath, pipelineContent, 'utf-8');
    fs.writeFileSync(historyPath, historyContent, 'utf-8');
  }
  
  return addedCount;
}

// Read pending pipeline jobs
function readPendingPipeline() {
  const pipelinePath = 'data/pipeline.md';
  if (!fs.existsSync(pipelinePath)) return [];
  
  const content = fs.readFileSync(pipelinePath, 'utf-8');
  const lines = content.split('\n');
  const pending = [];
  
  let inPendingSection = false;
  for (const line of lines) {
    if (/^##\s+(Pendientes|Pending)/i.test(line)) {
      inPendingSection = true;
      continue;
    }
    if (/^##\s+/i.test(line) && inPendingSection) {
      inPendingSection = false;
    }
    if (inPendingSection) {
      const match = line.match(/^- \[\s\] (.+)/);
      if (match) {
        const parts = match[1].split(' | ');
        pending.push({
          url: parts[0]?.trim() || '',
          company: parts[1]?.trim() || 'Unknown',
          role: parts[2]?.trim() || 'Unknown',
          location: parts[3]?.trim() || 'Remote',
          rawLine: line
        });
      }
    }
  }
  return pending;
}

// Mark pending job as processed
function markPipelineProcessed(item, num, score) {
  const pipelinePath = 'data/pipeline.md';
  if (!fs.existsSync(pipelinePath)) return;
  
  let content = fs.readFileSync(pipelinePath, 'utf-8');
  const lines = content.split(/\r?\n/);
  const outLines = [];
  let inPending = false;
  let lineRemoved = false;
  
  const today = new Date().toISOString().split('T')[0];
  const companySlug = item.company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const reportLink = `[${num}](reports/${num}-${companySlug}-${today}.md)`;
  const processedLine = `- [x] ${reportLink} | ${item.url} | ${item.company} | ${item.role} | ${score}/5 | PDF ❌`;
  
  let pendStart = -1, procStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+(Pendientes|Pending)/i.test(lines[i])) pendStart = i;
    else if (/^##\s+(Procesadas|Processed)/i.test(lines[i])) procStart = i;
  }
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (i === pendStart) {
      inPending = true;
      outLines.push(line);
      continue;
    }
    if (inPending && /^##\s+/i.test(line)) {
      inPending = false;
    }
    
    if (inPending && line.includes(item.url)) {
      lineRemoved = true;
      continue; // remove from Pending
    }
    
    outLines.push(line);
    
    if (i === procStart && lineRemoved) {
      outLines.push(processedLine);
    }
  }
  
  if (procStart < 0 && lineRemoved) {
    outLines.push('');
    outLines.push('## Processed');
    outLines.push('');
    outLines.push(processedLine);
  }
  
  fs.writeFileSync(pipelinePath, outLines.join('\n'), 'utf-8');
}

// Fetch JD content via Playwright
async function fetchJobDescription(url) {
  console.log(`🌐 Fetching job page: ${url}`);
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000); // allow hydration
    
    const text = await page.evaluate(() => {
      // Remove header, footer, script, style
      document.querySelectorAll('script,style,nav,footer,header,noscript').forEach(el => el.remove());
      return (document.body?.innerText || document.body?.textContent || '').replace(/\s+/g, ' ').trim();
    });
    
    await browser.close();
    return text.slice(0, 16000);
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    throw new Error(`Failed to fetch job page: ${err.message}`);
  }
}

// Build Groq/OpenAI System Prompt
function buildSystemPrompt() {
  const shared = fs.readFileSync('modes/_shared.md', 'utf-8');
  const profileMode = fs.existsSync('modes/_profile.md') ? fs.readFileSync('modes/_profile.md', 'utf-8') : '';
  const oferta = fs.readFileSync('modes/oferta.md', 'utf-8');
  const profileYml = fs.readFileSync('config/profile.yml', 'utf-8');
  const cv = fs.readFileSync('cv.md', 'utf-8');
  
  return [
    shared,
    profileMode,
    oferta,
    '---',
    'CANDIDATE PROFILE (YAML):',
    profileYml,
    '---',
    'CV (Markdown):',
    cv,
    '---',
    'IMPORTANT OPERATING RULES FOR THIS SESSION:',
    '1. You do NOT have access to WebSearch, Playwright, or file writing tools.',
    '2. Generate Blocks A through G in full.',
    '3. At the very end, output this exact machine-readable block:',
    '',
    '---SCORE_SUMMARY---',
    'COMPANY: <company name or "Unknown">',
    'ROLE: <role title>',
    'SCORE: <global score as decimal, e.g. 3.8>',
    'ARCHETYPE: <detected archetype>',
    'LEGITIMACY: <High Confidence | Proceed with Caution | Suspicious>',
    'REASON: <1-2 sentence concise explanation of why it is a match/fit>',
    '---END_SUMMARY---'
  ].filter(Boolean).join('\n\n');
}

// Get next report number
function nextReportNumber() {
  const reportsDir = 'reports';
  if (!fs.existsSync(reportsDir)) return '001';
  const files = fs.readdirSync(reportsDir)
    .map(f => { const m = f.match(/^(\d+)/); return m ? parseInt(m[1], 10) : NaN; })
    .filter(n => !isNaN(n));
  if (files.length === 0) return '001';
  return String(Math.max(...files) + 1).padStart(3, '0');
}

async function run() {
  // Step 1: Scan for new jobs
  if (!noScan) {
    console.log('🔍 Running portal scanners...');
    
    // 1. Run career-ops zero-token scan
    try {
      console.log('   Running career-ops scanner...');
      execSync('node scan.mjs --verify', { stdio: 'inherit' });
    } catch (err) {
      console.warn('⚠️ career-ops scanner returned non-zero code or failed:', err.message);
    }
    
    // 2. Run Python scouts
    console.log('   Running QlikHunter scouts...');
    try {
      const scoutsStdout = execSync('venv/bin/python3 -c "import sys, json; real_stdout = sys.stdout; sys.stdout = sys.stderr; from scouts import gather_all_jobs; jobs = gather_all_jobs(); sys.stdout = real_stdout; print(json.dumps(jobs))"', {
        cwd: '../QlikHunter',
        maxBuffer: 10 * 1024 * 1024 // 10MB
      }).toString();
      
      const scoutedJobs = JSON.parse(scoutsStdout);
      console.log(`   QlikHunter scouts found ${scoutedJobs.length} raw jobs.`);
      
      const filters = loadFilters();
      const seenUrls = loadSeenUrls();
      const newMatches = [];
      
      for (const job of scoutedJobs) {
        if (!job.url) continue;
        if (seenUrls.has(job.url)) continue;
        
        const titleOk = filters.titleMatches(job.title);
        const locOk = filters.locationMatches(job.location);
        
        // Match title and location
        if (titleOk && locOk) {
          newMatches.push(job);
        }
      }
      
      console.log(`   Filtered scouts down to ${newMatches.length} matching new jobs.`);
      const added = addNewOffers(newMatches);
      console.log(`   Added ${added} new scouted jobs to the pipeline.`);
      
    } catch (err) {
      console.error('❌ Failed to run QlikHunter scouts:', err.message);
    }
  }
  
  // Step 2: Read pending queue from pipeline
  const pendingJobs = readPendingPipeline();
  if (pendingJobs.length === 0) {
    console.log('✅ No pending jobs in pipeline.md to evaluate.');
    return;
  }
  
  console.log(`\n📋 Found ${pendingJobs.length} pending job(s) in pipeline.md to evaluate.`);
  
  const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
  const modelName = process.env.OPENAI_MODEL || 'llama-3.3-70b-versatile';
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.groq.com/openai/v1';
  
  if (!apiKey) {
    console.error('❌ GROQ_API_KEY / OPENAI_API_KEY not found in environment. Exiting.');
    process.exit(1);
  }
  
  const systemPrompt = buildSystemPrompt();
  const matchedJobsToNotify = [];
  
  for (let i = 0; i < pendingJobs.length; i++) {
    const item = pendingJobs[i];
    console.log(`\n[Job ${i + 1}/${pendingJobs.length}] Evaluating ${item.role} @ ${item.company}...`);
    
    let jdText = '';
    try {
      jdText = await fetchJobDescription(item.url);
    } catch (err) {
      console.error(`   ❌ Failed to fetch JD: ${err.message}`);
      continue;
    }
    
    if (!jdText.trim()) {
      console.warn(`   ⚠️ JD text is empty. Skipping.`);
      continue;
    }
    
    // Call LLM for evaluation
    try {
      console.log(`   🤖 Querying LLM (${modelName})...`);
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `JOB DESCRIPTION TO EVALUATE:\n\nURL: ${item.url}\n\n${jdText}` }
          ],
          temperature: 0.2
        })
      });
      
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errText}`);
      }
      
      const resData = await response.json();
      const evaluationText = resData.choices?.[0]?.message?.content?.trim();
      
      if (!evaluationText) {
        throw new Error('Empty response from LLM');
      }
      
      // Parse score summary
      const summaryMatch = evaluationText.match(/(?:---|##)?\s*SCORE_SUMMARY\s*(?:---|##)?\s*([\s\S]*?)(?:---|##)?\s*END_SUMMARY\s*(?:---|##)?/i);
      
      let company = item.company;
      let role = item.role;
      let score = '0';
      let archetype = 'Unknown';
      let legitimacy = 'Unknown';
      let reason = 'No reason provided';
      
      if (summaryMatch) {
        const extract = (key) => {
          const m = summaryMatch[1].match(new RegExp(`${key}:\\s*(.+)`));
          return m ? m[1].trim() : 'Unknown';
        };
        company = extract('COMPANY');
        role = extract('ROLE');
        score = extract('SCORE');
        archetype = extract('ARCHETYPE');
        legitimacy = extract('LEGITIMACY');
        reason = extract('REASON');
      }
      
      const scoreVal = parseFloat(score);
      console.log(`   Score: ${score}/5 | Archetype: ${archetype} | Legitimacy: ${legitimacy}`);
      
      if (dryRun) {
        console.log(`   [DRY RUN] Would save report and process pipeline for score ${score}`);
        if (scoreVal >= 4.0) {
          console.log(`   [DRY RUN] Would notify for ${role} @ ${company}`);
        }
        continue;
      }
      
      // Assign report number & save report
      const num = nextReportNumber();
      const today = new Date().toISOString().split('T')[0];
      const companySlug = company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const filename = `${num}-${companySlug}-${today}.md`;
      
      if (!fs.existsSync('reports')) {
        fs.mkdirSync('reports', { recursive: true });
      }
      
      const reportContent = `# Evaluation: ${company} — ${role}

**Date:** ${today}
**Archetype:** ${archetype}
**Score:** ${score}/5
**Legitimacy:** ${legitimacy}
**PDF:** pending
**Tool:** Groq (${modelName})

---

${evaluationText.replace(/---SCORE_SUMMARY---[\s\S]*?---END_SUMMARY---/, '').trim()}
`;
      
      fs.writeFileSync(`reports/${filename}`, reportContent, 'utf-8');
      console.log(`   ✅ Report saved: reports/${filename}`);
      
      // Save tracker additions
      const tsvLine = `${num}\t${today}\t${company}\t${role}\tEvaluated\t${score}/5\t❌\t[${num}](reports/${filename})\t\n`;
      const tsvFile = `batch/tracker-additions/or-${num}-${companySlug}.tsv`;
      
      fs.mkdirSync('batch/tracker-additions', { recursive: true });
      fs.writeFileSync(tsvFile, tsvLine);
      
      // Mark pipeline processed
      markPipelineProcessed(item, num, score);
      
      // If score is high (>= 4.0), prepare for notification
      if (scoreVal >= 4.0) {
        console.log(`   🎯 High score match! Adding to notifications.`);
        matchedJobsToNotify.push({
          title: role,
          company: company,
          location: item.location || 'Remote',
          source: 'Groq Agent',
          url: item.url,
          eval_reason: reason
        });
      }
      
    } catch (err) {
      console.error(`   ❌ Evaluation failed: ${err.message}`);
    }
  }
  
  if (dryRun) {
    console.log('\n[DRY RUN] Done. No files modified.');
    return;
  }
  
  // Step 3: Run tracker merge
  if (fs.existsSync('batch/tracker-additions') && fs.readdirSync('batch/tracker-additions').length > 0) {
    console.log('\n📥 Merging tracker entries into data/applications.md...');
    try {
      execSync('node merge-tracker.mjs', { stdio: 'inherit' });
    } catch (err) {
      console.error('❌ Failed to run merge-tracker.mjs:', err.message);
    }
  }
  
  // Step 4: Dispatch notifications
  if (matchedJobsToNotify.length > 0) {
    console.log(`\n🔔 Dispatching notifications for ${matchedJobsToNotify.length} job(s)...`);
    const tempJsonPath = 'data/matched_jobs.json';
    try {
      fs.writeFileSync(tempJsonPath, JSON.stringify(matchedJobsToNotify, null, 2));
      execSync(`../QlikHunter/venv/bin/python3 notify.py ${tempJsonPath}`, { stdio: 'inherit' });
      fs.unlinkSync(tempJsonPath);
      console.log('✅ Notifications dispatched.');
    } catch (err) {
      console.error('❌ Failed to send notifications:', err.message);
    }
  } else {
    console.log('\n✅ No high-scoring jobs (>= 4.0) to notify today.');
  }
  
  console.log(`\n==================================================`);
  console.log(`✅ Pipeline automation run complete.`);
  console.log(`==================================================`);
}

run().catch(err => {
  console.error('❌ Fatal error:', err);
});
