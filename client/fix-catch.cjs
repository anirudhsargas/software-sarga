const fs = require('fs');

let code = fs.readFileSync('D:/software sarga/client/src/pages/DailyReport.jsx', 'utf8');

// I replaced catch (err) with catch. I need to replace catch { with catch (err) { or similar.
// Actually, earlier it was catch (err) {
// I will just replace catch { ... err ... }
code = code.replace(/catch\s*\{/g, 'catch (err) {');
code = code.replace(/catch\s+\{/g, 'catch (err) {');

fs.writeFileSync('D:/software sarga/client/src/pages/DailyReport.jsx', code);
console.log('Fixed catch statements');
