const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const logger = require('../helpers/logger');
const { analyzeDesign } = require('../helpers/designAnalyzer');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const preflightDir = path.join(__dirname, '..', 'uploads', 'preflight');
if (!fs.existsSync(preflightDir)) fs.mkdirSync(preflightDir, { recursive: true });

const preflightStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, preflightDir),
  filename: (req, file, cb) => {
    const unique = `preflight-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname).toLowerCase()}`);
  }
});

const preflightUpload = multer({
  storage: preflightStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) return cb(null, true);
    cb(new Error('Invalid file type'));
  }
});

// Validation checks beyond the existing design analyzer
function checkBleedArea(info) {
  const issues = [];
  if (info.widthMM && info.heightMM) {
    const bleedOk = info.widthMM > 0 && info.heightMM > 0;
    if (!bleedOk) {
      issues.push({ type: 'BLEED_CHECK', severity: 'WARNING', message: 'Unable to verify bleed area' });
    }
  }
  return issues;
}

function checkAspectRatio(width, height, expectedRatio, tolerance) {
  if (!width || !height) return [];
  const ratio = width / height;
  const diff = Math.abs(ratio - expectedRatio) / expectedRatio;
  if (diff > tolerance) {
    return [{
      type: 'ASPECT_RATIO',
      severity: 'WARNING',
      message: `Aspect ratio ${ratio.toFixed(2)} differs from expected ${expectedRatio} by ${(diff * 100).toFixed(1)}%`,
      current: ratio.toFixed(2),
      required: expectedRatio.toFixed(2)
    }];
  }
  return [];
}

function checkTransparency(hasAlpha, format) {
  if (hasAlpha && format === 'png') {
    return [{
      type: 'TRANSPARENCY',
      severity: 'WARNING',
      message: 'Image has transparency. Transparency will be rendered as white in print.',
      fix: 'Flatten transparency or add a white background layer'
    }];
  }
  return [];
}

function checkCMYKCompatibility(colorSpace) {
  if (colorSpace && colorSpace !== 'cmyk' && colorSpace !== 'unknown') {
    return [{
      type: 'CMYK_COMPATIBILITY',
      severity: 'CRITICAL',
      message: `${colorSpace.toUpperCase()} color mode detected. CMYK required for commercial printing.`,
      current: colorSpace.toUpperCase(),
      required: 'CMYK',
      fix: 'Convert to CMYK color space in your design software'
    }];
  }
  return [];
}

function checkImageResolution(width, height, dpi) {
  const issues = [];
  const minPixels = 300;
  if (width && width < minPixels) {
    issues.push({
      type: 'LOW_WIDTH', severity: width < 150 ? 'CRITICAL' : 'WARNING',
      message: `Image width ${width}px is below recommended ${minPixels}px`,
      current: `${width}px`, required: `${minPixels}px`
    });
  }
  if (height && height < minPixels) {
    issues.push({
      type: 'LOW_HEIGHT', severity: height < 150 ? 'CRITICAL' : 'WARNING',
      message: `Image height ${height}px is below recommended ${minPixels}px`,
      current: `${height}px`, required: `${minPixels}px`
    });
  }
  if (dpi && dpi < 300) {
    issues.push({
      type: 'LOW_DPI', severity: dpi < 150 ? 'CRITICAL' : 'WARNING',
      message: `Resolution ${dpi} DPI (minimum 300 DPI required)`,
      current: `${dpi} DPI`, required: '300 DPI'
    });
  }
  return issues;
}

function getOverallStatus(issues) {
  const criticals = issues.filter(i => i.severity === 'CRITICAL');
  const warnings = issues.filter(i => i.severity === 'WARNING');
  if (criticals.length > 0) return { status: 'FAIL', label: 'Critical Errors', message: `${criticals.length} critical issue(s) found. Fix before submitting.` };
  if (warnings.length > 0) return { status: 'WARN', label: 'Warnings', message: `${warnings.length} warning(s) found. Review recommended.` };
  return { status: 'PASS', label: 'All Checks Passed', message: 'Design file meets print requirements.' };
}

// POST /api/preflight/check - Run full preflight on uploaded design
router.post('/preflight/check', preflightUpload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const filePath = req.file.path;
  const allIssues = [];

  // 1. Run the existing design analyzer
  let analysis;
  try {
    analysis = await analyzeDesign(filePath);
    if (analysis.issues) allIssues.push(...analysis.issues);
  } catch (err) {
    allIssues.push({ type: 'ANALYSIS_ERROR', severity: 'CRITICAL', message: `Analysis failed: ${err.message}` });
  }

  // 2. Run additional checks
  const info = analysis?.info || {};
  allIssues.push(...checkBleedArea(info));
  allIssues.push(...checkTransparency(info.hasAlpha, info.format));
  allIssues.push(...checkCMYKCompatibility(info.colorSpace));
  allIssues.push(...checkImageResolution(info.width, info.height, info.dpi));

  if (info.width && info.height) {
    allIssues.push(...checkAspectRatio(info.width, info.height, 1.414, 0.3));
  }

  const issues = allIssues.filter((v, i, a) => a.findIndex(t => t.type === v.type && t.severity === v.severity) === i);
  const criticalCount = issues.filter(i => i.severity === 'CRITICAL').length;
  const warningCount = issues.filter(i => i.severity === 'WARNING').length;
  const result = getOverallStatus(issues);

  // Create clean result
  const checkResult = {
    id: uuidv4(),
    file_name: req.file.originalname,
    file_type: analysis?.file_type || path.extname(req.file.originalname).slice(1),
    file_size: req.file.size,
    file_path: `/uploads/preflight/${req.file.filename}`,
    status: result.status,
    label: result.label,
    message: result.message,
    issues,
    critical_count: criticalCount,
    warning_count: warningCount,
    passed: result.status === 'PASS',
    can_submit: result.status !== 'FAIL',
    info: {
      width: info.width,
      height: info.height,
      dpi: info.dpi,
      colorSpace: info.colorSpace,
      format: info.format,
      hasAlpha: info.hasAlpha,
      widthMM: info.widthMM,
      heightMM: info.heightMM
    },
    checked_at: new Date().toISOString()
  };

  // Save to sarga_design_checks
  try {
    await pool.query(
      `INSERT INTO sarga_design_checks (file_name, file_path, file_type, file_size_kb, result_json, passed, total_issues, critical_issues, warnings)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.file.originalname, checkResult.file_path, checkResult.file_type,
       Math.round(req.file.size / 1024), JSON.stringify(checkResult),
       checkResult.passed ? 1 : 0, issues.length, criticalCount, warningCount]
    );
  } catch (err) {
    logger.warn('[Preflight] Failed to save check result:', err.message);
  }

  res.json(checkResult);
}));

// POST /api/preflight/check-url - Check design already uploaded via URL
router.post('/preflight/check-url', asyncHandler(async (req, res) => {
  const { file_url, file_name } = req.body;
  if (!file_url) return res.status(400).json({ error: 'file_url required' });

  // Validate URL to prevent SSRF — only allow common image/CDN hosts
  try {
    const validHosts = [
      'res.cloudinary.com', 'cloudinary.com',
      'images.unsplash.com', 'unsplash.com',
      'i.ibb.co', 'ibb.co',
      'drive.google.com', 'docs.google.com',
      'lh3.googleusercontent.com',
      'storage.googleapis.com',
    ];
    const urlObj = new URL(file_url);
    const hostname = urlObj.hostname.toLowerCase();
    const isAllowed = validHosts.some(h => hostname === h || hostname.endsWith('.' + h));
    const isImageExt = /\.(jpg|jpeg|png|webp|tiff|tif|pdf)$/i.test(urlObj.pathname);
    if (!isAllowed || !isImageExt) {
      return res.status(400).json({ error: 'URL rejected: only image URLs from trusted hosts are allowed' });
    }

    const https = require('https');
    const ext = path.extname(urlObj.pathname) || '.jpg';
    const tempPath = path.join(preflightDir, `url-check-${Date.now()}${ext}`);

    await new Promise((resolve, reject) => {
      const file = fs.createWriteStream(tempPath);
      https.get(file_url, (response) => {
        if (response.statusCode !== 200) { reject(new Error('Download failed')); return; }
        response.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
      }).on('error', reject);
    });

    // Replace the file for analysis
    req.file = { path: tempPath, originalname: file_name || 'remote-file', filename: path.basename(tempPath), size: fs.statSync(tempPath).size };
    // Run analysis via the same logic
    const analysis = await analyzeDesign(tempPath);
    const allIssues = analysis.issues || [];
    const info = analysis.info || {};
    allIssues.push(...checkBleedArea(info));
    allIssues.push(...checkTransparency(info.hasAlpha, info.format));
    allIssues.push(...checkCMYKCompatibility(info.colorSpace));
    allIssues.push(...checkImageResolution(info.width, info.height, info.dpi));

    const issues = allIssues.filter((v, i, a) => a.findIndex(t => t.type === v.type && t.severity === v.severity) === i);
    const criticalCount = issues.filter(i => i.severity === 'CRITICAL').length;
    const result = getOverallStatus(issues);

    res.json({
      file_name: file_name || 'remote-file',
      file_type: analysis.file_type,
      status: result.status, label: result.label, message: result.message,
      issues, critical_count: criticalCount, passed: result.status === 'PASS', can_submit: result.status !== 'FAIL'
    });

    // Clean up temp file
    try { fs.unlinkSync(tempPath); } catch (_ignored) { /* ignored */ }
  } catch (err) {
    res.status(400).json({ error: `Failed to check file: ${err.message}` });
  }
}));

// GET /api/preflight/rules - Get validation rules
router.get('/preflight/rules', asyncHandler(async (req, res) => {
  res.json({
    rules: {
      min_dpi: 300,
      min_image_width: 300,
      min_image_height: 300,
      required_color_mode: 'cmyk',
      min_bleed_mm: 3,
      max_file_size_mb: 50,
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'tiff', 'pdf'],
      aspect_ratio_tolerance: 0.3
    }
  });
}));

module.exports = router;
