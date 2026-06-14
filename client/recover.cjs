const fs = require('fs');
const path = 'C:\\Users\\ANIRUDH\\.gemini\\antigravity-ide\\brain\\af8476e5-785b-42c9-abb8-26be43b706ce\\.system_generated\\logs\\transcript.jsonl';
const lines = fs.readFileSync(path, 'utf8').split('\n');
const callLines = lines.filter(l => l.includes('multi_replace_file_content'));
// We want the PLANNER_RESPONSE that initiated the call.
// That line will contain tool_calls.
let chunks = null;
for (let i = callLines.length - 1; i >= 0; i--) {
  try {
    const obj = JSON.parse(callLines[i]);
    if (obj.tool_calls) {
      const call = obj.tool_calls.find(c => c.name === 'multi_replace_file_content');
      if (call) {
        chunks = call.args.ReplacementChunks;
        break;
      }
    }
  } catch (e) {}
}
if (chunks) {
  fs.writeFileSync('d:\\software_sarga_recovery_chunks.json', chunks);
  console.log('Successfully saved chunks!');
} else {
  console.log('No chunks found!');
}

