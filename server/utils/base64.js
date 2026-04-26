const fs = require('fs');
const path = require('path');

/**
 * Converts a file on disk to a Base64 Data URI and deletes the file.
 * @param {string} filePath - Absolute path to the file.
 * @returns {Promise<string>} - The Base64 Data URI.
 */
const fileToBase64 = async (filePath) => {
    try {
        if (!filePath || !fs.existsSync(filePath)) {
            return null;
        }

        const fileData = fs.readFileSync(filePath);
        const ext = path.extname(filePath).toLowerCase();
        let mimeType = 'image/jpeg';
        
        if (ext === '.png') mimeType = 'image/png';
        else if (ext === '.webp') mimeType = 'image/webp';
        else if (ext === '.gif') mimeType = 'image/gif';
        else if (ext === '.pdf') mimeType = 'application/pdf';
        else if (ext === '.svg') mimeType = 'image/svg+xml';

        const base64 = fileData.toString('base64');
        const dataUri = `data:${mimeType};base64,${base64}`;

        // Cleanup local file
        fs.unlink(filePath, (err) => {
            if (err) console.error(`[Base64] Error deleting temp file ${filePath}:`, err);
        });

        return dataUri;
    } catch (err) {
        console.error('[Base64] Conversion error:', err);
        return null;
    }
};

module.exports = { fileToBase64 };
